import json
from typing import Any

import httpx

from backend.model_router import ModelRouter
from backend.settings import Settings

SYSTEM_PROMPT = """You are a Project Advisor helping a writer start a new writing project.

Ask the user a series of focused questions — one at a time — to establish:
- Topic: what the work is about
- Theme: the underlying message or argument
- Angle: the specific lens or approach
- Document type: Book, Article, Essay, or Investigative Journalism

Once you have a clear picture of all four, respond with ONLY a JSON object (no prose before or after):
{
  "phase": "suggest",
  "message": "<brief encouraging message summarising what you understood>",
  "layouts": [
    {"id": "<slug>", "name": "<Layout name>", "description": "<one sentence>"},
    ...
  ],
  "project_metadata": {
    "topic": "...",
    "theme": "...",
    "angle": "...",
    "document_type": "<book|article|essay|investigative_journalism>"
  }
}

Provide 2–3 layout options appropriate for the document type.
Until you have enough information, respond with a plain conversational question — no JSON."""

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


async def call_llm(messages: list[dict]) -> str | dict[str, Any]:
    """Call the Project Advisor LLM via OpenRouter. System boundary — mock in tests."""
    settings = Settings()
    api_key = settings.get_key("openrouter_api_key")
    if not api_key:
        raise RuntimeError("OpenRouter API key not configured — add it in Settings.")

    s = settings.get()
    router = ModelRouter()
    router.load_settings(s)
    model = router.route("project_advisor")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            _OPENROUTER_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *messages],
            },
            timeout=60.0,
        )
        response.raise_for_status()

    content: str = response.json()["choices"][0]["message"]["content"]

    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict) and parsed.get("phase") == "suggest":
            return parsed
    except (json.JSONDecodeError, ValueError):
        pass

    return content.strip()
