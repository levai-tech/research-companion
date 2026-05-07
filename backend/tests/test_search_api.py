import pytest
import httpx
from backend.main import create_app
from backend.projects import ProjectService
from backend.resource_store import ResourceStore


class FakeEmbedder:
    id = "fake-v0"
    DIM = 384

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[float(i % 10) / 10 for i in range(self.DIM)] for _ in texts]


@pytest.fixture
def fake_embedder():
    return FakeEmbedder()


@pytest.fixture
def tmp_app(tmp_path, fake_embedder):
    return create_app(projects_dir=tmp_path, embedder=fake_embedder)


@pytest.fixture
def store(tmp_path):
    return ResourceStore(base_dir=tmp_path)


@pytest.fixture
def project(tmp_path):
    svc = ProjectService(base_dir=tmp_path)
    return svc.create(title="Test Book", topic="Quantum", document_type="book")


# ── Behavior 1: tracer bullet ─────────────────────────────────────────────────

async def test_search_returns_chunk_from_ready_resource(tmp_app, project, store, fake_embedder):
    resource = store.get_or_create("hash-1", "Book", {"title": "Quantum Book", "authors": ["Alice"]})
    chunks = ["Quantum entanglement is a phenomenon where particles become correlated."]
    embeddings = fake_embedder.embed(chunks)
    store.store_chunks_and_embeddings(resource.id, chunks, embeddings, "test-chunker", fake_embedder.id)
    store.attach(project.id, resource.id)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            f"/projects/{project.id}/resources/search",
            params={"q": "quantum physics", "top_k": 5},
        )

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["chunk_text"] == chunks[0]
    assert "score" in results[0]
    assert results[0]["citation_metadata"]["title"] == "Quantum Book"
    assert results[0]["resource_type"] == "Book"


# ── Behavior 1b: re-indexing does not duplicate results ──────────────────────

async def test_search_does_not_return_duplicates_after_reindex(tmp_app, project, store, fake_embedder):
    resource = store.get_or_create("hash-dup", "Book", {"title": "Reindexed Book"})
    chunks = ["The only chunk."]
    embeddings = fake_embedder.embed(chunks)
    store.store_chunks_and_embeddings(resource.id, chunks, embeddings, "c", fake_embedder.id)
    store.store_chunks_and_embeddings(resource.id, chunks, embeddings, "c", fake_embedder.id)
    store.attach(project.id, resource.id)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            f"/projects/{project.id}/resources/search",
            params={"q": "chunk", "top_k": 10},
        )

    results = response.json()["results"]
    assert len(results) == 1


# ── Behavior 2: non-ready resources excluded ──────────────────────────────────

async def test_search_excludes_non_ready_resources(tmp_app, project, store, fake_embedder):
    resource = store.get_or_create("hash-2", "Book", {"title": "Unindexed Book"})
    # resource stays in 'queued' status — never store_chunks_and_embeddings
    store.attach(project.id, resource.id)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            f"/projects/{project.id}/resources/search",
            params={"q": "quantum", "top_k": 5},
        )

    assert response.status_code == 200
    assert response.json()["results"] == []


# ── Behavior 4: empty results when no ready resources ─────────────────────────

async def test_search_returns_empty_when_project_has_no_resources(tmp_app, project):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            f"/projects/{project.id}/resources/search",
            params={"q": "anything", "top_k": 5},
        )

    assert response.status_code == 200
    assert response.json()["results"] == []


# ── Behavior 5: top_k limits result count ────────────────────────────────────

async def test_search_top_k_limits_results(tmp_app, project, store, fake_embedder):
    resource = store.get_or_create("hash-5", "Book", {"title": "Dense Book"})
    chunks = [f"Chunk number {i}." for i in range(10)]
    store.store_chunks_and_embeddings(resource.id, chunks, fake_embedder.embed(chunks), "c", fake_embedder.id)
    store.attach(project.id, resource.id)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            f"/projects/{project.id}/resources/search",
            params={"q": "chunk", "top_k": 3},
        )

    assert response.status_code == 200
    assert len(response.json()["results"]) == 3


# ── Behavior 3: cross-project isolation ───────────────────────────────────────

async def test_search_is_scoped_to_project(tmp_app, tmp_path, store, fake_embedder):
    svc = ProjectService(base_dir=tmp_path)
    project_a = svc.create(title="Project A", topic="Quantum", document_type="book")
    project_b = svc.create(title="Project B", topic="Quantum", document_type="book")

    resource = store.get_or_create("hash-3", "Book", {"title": "Shared Book"})
    chunks = ["Only in project A."]
    store.store_chunks_and_embeddings(resource.id, chunks, fake_embedder.embed(chunks), "c", fake_embedder.id)
    store.attach(project_a.id, resource.id)
    # resource NOT attached to project_b

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            f"/projects/{project_b.id}/resources/search",
            params={"q": "only in project A", "top_k": 5},
        )

    assert response.status_code == 200
    assert response.json()["results"] == []
