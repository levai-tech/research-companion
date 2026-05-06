import pytest
import httpx
from unittest.mock import AsyncMock, patch

from backend.main import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(projects_dir=tmp_path)


# ── Behavior 5: first turn returns a question ─────────────────────────────────

async def test_setup_chat_first_turn_returns_question(app):
    transport = httpx.ASGITransport(app=app)

    with patch("backend.setup_chat.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "What topic are you writing about?"

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/setup/chat", json={"messages": []})

    assert response.status_code == 200
    body = response.json()
    assert body["phase"] == "chat"
    assert body["message"] == "What topic are you writing about?"
    assert "layouts" not in body


# ── Behavior 6: suggest phase returns layouts ─────────────────────────────────

async def test_setup_chat_returns_layouts_when_llm_signals_suggest(app):
    transport = httpx.ASGITransport(app=app)

    suggest_response = {
        "phase": "suggest",
        "message": "Great — here are some layouts that fit your project.",
        "layouts": [
            {"id": "three-act", "name": "Three-Act Structure", "description": "Classic narrative arc with setup, confrontation, resolution."},
            {"id": "inverted-pyramid", "name": "Inverted Pyramid", "description": "Lead with conclusions, drill down into detail."},
        ],
        "project_metadata": {
            "topic": "Quantum computing",
            "theme": "Accessibility of complex tech",
            "angle": "The human cost of ignoring quantum-resistant encryption",
            "document_type": "book",
        },
    }

    with patch("backend.setup_chat.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = suggest_response

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            messages = [
                {"role": "user", "content": "I want to write a book about quantum computing"},
                {"role": "assistant", "content": "What angle interests you most?"},
                {"role": "user", "content": "The security implications for everyday people"},
            ]
            response = await client.post("/setup/chat", json={"messages": messages})

    assert response.status_code == 200
    body = response.json()
    assert body["phase"] == "suggest"
    assert len(body["layouts"]) == 2
    assert body["layouts"][0]["id"] == "three-act"
    assert body["project_metadata"]["document_type"] == "book"
