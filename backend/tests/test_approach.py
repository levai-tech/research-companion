import sqlite3
import pytest
import httpx

from backend.projects import ProjectService
from backend.main import create_app


@pytest.fixture
def svc(tmp_path):
    return ProjectService(base_dir=tmp_path)


def _make_project(svc):
    return svc.create(title="Test Book", topic="Quantum computing", document_type="book")


@pytest.fixture
def app(tmp_path):
    return create_app(projects_dir=tmp_path)


async def _create_project(client: httpx.AsyncClient) -> str:
    resp = await client.post("/projects", json={
        "title": "Quantum Security",
        "topic": "Quantum computing",
        "document_type": "book",
    })
    assert resp.status_code == 201
    return resp.json()["id"]


_APPROACH = {"title": "The Silent Threat", "description": "How quantum breaks encryption before anyone notices."}


# ── Behavior 4a: save_approach persists and returns an Approach ───────────────

def test_save_approach_returns_approach_with_correct_fields(svc):
    project = _make_project(svc)
    approach = svc.save_approach(project.id, _APPROACH)

    assert approach.title == _APPROACH["title"]
    assert approach.description == _APPROACH["description"]
    assert approach.project_id == project.id
    assert approach.id  # non-empty UUID


# ── Behavior 4b: get_approach retrieves saved approach ────────────────────────

def test_get_approach_returns_saved_approach(svc):
    project = _make_project(svc)
    svc.save_approach(project.id, _APPROACH)

    retrieved = svc.get_approach(project.id)
    assert retrieved is not None
    assert retrieved.title == _APPROACH["title"]
    assert retrieved.description == _APPROACH["description"]


# ── Behavior 4c: save_approach upserts — second save replaces first ───────────

def test_save_approach_replaces_existing(svc):
    project = _make_project(svc)
    svc.save_approach(project.id, _APPROACH)

    updated = {"title": "Revised", "description": "Updated framing."}
    svc.save_approach(project.id, updated)

    retrieved = svc.get_approach(project.id)
    assert retrieved.title == "Revised"
    assert retrieved.description == "Updated framing."


# ── Behavior 4d: get_approach returns None when none saved ────────────────────

def test_get_approach_returns_none_when_no_approach_saved(svc):
    project = _make_project(svc)
    assert svc.get_approach(project.id) is None


# ── Behavior 5a: PATCH /approach saves and returns approach ───────────────────

async def test_patch_approach_saves_and_returns_approach(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        response = await client.patch(
            f"/projects/{project_id}/approach",
            json={"approach": _APPROACH},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == _APPROACH["title"]
    assert body["description"] == _APPROACH["description"]
    assert body["project_id"] == project_id
    assert "id" in body


# ── Behavior 5b: GET /approach returns saved approach ─────────────────────────

async def test_get_approach_returns_saved_approach_via_api(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        await client.patch(f"/projects/{project_id}/approach", json={"approach": _APPROACH})
        response = await client.get(f"/projects/{project_id}/approach")

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == _APPROACH["title"]


# ── Behavior 5c: GET /approach returns null when none saved ───────────────────

async def test_get_approach_returns_null_when_none_saved(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        response = await client.get(f"/projects/{project_id}/approach")

    assert response.status_code == 200
    assert response.json() is None


# ── Behavior 6: transcript table schema exists after _db() call ───────────────

def test_transcript_table_created_by_db(svc, tmp_path):
    project = _make_project(svc)
    svc._db(project.id).close()

    db_path = tmp_path / "projects" / project.id / "db.sqlite"
    con = sqlite3.connect(db_path)
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    con.close()

    assert "transcript" in tables
    assert "approaches" in tables
