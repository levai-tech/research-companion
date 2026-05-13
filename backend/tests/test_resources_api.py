import pytest
import httpx
from backend.main import create_app
from backend.resource_store import ResourceStore


@pytest.fixture
def tmp_app(tmp_path):
    return create_app(projects_dir=tmp_path)


@pytest.fixture
def store(tmp_path):
    return ResourceStore(base_dir=tmp_path)


# ── Behavior 1: GET /resources ────────────────────────────────────────────────

async def test_list_resources_returns_empty_initially(tmp_app):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/resources")

    assert response.status_code == 200
    assert response.json() == []


async def test_list_resources_returns_all_resources(tmp_app, store):
    resource = store.get_or_create("hash-1", "Book", {"title": "My Book"})

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/resources")

    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["id"] == resource.id
    assert items[0]["resource_type"] == "Book"
    assert items[0]["indexing_status"] == "queued"
    assert items[0]["citation_metadata"]["title"] == "My Book"


# ── Behavior 2: POST /resources/file ─────────────────────────────────────────

async def test_file_upload_returns_202_without_project_id(tmp_app):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/resources/file",
            files={"file": ("book.txt", b"sample content", "text/plain")},
            data={"resource_type": "Book"},
        )

    assert response.status_code == 202


async def test_file_upload_resource_appears_in_list(tmp_app):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            "/resources/file",
            files={"file": ("book.txt", b"sample content", "text/plain")},
            data={"resource_type": "Book"},
        )
        list_resp = await client.get("/resources")

    assert len(list_resp.json()) == 1


async def test_file_upload_exceeding_size_limit_returns_413(tmp_app):
    import backend.main as main_mod
    original = main_mod.MAX_UPLOAD_BYTES
    main_mod.MAX_UPLOAD_BYTES = 1024
    try:
        transport = httpx.ASGITransport(app=tmp_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/resources/file",
                files={"file": ("large.txt", b"x" * 1025, "text/plain")},
                data={"resource_type": "Book"},
            )
        assert response.status_code == 413
    finally:
        main_mod.MAX_UPLOAD_BYTES = original


# ── Behavior 3: POST /resources/url ──────────────────────────────────────────

async def test_url_upload_returns_202_without_project_id(tmp_app):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/resources/url",
            json={"url": "https://example.com/article"},
        )

    assert response.status_code == 202


async def test_url_upload_resource_appears_in_list(tmp_app):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            "/resources/url",
            json={"url": "https://example.com/article"},
        )
        list_resp = await client.get("/resources")

    assert len(list_resp.json()) == 1


# ── Behavior 4: DELETE /resources/{id} ───────────────────────────────────────

async def test_delete_resource_removes_it(tmp_app, store):
    resource = store.get_or_create("hash-del", "Book")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        delete_resp = await client.delete(f"/resources/{resource.id}")
        list_resp = await client.get("/resources")

    assert delete_resp.status_code == 200
    assert list_resp.json() == []


async def test_delete_nonexistent_resource_returns_404(tmp_app):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete("/resources/no-such-id")

    assert response.status_code == 404


# ── Behavior 5: GET /resources/{id}/status ───────────────────────────────────

async def test_get_status_includes_current_step(tmp_app, store):
    resource = store.get_or_create("hash-status", "Book")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/resources/{resource.id}/status")

    assert response.status_code == 200
    body = response.json()
    assert "current_step" in body
    assert body["current_step"] is None


async def test_get_status_current_step_reflects_update_step(tmp_app, store):
    resource = store.get_or_create("hash-step-api", "Book")
    store.update_step(resource.id, "extracting")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/resources/{resource.id}/status")

    assert response.status_code == 200
    assert response.json()["current_step"] == "extracting"


async def test_get_status_includes_fallback_counters(tmp_app, store):
    resource = store.get_or_create("hash-batches-api", "Book")
    store.update_batches(resource.id, batches_total=4, batches_fallback=2)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/resources/{resource.id}/status")

    assert response.status_code == 200
    body = response.json()
    assert body["batches_total"] == 4
    assert body["batches_fallback"] == 2


# ── Behavior 6: POST /resources/{id}/reingest ────────────────────────────────

async def test_reingest_returns_202_and_resets_to_queued(tmp_app, store):
    resource = store.get_or_create("hash-reingest-api", "Book")
    store.set_source_ref(resource.id, "book.pdf")
    store.update_status(resource.id, "ready")
    store.update_batches(resource.id, batches_total=4, batches_fallback=2)

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/resources/{resource.id}/reingest",
            json={"mode": "recursive"},
        )

    assert response.status_code == 202
    status = store.get_status(resource.id)
    assert status["indexing_status"] == "queued"
    assert status["batches_total"] == 0
    assert status["batches_fallback"] == 0


async def test_reingest_returns_404_for_unknown_resource(tmp_app):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/resources/no-such-id/reingest",
            json={"mode": "recursive"},
        )

    assert response.status_code == 404


# ── Behavior 7: resource-project attachments ─────────────────────────────────

async def _make_project(client) -> str:
    resp = await client.post("/projects", json={"title": "P", "topic": "T", "document_type": "book"})
    return resp.json()["id"]


async def test_list_resources_includes_empty_project_ids(tmp_app, store):
    store.get_or_create("hash-proj-ids", "Book")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/resources")

    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["project_ids"] == []


async def test_attach_resource_to_project_returns_200(tmp_app, store):
    resource = store.get_or_create("hash-attach", "Book")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _make_project(client)
        response = await client.post(f"/resources/{resource.id}/projects/{project_id}")

    assert response.status_code == 200


async def test_attach_to_nonexistent_project_returns_404(tmp_app, store):
    resource = store.get_or_create("hash-attach-404", "Book")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(f"/resources/{resource.id}/projects/no-such-project")

    assert response.status_code == 404


async def test_attach_nonexistent_resource_returns_404(tmp_app):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _make_project(client)
        response = await client.post(f"/resources/no-such-resource/projects/{project_id}")

    assert response.status_code == 404


async def test_attach_is_idempotent(tmp_app, store):
    resource = store.get_or_create("hash-idempotent", "Book")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _make_project(client)
        await client.post(f"/resources/{resource.id}/projects/{project_id}")
        response = await client.post(f"/resources/{resource.id}/projects/{project_id}")

    assert response.status_code == 200


async def test_project_ids_populated_after_attach(tmp_app, store):
    resource = store.get_or_create("hash-pid-after", "Book")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _make_project(client)
        await client.post(f"/resources/{resource.id}/projects/{project_id}")
        list_resp = await client.get("/resources")

    items = list_resp.json()
    resource_item = next(i for i in items if i["id"] == resource.id)
    assert resource_item["project_ids"] == [project_id]


# ── Behavior 9: detach ────────────────────────────────────────────────────────

async def test_detach_resource_from_project_returns_204(tmp_app, store):
    resource = store.get_or_create("hash-detach", "Book")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _make_project(client)
        await client.post(f"/resources/{resource.id}/projects/{project_id}")
        response = await client.delete(f"/resources/{resource.id}/projects/{project_id}")

    assert response.status_code == 204


async def test_detach_when_not_attached_returns_404(tmp_app, store):
    resource = store.get_or_create("hash-detach-404", "Book")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _make_project(client)
        response = await client.delete(f"/resources/{resource.id}/projects/{project_id}")

    assert response.status_code == 404


async def test_project_ids_empty_after_detach(tmp_app, store):
    resource = store.get_or_create("hash-detach-ids", "Book")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _make_project(client)
        await client.post(f"/resources/{resource.id}/projects/{project_id}")
        await client.delete(f"/resources/{resource.id}/projects/{project_id}")
        list_resp = await client.get("/resources")

    items = list_resp.json()
    resource_item = next(i for i in items if i["id"] == resource.id)
    assert resource_item["project_ids"] == []


# ── Behavior 10: GET /projects/{pid}/resources ────────────────────────────────

async def test_project_resources_returns_attached_resources(tmp_app, store):
    r1 = store.get_or_create("hash-proj-r1", "Book")
    r2 = store.get_or_create("hash-proj-r2", "Article")

    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _make_project(client)
        await client.post(f"/resources/{r1.id}/projects/{project_id}")
        response = await client.get(f"/projects/{project_id}/resources")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert len(body["resources"]) == 1
    assert body["resources"][0]["id"] == r1.id


async def test_project_resources_returns_404_for_missing_project(tmp_app):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects/no-such-project/resources")

    assert response.status_code == 404


# ── Behavior 8: old file-upload project-scoped route is gone ─────────────────

async def test_old_file_upload_route_is_gone(tmp_app):
    transport = httpx.ASGITransport(app=tmp_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/proj-1/resources/file",
            files={"file": ("f.txt", b"data", "text/plain")},
        )

    assert response.status_code == 404
