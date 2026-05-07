import json
from typing import Any

from backend.llm import openrouter_post
from backend.model_router import ModelRouter
from backend.settings import Settings

_OUTLINE_PROMPT = """You are an Outline Architect helping a writer build a detailed chapter outline.

Given the confirmed Approach and document type, generate a detailed outline with sections and subsections.

Respond with ONLY a JSON array (no prose before or after):
[
  {
    "title": "<section title>",
    "description": "<one or two sentences describing this section>",
    "subsections": [
      {"title": "<subsection title>", "description": "<one sentence>"},
      ...
    ]
  },
  ...
]"""


async def generate_outline(
    approach: dict[str, Any],
    document_type: str,
    *,
    role: str = "outline_generator",
) -> list[dict[str, Any]]:
    """Call the LLM to generate a detailed outline. System boundary — mock in tests."""
    settings = Settings()
    api_key = settings.get_key("openrouter_api_key")
    if not api_key:
        raise RuntimeError("OpenRouter API key not configured — add it in Settings.")

    router = ModelRouter()
    router.load_settings(settings.get())
    model = router.route(role)

    prompt = (
        f"Document type: {document_type}\n\n"
        f"Approach: {approach.get('title', '')} — {approach.get('description', '')}\n\n"
        f"Generate a detailed outline."
    )

    response = await openrouter_post(
        api_key,
        model,
        [
            {"role": "system", "content": _OUTLINE_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )

    content: str = response.json()["choices"][0]["message"]["content"]
    return json.loads(content)
