import json
from typing import Any

import httpx

from backend.model_router import ModelRouter
from backend.settings import Settings

SYSTEM_PROMPT = """You are an Angle Explorer helping a writer find the best research angles for their project.

Given a topic and document type, propose exactly 3–5 distinct research angles suited to the genre.

Respond with ONLY a JSON array (no prose before or after):
[
  {"title": "<short angle title>", "description": "<one or two sentences describing this angle>"},
  ...
]

Each angle should offer a different lens on the topic — thematic, structural, or narrative."""

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


async def call_llm(topic: str, document_type: str, *, role: str = "angle_explorer") -> list[dict[str, Any]]:
    """Call the Angle Explorer LLM via OpenRouter. System boundary — mock in tests."""
    settings = Settings()
    api_key = settings.get_key("openrouter_api_key")
    if not api_key:
        raise RuntimeError("OpenRouter API key not configured — add it in Settings.")

    router = ModelRouter()
    router.load_settings(settings.get())
    model = router.route(role)

    prompt = f"Topic: {topic}\nDocument type: {document_type}\n\nPropose 3–5 research angles."

    async with httpx.AsyncClient() as client:
        response = await client.post(
            _OPENROUTER_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=60.0,
        )
        response.raise_for_status()

    content: str = response.json()["choices"][0]["message"]["content"]
    return json.loads(content)
