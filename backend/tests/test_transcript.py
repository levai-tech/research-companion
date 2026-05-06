import pytest
import httpx
from unittest.mock import AsyncMock, patch

from backend.main import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(projects_dir=tmp_path)


async def _create_project(client) -> str:
    response = await client.post("/projects", json={
        "title": "Climate Change Politics",
        "topic": "Political failure to act on climate",
        "document_type": "book",
    })
    assert response.status_code == 201
    return response.json()["id"]


MESSAGES = [
    {"role": "user", "content": "I want to write about climate change"},
    {"role": "assistant", "content": "What aspect interests you most?"},
    {"role": "user", "content": "The political failure to act"},
]

SUMMARY = "Goals: write a book exposing political inaction on climate. Constraints: investigative, evidence-based. Themes: accountability, systemic failure."


# ── Behavior 8: transcript save ───────────────────────────────────────────────

async def test_post_transcript_saves_and_returns_transcript(app):
    transport = httpx.ASGITransport(app=app)

    with patch("backend.interview.generate_summary", new_callable=AsyncMock) as mock_summary:
        mock_summary.return_value = SUMMARY

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            project_id = await _create_project(client)
            response = await client.post(
                f"/projects/{project_id}/transcript",
                json={"messages": MESSAGES},
            )

    assert response.status_code == 201
    body = response.json()
    assert body["project_id"] == project_id
    assert body["messages"] == MESSAGES
    assert body["summary"] == SUMMARY
    assert "id" in body
    assert "created_at" in body


# ── Behavior 9: transcript retrieve ──────────────────────────────────────────

async def test_get_transcript_returns_saved_transcript(app):
    transport = httpx.ASGITransport(app=app)

    with patch("backend.interview.generate_summary", new_callable=AsyncMock) as mock_summary:
        mock_summary.return_value = SUMMARY

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            project_id = await _create_project(client)
            await client.post(
                f"/projects/{project_id}/transcript",
                json={"messages": MESSAGES},
            )
            response = await client.get(f"/projects/{project_id}/transcript")

    assert response.status_code == 200
    body = response.json()
    assert body["project_id"] == project_id
    assert body["messages"] == MESSAGES
    assert body["summary"] == SUMMARY


# ── Behavior 10: transcript 404 when not yet saved ───────────────────────────

async def test_get_transcript_returns_404_when_missing(app):
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = await _create_project(client)
        response = await client.get(f"/projects/{project_id}/transcript")

    assert response.status_code == 404


# ── Behavior 11: transcript save 404 for unknown project ─────────────────────

async def test_post_transcript_returns_404_for_unknown_project(app):
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/nonexistent-id/transcript",
            json={"messages": MESSAGES},
        )

    assert response.status_code == 404
