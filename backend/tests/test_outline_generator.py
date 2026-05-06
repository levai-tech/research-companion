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


async def _save_angles(client: httpx.AsyncClient, project_id: str) -> None:
    await client.patch(
        f"/projects/{project_id}/angles",
        json={"angles": [
            {"title": "The Clock Is Ticking", "description": "Encryption at risk.", "status": "accepted"},
            {"title": "Ordinary People", "description": "What users stand to lose.", "status": "accepted"},
        ]},
    )


_MOCK_STRUCTURES = [
    {"id": "chronological", "title": "Chronological", "rationale": "Traces the story from past to present.", "tradeoff": "Easier to follow but may bury the most urgent point."},
    {"id": "thematic", "title": "Thematic", "rationale": "Groups chapters by theme rather than time.", "tradeoff": "More flexible but can feel disconnected."},
    {"id": "problem-solution", "title": "Problem → Solution", "rationale": "Opens with the threat, closes with the fix.", "tradeoff": "Clear stakes but risks feeling formulaic."},
]

_MOCK_SECTIONS = [
    {
        "title": "The Ticking Clock",
        "description": "Introduces the quantum threat timeline.",
        "subsections": [
            {"title": "What Quantum Computers Can Do Today", "description": "Current capabilities overview."},
            {"title": "The 10-Year Horizon", "description": "When encryption breaks down."},
        ],
    },
    {
        "title": "Ordinary People at Risk",
        "description": "Makes the threat personal.",
        "subsections": [
            {"title": "Your Bank Account", "description": "Financial data exposure."},
        ],
    },
]


# ── Behavior 1: POST /outline/structures returns 2-3 structures with shape ────

async def test_propose_structures_returns_structures_with_title_rationale_tradeoff(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        await _save_angles(client, project_id)

        with patch("backend.outline_generator.propose_structures", new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _MOCK_STRUCTURES
            response = await client.post(f"/projects/{project_id}/outline/structures")

    assert response.status_code == 200
    structures = response.json()
    assert len(structures) == 3
    assert structures[0]["id"] == "chronological"
    assert structures[0]["title"] == "Chronological"
    assert "rationale" in structures[0]
    assert "tradeoff" in structures[0]


# ── Behavior 2: POST /outline/generate returns sections with subsections ──────

async def test_generate_outline_returns_sections_with_subsections(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        await _save_angles(client, project_id)

        with patch("backend.outline_generator.generate_outline", new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _MOCK_SECTIONS
            response = await client.post(
                f"/projects/{project_id}/outline/generate",
                json={"structure": _MOCK_STRUCTURES[0]},
            )

    assert response.status_code == 200
    body = response.json()
    assert "structure" in body
    assert "sections" in body
    sections = body["sections"]
    assert len(sections) == 2
    assert sections[0]["title"] == "The Ticking Clock"
    assert len(sections[0]["subsections"]) == 2
    assert sections[0]["subsections"][0]["title"] == "What Quantum Computers Can Do Today"


# ── Behavior 3: generate persists structure and sections to SQLite ────────────

async def test_generate_persists_outline_to_database(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        await _save_angles(client, project_id)

        with patch("backend.outline_generator.generate_outline", new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _MOCK_SECTIONS
            await client.post(
                f"/projects/{project_id}/outline/generate",
                json={"structure": _MOCK_STRUCTURES[0]},
            )

        response = await client.get(f"/projects/{project_id}/outline")

    assert response.status_code == 200
    body = response.json()
    assert body["structure"]["title"] == "Chronological"
    assert len(body["sections"]) == 2


# ── Behavior 4: GET /outline returns the stored outline ──────────────────────

async def test_get_outline_returns_empty_when_none_generated(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        response = await client.get(f"/projects/{project_id}/outline")

    assert response.status_code == 200
    body = response.json()
    assert body["structure"] is None
    assert body["sections"] == []


# ── Behavior 5: generate routes via outline_generator role ───────────────────

async def test_generate_routes_via_outline_generator_role(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        await _save_angles(client, project_id)

        with patch("backend.outline_generator.generate_outline", new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _MOCK_SECTIONS
            await client.post(
                f"/projects/{project_id}/outline/generate",
                json={"structure": _MOCK_STRUCTURES[0]},
            )

    mock_llm.assert_awaited_once()
    _, kwargs = mock_llm.call_args
    assert kwargs.get("role") == "outline_generator"
