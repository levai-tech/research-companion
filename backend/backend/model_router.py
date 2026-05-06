_DEFAULTS: dict[str, str] = {
    "project_advisor": "mistralai/mistral-7b-instruct:free",
    "angle_explorer": "mistralai/mistral-7b-instruct:free",
    "research_agent": "mistralai/mistral-7b-instruct:free",
    "literature_review": "mistralai/mistral-7b-instruct:free",
    "editor_ai": "mistralai/mistral-7b-instruct:free",
    "outline_generator": "mistralai/mistral-7b-instruct:free",
}


class ModelRouter:
    def __init__(self) -> None:
        self._role_models: dict[str, str] = {}

    def load_settings(self, settings: dict) -> None:
        roles = settings.get("roles", {})
        self._role_models = {
            role: cfg["model"]
            for role, cfg in roles.items()
            if isinstance(cfg, dict) and cfg.get("model")
        }

    def route(self, role: str, **_kwargs) -> str:
        model = self._role_models.get(role) or _DEFAULTS.get(role)
        if not model:
            raise ValueError(f"No model configured for role: {role!r}")
        return model
