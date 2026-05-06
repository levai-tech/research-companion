import pytest
from backend.model_router import ModelRouter


@pytest.fixture
def router():
    return ModelRouter()


def test_route_returns_default_when_settings_not_loaded(router):
    assert router.route("angle_explorer") == "mistralai/mistral-7b-instruct:free"


def test_route_returns_model_from_settings(router):
    router.load_settings({"roles": {"angle_explorer": {"model": "anthropic/claude-opus-4.7"}}})
    assert router.route("angle_explorer") == "anthropic/claude-opus-4.7"


def test_all_roles_have_defaults(router):
    for role in ["angle_explorer", "research_agent", "literature_review", "editor_ai", "outline_generator"]:
        assert router.route(role), f"{role} missing default model"


def test_unknown_role_raises(router):
    with pytest.raises(ValueError, match="No model configured"):
        router.route("nonexistent_role")


def test_settings_model_overrides_default(router):
    router.load_settings({"roles": {"angle_explorer": {"model": "google/gemini-2.5-flash"}}})
    assert router.route("angle_explorer") == "google/gemini-2.5-flash"


def test_role_absent_from_settings_falls_back_to_default(router):
    router.load_settings({"roles": {}})
    assert router.route("angle_explorer") == "mistralai/mistral-7b-instruct:free"
