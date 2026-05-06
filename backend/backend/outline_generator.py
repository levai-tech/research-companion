import json
from typing import Any

from backend.llm import openrouter_post
from backend.model_router import ModelRouter
from backend.settings import Settings

_STRUCTURES_PROMPT = """You are an Outline Architect helping a writer structure their work.

Given the accepted research angles and document type, propose exactly 2–3 structural options (e.g. chronological, thematic, problem-solution).

Respond with ONLY a JSON array (no prose before or after):
[
  {
    "id": "<slug>",
    "title": "<short name>",
    "rationale": "<one sentence: why this structure fits>",
    "tradeoff": "<one sentence: the main drawback>"
  },
  ...
]"""

_OUTLINE_PROMPT = """You are an Outline Architect helping a writer build a detailed chapter outline.

Given the accepted research angles, document type, and chosen structure, generate a detailed outline with sections and subsections.

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

async def propose_structures(
    angles: list[dict[str, Any]],
    document_type: str,
    *,
    role: str = "outline_generator",
) -> list[dict[str, Any]]:
    """Call the LLM to propose 2–3 structural options. System boundary — mock in tests."""
    settings = Settings()
    api_key = settings.get_key("openrouter_api_key")
    if not api_key:
        raise RuntimeError("OpenRouter API key not configured — add it in Settings.")

    router = ModelRouter()
    router.load_settings(settings.get())
    model = router.route(role)

    angles_text = "\n".join(f"- {a['title']}: {a['description']}" for a in angles)
    prompt = f"Document type: {document_type}\n\nAccepted angles:\n{angles_text}\n\nPropose 2–3 structural options."

    response = await openrouter_post(
        api_key,
        model,
        [
            {"role": "system", "content": _STRUCTURES_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )

    content: str = response.json()["choices"][0]["message"]["content"]
    return json.loads(content)


async def generate_outline(
    angles: list[dict[str, Any]],
    document_type: str,
    structure: dict[str, Any],
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

    angles_text = "\n".join(f"- {a['title']}: {a['description']}" for a in angles)
    prompt = (
        f"Document type: {document_type}\n\n"
        f"Accepted angles:\n{angles_text}\n\n"
        f"Chosen structure: {structure['title']} — {structure['rationale']}\n\n"
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
