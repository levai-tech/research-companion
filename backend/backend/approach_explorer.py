import json
import re
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

Each Approach should offer a different strategic framing."""


def _extract_json_array(content: str) -> list[dict[str, Any]]:
    """Extract a JSON array from model output, tolerating markdown fences and prose wrappers."""
    candidates: list[str] = [content]

    fence_match = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", content, re.DOTALL | re.IGNORECASE)
    if fence_match:
        candidates.append(fence_match.group(1))

    bracket_match = re.search(r"\[.*\]", content, re.DOTALL)
    if bracket_match:
        candidates.append(bracket_match.group(0))

    for candidate in candidates:
        try:
            parsed = json.loads(candidate.strip())
            if isinstance(parsed, list):
                return parsed
        except (json.JSONDecodeError, ValueError):
            continue

    raise RuntimeError("The AI returned an unexpected response for Approaches — try again.")


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
    return _extract_json_array(content)
