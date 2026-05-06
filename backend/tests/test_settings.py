import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
import httpx

from backend.main import create_app
from backend.settings import Settings


# ── Settings unit tests ────────────────────────────────────────────────────────

@pytest.fixture
def tmp_settings_path(tmp_path):
    return tmp_path / "settings.json"


@pytest.fixture
def settings(tmp_settings_path):
    return Settings(path=tmp_settings_path)


def test_get_returns_defaults_when_file_absent(settings):
    result = settings.get()
    assert result["roles"]["angle_explorer"]["tier"] == "free"
    assert result["roles"]["research_agent"]["tier"] == "free"
    assert result["roles"]["literature_review"]["tier"] == "free"
    assert result["roles"]["editor_ai"]["tier"] == "free"
    assert result["roles"]["outline_generator"]["tier"] == "free"
    assert result["search_provider"] == "tavily"
    assert result["ollama"]["endpoint"] == "http://localhost:11434"
    assert result["ollama"]["embedding_model"] == "nomic-embed-text"


def test_update_persists_role_tier(settings, tmp_settings_path):
    settings.update({"roles": {"research_agent": {"tier": "paid"}}})
    data = json.loads(tmp_settings_path.read_text())
    assert data["roles"]["research_agent"]["tier"] == "paid"


def test_update_merges_not_replaces(settings):
    settings.update({"roles": {"research_agent": {"tier": "paid"}}})
    result = settings.get()
    assert result["roles"]["angle_explorer"]["tier"] == "free"
    assert result["roles"]["research_agent"]["tier"] == "paid"


def test_update_persists_ollama_endpoint(settings, tmp_settings_path):
    settings.update({"ollama": {"endpoint": "http://remote:11434"}})
    data = json.loads(tmp_settings_path.read_text())
    assert data["ollama"]["endpoint"] == "http://remote:11434"


# ── Key store unit tests ───────────────────────────────────────────────────────

def test_save_key_calls_keyring(settings):
    with patch("backend.settings.keyring") as mock_kr:
        settings.save_key("openrouter_api_key", "sk-test-123")
        mock_kr.set_password.assert_called_once_with(
            "research-companion", "openrouter_api_key", "sk-test-123"
        )


def test_get_key_calls_keyring(settings):
    with patch("backend.settings.keyring") as mock_kr:
        mock_kr.get_password.return_value = "sk-test-123"
        result = settings.get_key("openrouter_api_key")
        assert result == "sk-test-123"
        mock_kr.get_password.assert_called_once_with(
            "research-companion", "openrouter_api_key"
        )


def test_get_key_returns_none_when_unset(settings):
    with patch("backend.settings.keyring") as mock_kr:
        mock_kr.get_password.return_value = None
        assert settings.get_key("openrouter_api_key") is None


def test_keys_mask_returns_booleans(settings):
    with patch("backend.settings.keyring") as mock_kr:
        mock_kr.get_password.side_effect = lambda _svc, key: (
            "sk-set" if key == "openrouter_api_key" else None
        )
        mask = settings.keys_mask()
        assert mask["openrouter_api_key"] is True
        assert mask["tavily_api_key"] is False


# ── API endpoint tests ─────────────────────────────────────────────────────────

@pytest.fixture
def app(tmp_settings_path):
    return create_app(settings_path=tmp_settings_path)


async def test_get_settings_returns_defaults(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/settings")
    assert response.status_code == 200
    body = response.json()
    assert body["roles"]["angle_explorer"]["tier"] == "free"
    assert body["search_provider"] == "tavily"
    assert body["ollama"]["embedding_model"] == "nomic-embed-text"


async def test_put_settings_updates_role_tier(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        put_resp = await client.put("/settings", json={"roles": {"editor_ai": {"tier": "paid"}}})
        assert put_resp.status_code == 200
        body = (await client.get("/settings")).json()
    assert body["roles"]["editor_ai"]["tier"] == "paid"
    assert body["roles"]["angle_explorer"]["tier"] == "free"


async def test_get_keys_mask_returns_booleans(app):
    transport = httpx.ASGITransport(app=app)
    with patch("backend.settings.keyring") as mock_kr:
        mock_kr.get_password.return_value = None
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/keys")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["openrouter_api_key"], bool)
    assert isinstance(body["tavily_api_key"], bool)


async def test_put_key_stores_in_keychain(app):
    transport = httpx.ASGITransport(app=app)
    with patch("backend.settings.keyring") as mock_kr:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put("/settings/keys", json={"openrouter_api_key": "sk-abc"})
    assert response.status_code == 200
    mock_kr.set_password.assert_called_once_with(
        "research-companion", "openrouter_api_key", "sk-abc"
    )
