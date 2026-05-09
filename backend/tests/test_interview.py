import pytest
import httpx
from unittest.mock import AsyncMock, patch

from backend.main import create_app
from backend.interview import _try_extract_ready_payload


@pytest.fixture
def app(tmp_path):
    return create_app(projects_dir=tmp_path)


# ── Behavior 5: first turn returns a question ─────────────────────────────────

async def test_interview_first_turn_returns_question(app):
    transport = httpx.ASGITransport(app=app)

    with patch("backend.interview.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "What topic are you writing about?"

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/interview", json={"messages": []})

    assert response.status_code == 200
    body = response.json()
    assert body["phase"] == "chat"
    assert body["message"] == "What topic are you writing about?"
    assert "layouts" not in body


# ── Behavior 6: ready phase forwards project_metadata ────────────────────────

async def test_interview_returns_ready_with_project_metadata(app):
    transport = httpx.ASGITransport(app=app)

    ready_response = {
        "phase": "ready",
        "message": "I think I have enough — continue or click Done.",
        "project_metadata": {
            "topic": "Quantum computing and encryption",
            "document_type": "long-form investigative article",
        },
    }

    with patch("backend.interview.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = ready_response

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            messages = [
                {"role": "user", "content": "I want to write about quantum computing"},
                {"role": "assistant", "content": "What angle interests you most?"},
                {"role": "user", "content": "The security implications for everyday people"},
            ]
            response = await client.post("/interview", json={"messages": messages})

    assert response.status_code == 200
    body = response.json()
    assert body["phase"] == "ready"
    assert body["message"] == "I think I have enough — continue or click Done."
    assert body["project_metadata"]["topic"] == "Quantum computing and encryption"
    assert body["project_metadata"]["document_type"] == "long-form investigative article"
    assert "layouts" not in body


# ── Behavior 7: ready phase is forwarded to frontend ─────────────────────────

async def test_interview_returns_ready_when_llm_signals_ready(app):
    transport = httpx.ASGITransport(app=app)

    ready_response = {
        "phase": "ready",
        "message": "I think I have enough — continue or click Done.",
    }

    with patch("backend.interview.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = ready_response

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            messages = [
                {"role": "user", "content": "I want to write a book about climate change"},
                {"role": "assistant", "content": "What angle interests you most?"},
                {"role": "user", "content": "The political failure to act"},
            ]
            response = await client.post("/interview", json={"messages": messages})

    assert response.status_code == 200
    body = response.json()
    assert body["phase"] == "ready"
    assert body["message"] == "I think I have enough — continue or click Done."
    assert "layouts" not in body


# ── Unit tests: _try_extract_ready_payload ────────────────────────────────────

_READY_DICT = {
    "phase": "ready",
    "message": "I think I've got it.",
    "project_metadata": {"topic": "Quantum computing", "document_type": "essay"},
}

_READY_JSON = '{"phase": "ready", "message": "I think I\'ve got it.", "project_metadata": {"topic": "Quantum computing", "document_type": "essay"}}'


def test_try_extract_bare_json():
    result = _try_extract_ready_payload(_READY_JSON)
    assert result is not None
    assert result["phase"] == "ready"
    assert result["project_metadata"]["topic"] == "Quantum computing"


def test_try_extract_fenced_json_block():
    fenced = f"```json\n{_READY_JSON}\n```"
    result = _try_extract_ready_payload(fenced)
    assert result is not None
    assert result["phase"] == "ready"


def test_try_extract_fence_without_language_tag():
    fenced = f"```\n{_READY_JSON}\n```"
    result = _try_extract_ready_payload(fenced)
    assert result is not None
    assert result["phase"] == "ready"


def test_try_extract_prose_wrapped_json():
    prose = f"Great, I think I have enough information!\n\n{_READY_JSON}\n\nLet me know if you want to continue."
    result = _try_extract_ready_payload(prose)
    assert result is not None
    assert result["phase"] == "ready"


def test_try_extract_returns_none_for_plain_question():
    result = _try_extract_ready_payload("What topic are you writing about?")
    assert result is None


def test_try_extract_returns_none_for_empty_string():
    assert _try_extract_ready_payload("") is None


def test_try_extract_returns_none_for_non_ready_json():
    result = _try_extract_ready_payload('{"phase": "chat", "message": "Tell me more."}')
    assert result is None
