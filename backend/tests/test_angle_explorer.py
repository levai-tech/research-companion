import pytest
import httpx
from unittest.mock import AsyncMock, patch

from backend.main import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(projects_dir=tmp_path)


async def _create_project(client: httpx.AsyncClient) -> str:
    resp = await client.post("/projects", json={
        "title": "Quantum Security",
        "topic": "Quantum computing",
        "theme": "The hidden cost of ignoring quantum threats",
        "angle": "Human impact",
        "document_type": "book",
        "layout_id": "three-act",
    })
    assert resp.status_code == 201
    return resp.json()["id"]


_MOCK_ANGLES = [
    {"title": "The Clock Is Ticking", "description": "How quantum computers will crack today's encryption within a decade."},
    {"title": "Ordinary People, Extraordinary Risk", "description": "What average internet users stand to lose."},
    {"title": "The Quantum Arms Race", "description": "Nation-state competition for quantum supremacy."},
]


# ── Behavior 1: propose returns angles with title and description ─────────────

async def test_propose_returns_angles_with_title_and_description(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)

        with patch("backend.angle_explorer.call_llm", new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _MOCK_ANGLES
            response = await client.post(
                f"/projects/{project_id}/angles/propose",
                json={"topic": "Quantum computing", "document_type": "book"},
            )

    assert response.status_code == 200
    angles = response.json()
    assert len(angles) == 3
    assert angles[0]["title"] == "The Clock Is Ticking"
    assert angles[0]["description"] == "How quantum computers will crack today's encryption within a decade."


# ── Behavior 2: propose uses angle_explorer role from Model Router ────────────

async def test_propose_routes_via_angle_explorer_role(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)

        with patch("backend.angle_explorer.call_llm", new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _MOCK_ANGLES
            await client.post(
                f"/projects/{project_id}/angles/propose",
                json={"topic": "Quantum computing", "document_type": "book"},
            )

    mock_llm.assert_awaited_once()
    _, kwargs = mock_llm.call_args
    assert kwargs.get("role") == "angle_explorer" or mock_llm.call_args.args[2:] == ("angle_explorer",)


# ── Behavior 3: PATCH persists only accepted angles ───────────────────────────

async def test_patch_persists_accepted_angles(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)

        angles_to_save = [
            {"title": "The Clock Is Ticking", "description": "Encryption at risk.", "status": "accepted"},
            {"title": "Rejected Angle", "description": "Not chosen.", "status": "rejected"},
        ]
        response = await client.patch(
            f"/projects/{project_id}/angles",
            json={"angles": angles_to_save},
        )

    assert response.status_code == 200
    saved = response.json()
    assert len(saved) == 1
    assert saved[0]["title"] == "The Clock Is Ticking"
    assert saved[0]["status"] == "accepted"


# ── Behavior 4: GET returns stored angles for a project ───────────────────────

async def test_get_returns_stored_angles(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)

        await client.patch(
            f"/projects/{project_id}/angles",
            json={"angles": [
                {"title": "The Clock Is Ticking", "description": "Encryption at risk.", "status": "accepted"},
            ]},
        )

        response = await client.get(f"/projects/{project_id}/angles")

    assert response.status_code == 200
    angles = response.json()
    assert len(angles) == 1
    assert angles[0]["title"] == "The Clock Is Ticking"
