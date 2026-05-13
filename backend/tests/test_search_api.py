import pytest
import httpx
from backend.main import create_app
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


# ── Behavior 1: tracer bullet ─────────────────────────────────────────────────

async def test_search_returns_chunk_from_ready_resource(tmp_app, store, fake_embedder):
    resource = store.get_or_create("hash-1", "Book", {"title": "Quantum Book", "authors": ["Alice"]})
    chunks = ["Quantum entanglement is a phenomenon where particles become correlated."]
    embeddings = fake_embedder.embed(chunks)
    store.store_chunks_and_embeddings(resource.id, chunks, embeddings, "test-chunker", fake_embedder.id)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/resources/search",
            params={"q": "quantum physics", "top_k": 5},
        )

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["chunk_text"] == chunks[0]
    assert "score" in results[0]
    assert results[0]["citation_metadata"]["title"] == "Quantum Book"
    assert results[0]["resource_type"] == "Book"


# ── Behavior 2: re-indexing does not duplicate results ───────────────────────

async def test_search_does_not_return_duplicates_after_reindex(tmp_app, store, fake_embedder):
    resource = store.get_or_create("hash-dup", "Book", {"title": "Reindexed Book"})
    chunks = ["The only chunk."]
    embeddings = fake_embedder.embed(chunks)
    store.store_chunks_and_embeddings(resource.id, chunks, embeddings, "c", fake_embedder.id)
    store.store_chunks_and_embeddings(resource.id, chunks, embeddings, "c", fake_embedder.id)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/resources/search",
            params={"q": "chunk", "top_k": 10},
        )

    results = response.json()["results"]
    assert len(results) == 1


# ── Behavior 3: non-ready resources excluded ─────────────────────────────────

async def test_search_excludes_non_ready_resources(tmp_app, store):
    store.get_or_create("hash-2", "Book", {"title": "Unindexed Book"})
    # resource stays queued — never stored chunks/embeddings

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/resources/search",
            params={"q": "quantum", "top_k": 5},
        )

    assert response.status_code == 200
    assert response.json()["results"] == []


# ── Behavior 4: empty results when no resources ──────────────────────────────

async def test_search_returns_empty_when_no_resources(tmp_app):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/resources/search",
            params={"q": "anything", "top_k": 5},
        )

    assert response.status_code == 200
    assert response.json()["results"] == []


# ── Behavior 5: top_k limits result count ────────────────────────────────────

async def test_search_top_k_limits_results(tmp_app, store, fake_embedder):
    resource = store.get_or_create("hash-5", "Book", {"title": "Dense Book"})
    chunks = [f"Chunk number {i}." for i in range(10)]
    store.store_chunks_and_embeddings(resource.id, chunks, fake_embedder.embed(chunks), "c", fake_embedder.id)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/resources/search",
            params={"q": "chunk", "top_k": 3},
        )

    assert response.status_code == 200
    assert len(response.json()["results"]) == 3


# ── Behavior 6: location included in results ─────────────────────────────────

async def test_search_result_includes_location_when_chunk_has_location(tmp_app, store, fake_embedder):
    resource = store.get_or_create("hash-6", "Book", {"title": "Paged Book"})
    chunks = ["A chunk with a page reference."]
    embeddings = fake_embedder.embed(chunks)
    store.store_chunks_and_embeddings(resource.id, chunks, embeddings, "c", fake_embedder.id, locations=["p. 12"])

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/resources/search",
            params={"q": "page reference", "top_k": 5},
        )

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["location"] == "p. 12"


# ── Behavior 7: location is null when chunk has no location ──────────────────

async def test_search_result_location_is_null_when_chunk_has_no_location(tmp_app, store, fake_embedder):
    resource = store.get_or_create("hash-7", "Book", {"title": "Unlabelled Book"})
    chunks = ["A chunk without a page reference."]
    store.store_chunks_and_embeddings(resource.id, chunks, fake_embedder.embed(chunks), "c", fake_embedder.id)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/resources/search",
            params={"q": "page reference", "top_k": 5},
        )

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["location"] is None


# ── Behavior 8: search is global — no project scoping ────────────────────────

async def test_search_returns_results_from_all_resources(tmp_app, store, fake_embedder):
    r1 = store.get_or_create("hash-g1", "Book", {"title": "Book A"})
    r2 = store.get_or_create("hash-g2", "Book", {"title": "Book B"})
    for r in (r1, r2):
        chunks = ["Global content."]
        store.store_chunks_and_embeddings(r.id, chunks, fake_embedder.embed(chunks), "c", fake_embedder.id)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/resources/search",
            params={"q": "global content", "top_k": 10},
        )

    assert response.status_code == 200
    assert len(response.json()["results"]) == 2
