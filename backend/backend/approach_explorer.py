import json
from typing import Any

from backend.llm import openrouter_post
from backend.model_router import ModelRouter
from backend.settings import Settings

SYSTEM_PROMPT = """You are an Approach Explorer helping a writer find the best strategic framing for their project.

Given a transcript summary of the writer's goals and constraints, propose exactly 3 distinct Approaches suited to their project.

Respond with ONLY a JSON array (no prose before or after):
[
  {"title": "<short approach title>", "description": "<one or two sentences describing this approach>"},
  {"title": "<short approach title>", "description": "<one or two sentences describing this approach>"},
  {"title": "<short approach title>", "description": "<one or two sentences describing this approach>"}
]

Each Approach should offer a different strategic framing — thematic, structural, or narrative."""


async def call_llm(transcript_summary: str, *, role: str = "approach_explorer") -> list[dict[str, Any]]:
    """Call the Approach Explorer LLM via OpenRouter. System boundary — mock in tests."""
    settings = Settings()
    api_key = settings.get_key("openrouter_api_key")
    if not api_key:
        raise RuntimeError("OpenRouter API key not configured — add it in Settings.")

    router = ModelRouter()
    router.load_settings(settings.get())
    model = router.route(role)

    prompt = f"Transcript summary: {transcript_summary}\n\nPropose exactly 3 Approaches."

    response = await openrouter_post(
        api_key,
        model,
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )

    content: str = response.json()["choices"][0]["message"]["content"]
    return json.loads(content)
