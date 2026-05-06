import json
from typing import Any

import httpx

from backend.model_router import ModelRouter
from backend.settings import Settings

SYSTEM_PROMPT = """You are a Project Advisor helping a writer start a new writing project.

Ask the user a series of focused questions — one at a time — to understand:
- What the work is about (topic)
- What kind of writing it is — let this emerge from the conversation, don't suggest categories
- Enough about their goals, constraints, and themes to frame the project

Once you have a clear picture, respond with ONLY a JSON object (no prose before or after):
{
  "phase": "ready",
  "message": "<brief encouraging message — e.g. 'I think I have enough — continue or click Done'>",
  "project_metadata": {
    "topic": "...",
    "document_type": "<whatever emerged naturally, e.g. memoir, podcast script, long-form essay, etc.>"
  }
}

Until you have enough information, respond with a plain conversational question — no JSON."""

_SUMMARY_PROMPT = """You are summarising a writing project interview. Extract and summarise:
- Goals: what the writer wants to achieve
- Constraints: any stated limitations (length, audience, tone, scope)
- Themes: the key ideas and arguments the writer wants to explore

Be concise. Output plain prose — no JSON, no bullet headers."""

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


async def generate_summary(messages: list[dict]) -> str:
    """Summarise an Interview's message log into goals, constraints, and themes."""
    settings = Settings()
    api_key = settings.get_key("openrouter_api_key")
    if not api_key:
        raise RuntimeError("OpenRouter API key not configured — add it in Settings.")

    s = settings.get()
    router = ModelRouter()
    router.load_settings(s)
    model = router.route("project_advisor")

    conversation = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages
    )

    async with httpx.AsyncClient() as client:
        response = await client.post(
            _OPENROUTER_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": _SUMMARY_PROMPT},
                    {"role": "user", "content": conversation},
                ],
            },
            timeout=60.0,
        )
        response.raise_for_status()

    return response.json()["choices"][0]["message"]["content"].strip()


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
        if isinstance(parsed, dict) and parsed.get("phase") == "ready":
            return parsed
    except (json.JSONDecodeError, ValueError):
        pass

    return content.strip()
