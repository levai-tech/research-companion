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
