import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from backend.main import create_app
from backend.outline_generator import generate_outline


def _llm_response(content: str) -> MagicMock:
    mock = MagicMock()
    mock.json.return_value = {"choices": [{"message": {"content": content}}]}
    return mock


@pytest.fixture
def mock_llm_deps():
    """Patch Settings, ModelRouter, and openrouter_post for unit-testing generate_outline."""
    with (
        patch("backend.outline_generator.Settings") as mock_settings_cls,
        patch("backend.outline_generator.ModelRouter") as mock_router_cls,
        patch("backend.outline_generator.openrouter_post", new_callable=AsyncMock) as mock_post,
    ):
        mock_settings_cls.return_value.get_key.return_value = "test-key"
        mock_settings_cls.return_value.get.return_value = {}
        mock_router = MagicMock()
        mock_router.route.return_value = "some-model"
        mock_router_cls.return_value = mock_router
        yield mock_post


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


async def _save_approach(client: httpx.AsyncClient, project_id: str) -> None:
    await client.patch(
        f"/projects/{project_id}/approach",
        json={"approach": {"title": "The Clock Is Ticking", "description": "Encryption at risk."}},
    )


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


# ── Behavior 1: POST /outline/generate returns sections (no structure in body) ─

@pytest.mark.anyio
async def test_generate_outline_returns_sections(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        await _save_approach(client, project_id)

        with patch("backend.outline_generator.generate_outline", new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _MOCK_SECTIONS
            response = await client.post(
                f"/projects/{project_id}/outline/generate",
                json={},
            )

    assert response.status_code == 200
    body = response.json()
    assert "sections" in body
    assert len(body["sections"]) == 2
    assert body["sections"][0]["title"] == "The Ticking Clock"


# ── Behavior 2: sections are persisted and readable via GET /outline ──────────

@pytest.mark.anyio
async def test_generate_persists_sections_to_database(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        await _save_approach(client, project_id)

        with patch("backend.outline_generator.generate_outline", new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _MOCK_SECTIONS
            await client.post(f"/projects/{project_id}/outline/generate", json={})

        response = await client.get(f"/projects/{project_id}/outline")

    assert response.status_code == 200
    body = response.json()
    assert "structure" not in body
    assert len(body["sections"]) == 2
    assert body["sections"][0]["title"] == "The Ticking Clock"
    assert len(body["sections"][0]["subsections"]) == 2


# ── Behavior 3: GET /outline returns empty sections when none generated ───────

@pytest.mark.anyio
async def test_get_outline_returns_empty_when_none_generated(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        response = await client.get(f"/projects/{project_id}/outline")

    assert response.status_code == 200
    body = response.json()
    assert body["sections"] == []
    assert "structure" not in body


# ── Behavior 4: generate_outline is called with approach and role ─────────────

@pytest.mark.anyio
async def test_generate_outline_called_with_approach_and_role(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        await _save_approach(client, project_id)

        with patch("backend.outline_generator.generate_outline", new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _MOCK_SECTIONS
            await client.post(f"/projects/{project_id}/outline/generate", json={})

    mock_llm.assert_awaited_once()
    args, kwargs = mock_llm.call_args
    approach_arg = args[0]
    assert approach_arg["title"] == "The Clock Is Ticking"
    assert approach_arg["description"] == "Encryption at risk."
    assert kwargs.get("role") == "outline_generator"


# ── Unit: generate_outline JSON parsing ──────────────────────────────────────

@pytest.mark.anyio
async def test_generate_outline_raises_on_empty_content(mock_llm_deps):
    mock_llm_deps.return_value = _llm_response("")
    with pytest.raises(RuntimeError):
        await generate_outline({"title": "T", "description": "D"}, "book")


@pytest.mark.anyio
async def test_generate_outline_parses_fenced_json(mock_llm_deps):
    fenced = '```json\n[{"title": "Ch1", "description": "Intro", "subsections": []}]\n```'
    mock_llm_deps.return_value = _llm_response(fenced)
    result = await generate_outline({"title": "T", "description": "D"}, "book")
    assert result == [{"title": "Ch1", "description": "Intro", "subsections": []}]
