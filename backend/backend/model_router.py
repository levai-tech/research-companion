_CATALOGUE: dict[str, dict[str, str]] = {
    "angle_explorer": {
        "free": "nousresearch/hermes-3-llama-3.1-405b:free",
        "paid": "anthropic/claude-opus-4.7",
    },
    "research_agent": {
        "free": "meta-llama/llama-3.3-70b-instruct:free",
        "paid": "google/gemini-2.5-flash",
    },
    "literature_review": {
        "free": "nousresearch/hermes-3-llama-3.1-405b:free",
        "paid": "google/gemini-2.5-flash",
    },
    "editor_ai": {
        "free": "meta-llama/llama-3.3-70b-instruct:free",
        "paid": "anthropic/claude-sonnet-4.6",
    },
    "outline_generator": {
        "free": "qwen/qwen3-next-80b-a3b-instruct:free",
        "paid": "anthropic/claude-sonnet-4.6",
    },
}

VALID_TIERS = frozenset({"free", "paid"})


class ModelRouter:
    def __init__(self) -> None:
        self._role_tiers: dict[str, str] = {}

    def load_settings(self, settings: dict) -> None:
        roles = settings.get("roles", {})
        self._role_tiers = {role: cfg.get("tier", "free") for role, cfg in roles.items()}

    def route(self, role: str, tier: str | None = None) -> str:
        if role not in _CATALOGUE:
            raise ValueError(f"Unknown role: {role!r}. Valid roles: {sorted(_CATALOGUE)}")
        resolved_tier = tier if tier is not None else self._role_tiers.get(role, "free")
        if resolved_tier not in VALID_TIERS:
            raise ValueError(f"Unknown tier: {resolved_tier!r}. Valid tiers: {sorted(VALID_TIERS)}")
        return _CATALOGUE[role][resolved_tier]
