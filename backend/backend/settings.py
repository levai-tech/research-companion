import json
from copy import deepcopy
from pathlib import Path

import keyring
from keyring.errors import NoKeyringError

_KEYCHAIN_SERVICE = "research-companion"

_DEFAULTS: dict = {
    "roles": {
        "angle_explorer": {"tier": "free"},
        "research_agent": {"tier": "free"},
        "literature_review": {"tier": "free"},
        "editor_ai": {"tier": "free"},
        "outline_generator": {"tier": "free"},
    },
    "search_provider": "tavily",
    "ollama": {
        "endpoint": "http://localhost:11434",
        "embedding_model": "nomic-embed-text",
    },
}

_KNOWN_KEYS = ("openrouter_api_key", "tavily_api_key")


def _deep_merge(base: dict, patch: dict) -> dict:
    result = deepcopy(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


class Settings:
    def __init__(self, path: Path | None = None) -> None:
        if path is None:
            path = Path.home() / ".research-companion" / "settings.json"
        self._path = path
        # Fallback key store used when no OS keyring is available (e.g. WSL2).
        # On Windows production the real keychain is always used instead.
        self._keys_fallback_path = self._path.parent / "keys.json"

    def get(self) -> dict:
        if not self._path.exists():
            return deepcopy(_DEFAULTS)
        stored = json.loads(self._path.read_text())
        return _deep_merge(_DEFAULTS, stored)

    def update(self, patch: dict) -> None:
        current = self.get()
        merged = _deep_merge(current, patch)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(merged, indent=2))

    def save_key(self, name: str, value: str) -> None:
        try:
            keyring.set_password(_KEYCHAIN_SERVICE, name, value)
        except NoKeyringError:
            self._fallback_save_key(name, value)

    def get_key(self, name: str) -> str | None:
        try:
            return keyring.get_password(_KEYCHAIN_SERVICE, name)
        except NoKeyringError:
            return self._fallback_get_key(name)

    def _fallback_save_key(self, name: str, value: str) -> None:
        self._keys_fallback_path.parent.mkdir(parents=True, exist_ok=True)
        data = self._fallback_load()
        data[name] = value
        self._keys_fallback_path.write_text(json.dumps(data))

    def _fallback_get_key(self, name: str) -> str | None:
        return self._fallback_load().get(name)

    def _fallback_load(self) -> dict:
        if not self._keys_fallback_path.exists():
            return {}
        return json.loads(self._keys_fallback_path.read_text())

    def keys_mask(self) -> dict[str, bool]:
        return {name: self.get_key(name) is not None for name in _KNOWN_KEYS}
