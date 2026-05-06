import pytest
import httpx

from backend.main import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(projects_dir=tmp_path)


async def _create_project(client: httpx.AsyncClient) -> str:
    resp = await client.post("/projects", json={
        "title": "The Quantum Threat",
        "topic": "Quantum computing",
        "theme": "Hidden costs",
        "angle": "Human impact",
        "document_type": "book",
        "layout_id": "three-act",
    })
    assert resp.status_code == 201
    return resp.json()["id"]


# ── Behavior 1: GET returns a default doc seeded with the project title ────────

@pytest.mark.anyio
async def test_get_document_returns_default_doc_with_project_title(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        resp = await client.get(f"/projects/{project_id}/document")

    assert resp.status_code == 200
    doc = resp.json()
    assert doc["type"] == "doc"
    heading = doc["content"][0]
    assert heading["type"] == "heading"
    assert heading["attrs"]["level"] == 1
    assert heading["content"][0]["text"] == "The Quantum Threat"


# ── Behavior 2: PUT saves content; subsequent GET returns the saved content ────

@pytest.mark.anyio
async def test_put_document_saves_and_get_returns_it(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)

        payload = {
            "type": "doc",
            "content": [
                {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "My saved title"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": "First paragraph."}]},
            ],
        }
        put_resp = await client.put(f"/projects/{project_id}/document", json=payload)
        assert put_resp.status_code == 204

        get_resp = await client.get(f"/projects/{project_id}/document")
        assert get_resp.status_code == 200
        assert get_resp.json() == payload
