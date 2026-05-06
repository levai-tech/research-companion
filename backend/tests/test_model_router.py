import pytest
from backend.model_router import ModelRouter


@pytest.fixture
def router():
    return ModelRouter()


def test_angle_explorer_free_tier(router):
    assert router.route("angle_explorer", tier="free") == "nousresearch/hermes-3-llama-3.1-405b:free"


def test_angle_explorer_paid_tier(router):
    assert router.route("angle_explorer", tier="paid") == "anthropic/claude-opus-4.7"


def test_all_roles_have_free_and_paid(router):
    roles = ["angle_explorer", "research_agent", "literature_review", "editor_ai", "outline_generator"]
    for role in roles:
        assert router.route(role, tier="free"), f"{role} missing free model"
        assert router.route(role, tier="paid"), f"{role} missing paid model"


def test_unknown_role_raises(router):
    with pytest.raises(ValueError, match="Unknown role"):
        router.route("nonexistent_role", tier="free")


def test_settings_tier_used_when_no_tier_arg(router):
    router.load_settings({"roles": {"angle_explorer": {"tier": "paid"}}})
    assert router.route("angle_explorer") == "anthropic/claude-opus-4.7"


def test_free_default_when_role_absent_from_settings(router):
    router.load_settings({"roles": {}})
    assert router.route("angle_explorer") == "nousresearch/hermes-3-llama-3.1-405b:free"
