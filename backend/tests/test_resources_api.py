import pytest
import httpx
from backend.main import create_app
from backend.projects import ProjectService
from backend.resource_store import ResourceStore


@pytest.fixture
def tmp_app(tmp_path):
    return create_app(projects_dir=tmp_path)


@pytest.fixture
def store(tmp_path):
    return ResourceStore(base_dir=tmp_path)


@pytest.fixture
def project(tmp_path):
    svc = ProjectService(base_dir=tmp_path)
    return svc.create(title="Test Book", topic="Quantum", document_type="book")


# ── Behavior 1: GET /projects/{id}/resources ─────────────────────────────────

async def test_list_resources_returns_empty_for_new_project(tmp_app, project):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/projects/{project.id}/resources")

    assert response.status_code == 200
    assert response.json() == []


async def test_list_resources_returns_attached_resources(tmp_app, project, store):
    resource = store.get_or_create("hash-1", "Book", {"title": "My Book"})
    store.attach(project.id, resource.id)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/projects/{project.id}/resources")

    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["id"] == resource.id
    assert items[0]["resource_type"] == "Book"
    assert items[0]["indexing_status"] == "queued"
    assert items[0]["citation_metadata"]["title"] == "My Book"


async def test_list_resources_returns_404_for_missing_project(tmp_app):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects/no-such-id/resources")

    assert response.status_code == 404


# ── Behavior 2: DELETE /projects/{id}/resources/{res_id} ─────────────────────

async def test_delete_resource_removes_it_from_list(tmp_app, project, store):
    resource = store.get_or_create("hash-2", "Book")
    store.attach(project.id, resource.id)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        delete_resp = await client.delete(
            f"/projects/{project.id}/resources/{resource.id}"
        )
        list_resp = await client.get(f"/projects/{project.id}/resources")

    assert delete_resp.status_code == 200
    assert list_resp.json() == []


async def test_delete_nonexistent_resource_returns_404(tmp_app, project):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete(
            f"/projects/{project.id}/resources/no-such-id"
        )

    assert response.status_code == 404


# ── Behavior 3: GET /projects/{id}/resources/{res_id}/status ─────────────────

async def test_get_status_includes_current_step(tmp_app, project, store):
    resource = store.get_or_create("hash-step-api", "Book")
    store.attach(project.id, resource.id)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            f"/projects/{project.id}/resources/{resource.id}/status"
        )

    assert response.status_code == 200
    body = response.json()
    assert "current_step" in body
    assert body["current_step"] is None


async def test_get_status_current_step_reflects_update_step(tmp_app, project, store):
    resource = store.get_or_create("hash-step-api2", "Book")
    store.attach(project.id, resource.id)
    store.update_step(resource.id, "extracting")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            f"/projects/{project.id}/resources/{resource.id}/status"
        )

    assert response.status_code == 200
    assert response.json()["current_step"] == "extracting"


async def test_get_status_includes_fallback_counters(tmp_app, project, store):
    resource = store.get_or_create("hash-batches-api", "Book")
    store.attach(project.id, resource.id)
    store.update_batches(resource.id, batches_total=4, batches_fallback=2)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            f"/projects/{project.id}/resources/{resource.id}/status"
        )

    assert response.status_code == 200
    body = response.json()
    assert body["batches_total"] == 4
    assert body["batches_fallback"] == 2


# ── Behavior 4: POST /projects/{id}/resources/{res_id}/reingest ──────────────

async def test_reingest_returns_202_and_resets_to_queued(tmp_app, project, store):
    resource = store.get_or_create("hash-reingest-api", "Book")
    store.attach(project.id, resource.id)
    store.set_source_ref(resource.id, "book.pdf")
    store.update_status(resource.id, "ready")
    store.update_batches(resource.id, batches_total=4, batches_fallback=2)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/projects/{project.id}/resources/{resource.id}/reingest",
            json={"mode": "recursive"},
        )

    assert response.status_code == 202
    status = store.get_status(resource.id)
    assert status["indexing_status"] == "queued"
    assert status["batches_total"] == 0
    assert status["batches_fallback"] == 0


async def test_reingest_returns_404_for_unknown_resource(tmp_app, project):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/projects/{project.id}/resources/no-such-id/reingest",
            json={"mode": "recursive"},
        )

    assert response.status_code == 404


# ── Upload size cap ───────────────────────────────────────────────────────────

async def test_file_upload_exceeding_size_limit_returns_413(tmp_app, project):
    """Files over MAX_UPLOAD_BYTES are rejected with 413 before ingestion."""
    import backend.main as main_mod
    original = main_mod.MAX_UPLOAD_BYTES
    main_mod.MAX_UPLOAD_BYTES = 1024  # shrink to 1 KB for test
    try:
        content = b"x" * 1025
        transport = httpx.ASGITransport(app=tmp_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/projects/{project.id}/resources/file",
                files={"file": ("large.txt", content, "text/plain")},
                data={"resource_type": "Book"},
            )
        assert response.status_code == 413
    finally:
        main_mod.MAX_UPLOAD_BYTES = original
