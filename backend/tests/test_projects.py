import pytest
import httpx
from backend.projects import ProjectService
from backend.main import create_app


@pytest.fixture
def svc(tmp_path):
    return ProjectService(base_dir=tmp_path)


def _make_project(svc, **overrides):
    defaults = dict(
        title="Test Book",
        topic="Quantum computing",
        document_type="book",
    )
    return svc.create(**{**defaults, **overrides})


# ── Behavior 1: create ────────────────────────────────────────────────────────

def test_create_makes_project_dir_with_db_and_sources(svc, tmp_path):
    project = _make_project(svc)

    project_dir = tmp_path / "projects" / project.id
    assert project_dir.is_dir()
    assert (project_dir / "db.sqlite").is_file()
    assert (project_dir / "sources").is_dir()


def test_create_returns_project_with_correct_metadata(svc):
    project = _make_project(svc, title="My Essay", document_type="essay")

    assert project.title == "My Essay"
    assert project.topic == "Quantum computing"
    assert project.document_type == "essay"
    assert project.id  # non-empty UUID
    assert project.last_modified  # non-empty ISO timestamp
    assert not hasattr(project, "theme")
    assert not hasattr(project, "angle")
    assert not hasattr(project, "layout_id")


# ── Behavior 2: list ──────────────────────────────────────────────────────────

def test_list_returns_empty_when_no_projects_exist(svc):
    assert svc.list() == []


def test_list_returns_all_created_projects(svc):
    p1 = _make_project(svc, title="Book One", document_type="book")
    p2 = _make_project(svc, title="Essay One", document_type="essay")

    projects = svc.list()
    ids = {p.id for p in projects}
    assert p1.id in ids
    assert p2.id in ids
    titles = {p.title for p in projects}
    assert titles == {"Book One", "Essay One"}


def test_list_preserves_metadata(svc):
    original = _make_project(svc, title="Deep Dive", document_type="article")

    listed = svc.list()[0]
    assert listed.id == original.id
    assert listed.title == "Deep Dive"
    assert listed.document_type == "article"
    assert listed.last_modified == original.last_modified


# ── Behavior 3 & 4: API endpoints ─────────────────────────────────────────────

@pytest.fixture
def app(tmp_path):
    return create_app(projects_dir=tmp_path)


_CREATE_BODY = dict(
    title="Deep Dive",
    topic="Quantum computing",
    document_type="book",
)


async def test_post_projects_creates_and_returns_project(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/projects", json=_CREATE_BODY)

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Deep Dive"
    assert body["document_type"] == "book"
    assert "id" in body
    assert "last_modified" in body
    assert "theme" not in body
    assert "angle" not in body
    assert "layout_id" not in body


async def test_get_projects_returns_created_project(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/projects", json=_CREATE_BODY)
        response = await client.get("/projects")

    assert response.status_code == 200
    projects = response.json()
    assert len(projects) == 1
    assert projects[0]["title"] == "Deep Dive"
    assert "theme" not in projects[0]
    assert "angle" not in projects[0]
    assert "layout_id" not in projects[0]


# ── Behavior 5: PATCH /projects/{id} — update title ──────────────────────────

async def test_patch_project_updates_title(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_resp = await client.post("/projects", json=_CREATE_BODY)
        project_id = create_resp.json()["id"]

        patch_resp = await client.patch(f"/projects/{project_id}", json={"title": "Renamed Title"})

    assert patch_resp.status_code == 200
    body = patch_resp.json()
    assert body["id"] == project_id
    assert body["title"] == "Renamed Title"


async def test_patch_project_returns_404_for_missing_project(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch("/projects/nonexistent-id", json={"title": "New Title"})

    assert response.status_code == 404
