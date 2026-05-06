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
        theme="Accessibility of complex tech",
        angle="The human cost of ignoring quantum-resistant encryption",
        document_type="book",
        layout_id="three-act",
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
    project = _make_project(svc, title="My Essay", document_type="essay", layout_id="classic")

    assert project.title == "My Essay"
    assert project.topic == "Quantum computing"
    assert project.theme == "Accessibility of complex tech"
    assert project.angle == "The human cost of ignoring quantum-resistant encryption"
    assert project.document_type == "essay"
    assert project.layout_id == "classic"
    assert project.id  # non-empty UUID
    assert project.last_modified  # non-empty ISO timestamp


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
    original = _make_project(svc, title="Deep Dive", document_type="article", layout_id="inverted-pyramid")

    listed = svc.list()[0]
    assert listed.id == original.id
    assert listed.title == "Deep Dive"
    assert listed.document_type == "article"
    assert listed.layout_id == "inverted-pyramid"
    assert listed.last_modified == original.last_modified


# ── Behavior 3 & 4: API endpoints ─────────────────────────────────────────────

@pytest.fixture
def app(tmp_path):
    return create_app(projects_dir=tmp_path)


_CREATE_BODY = dict(
    title="Deep Dive",
    topic="Quantum computing",
    theme="Accessibility of complex tech",
    angle="The human cost of ignoring quantum-resistant encryption",
    document_type="book",
    layout_id="three-act",
)


async def test_post_projects_creates_and_returns_project(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/projects", json=_CREATE_BODY)

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Deep Dive"
    assert body["document_type"] == "book"
    assert body["layout_id"] == "three-act"
    assert "id" in body
    assert "last_modified" in body


async def test_get_projects_returns_created_project(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/projects", json=_CREATE_BODY)
        response = await client.get("/projects")

    assert response.status_code == 200
    projects = response.json()
    assert len(projects) == 1
    assert projects[0]["title"] == "Deep Dive"
