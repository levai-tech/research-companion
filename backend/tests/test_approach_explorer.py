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
        "document_type": "book",
    })
    assert resp.status_code == 201
    return resp.json()["id"]


_MOCK_APPROACHES = [
    {"title": "The Clock Is Ticking", "description": "How quantum computers will crack today's encryption within a decade."},
    {"title": "Ordinary People, Extraordinary Risk", "description": "What average internet users stand to lose."},
    {"title": "The Quantum Arms Race", "description": "Nation-state competition for quantum supremacy."},
]


# ── Behavior 1: propose returns approaches with title and description ──────────

async def test_propose_returns_approaches_with_title_and_description(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)

        with patch("backend.angle_explorer.call_llm", new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _MOCK_APPROACHES
            response = await client.post(
                f"/projects/{project_id}/approaches/propose",
                json={"topic": "Quantum computing", "document_type": "book"},
            )

    assert response.status_code == 200
    approaches = response.json()
    assert len(approaches) == 3
    assert approaches[0]["title"] == "The Clock Is Ticking"
    assert approaches[0]["description"] == "How quantum computers will crack today's encryption within a decade."


# ── Behavior 2: propose uses approach_explorer role from Model Router ──────────

async def test_propose_routes_via_approach_explorer_role(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)

        with patch("backend.angle_explorer.call_llm", new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _MOCK_APPROACHES
            await client.post(
                f"/projects/{project_id}/approaches/propose",
                json={"topic": "Quantum computing", "document_type": "book"},
            )

    mock_llm.assert_awaited_once()
    _, kwargs = mock_llm.call_args
    assert kwargs.get("role") == "approach_explorer" or mock_llm.call_args.args[2:] == ("approach_explorer",)
