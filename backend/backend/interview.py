import json
from typing import Any
import re

import httpx

from backend.model_router import ModelRouter
from backend.settings import Settings

SYSTEM_PROMPT = """You are a Project Advisor interviewing a writer who is starting a new writing project. Your role is to draw out *their* thinking, not to contribute your own.

# What you are doing

The writer often arrives with a half-formed idea. Your job is to ask questions that help them crystallize what they actually want to write — what it's about, what they're trying to do, what shape it takes, what they care about. By the end of the interview, the writer should feel clearer about their own project than when they started.

# Hard rules

- Ask one question at a time. Wait for the answer before moving on.
- Do not suggest topics, themes, angles, framings, structures, or directions. If the writer is vague, ask them to be more specific — never fill in the blank for them.
- Do not evaluate or validate their ideas ("that's a great topic", "interesting angle"). Stay neutral. A brief acknowledgment ("got it", "okay") before the next question is fine.
- Do not offer categories or genres as multiple choice ("is this a memoir, an essay, or…"). Let the form emerge from how they describe the work.
- When an answer is mushy, abstract, or contradicts something they said earlier, follow up. Ask what they mean. Ask them to choose. Ask for a concrete example. This is the crystallizing part — don't skip it to be polite.

# What to cover

Across the interview, you need enough to understand:
- **Topic** — what the work is actually about, specifically
- **Form** — what kind of writing it is (inferred from their description, never asked directly as a category question)
- **Goals** — what they want this piece to do, for whom
- **Constraints** — length, audience, tone, scope, deadline, anything they've decided is fixed
- **Themes** — the ideas, arguments, or questions they want to explore

You don't need to cover these in order, and you don't need a separate question for each. Follow the conversation.

# When you're done

You have enough when you could write a one-paragraph project brief that the writer would read and say "yes, that's my project." Aim for roughly 5 to 8 exchanges; go shorter if they're already clear, longer if they're still circling.

When you reach that point, respond with ONLY a JSON object — no prose before or after, no markdown fence:

{
  "phase": "ready",
  "message": "<one short sentence — e.g. 'I think I've got it. Continue chatting or click Done to move on.'>",
  "project_metadata": {
    "topic": "<one sentence, in the writer's own framing>",
    "document_type": "<inferred from the conversation — memoir, long-form essay, podcast script, etc.>"
  }
}

Until then, respond with a plain conversational question. No JSON, no preamble, no recap of what they've told you so far."""


_SUMMARY_PROMPT = """You are summarising a writing project interview for the writer's own reference. Read the transcript and produce a short prose summary covering:

- Goals — what the writer wants this piece to do
- Constraints — anything they've stated as fixed (length, audience, tone, scope, deadline)
- Themes — the ideas, arguments, or questions they want to explore

Use the writer's own framing and language where possible. Don't add interpretation, advice, or anything they didn't say. If a category wasn't discussed, omit it rather than inventing.

Plain prose, no headers, no bullets, no JSON. Two short paragraphs at most."""

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


def _try_extract_ready_payload(content: str) -> dict[str, Any] | None:
    """Try to extract a {"phase": "ready", ...} JSON payload from model output.

    Handles three common deviations from the spec:
    - Bare JSON (the happy path)
    - JSON wrapped in a ```json ... ``` or ``` ... ``` markdown fence
    - JSON with leading or trailing prose around it

    Returns the parsed dict if it looks like a ready-phase payload, else None.
    """
    candidates: list[str] = [content]

    # Strip a markdown fence if present (```json ... ``` or ``` ... ```)
    fence_match = re.search(
        r"```(?:json)?\s*(\{.*?\})\s*```",
        content,
        re.DOTALL | re.IGNORECASE,
    )
    if fence_match:
        candidates.append(fence_match.group(1))

    # Fall back to the first balanced-looking {...} block in the text
    brace_match = re.search(r"\{.*\}", content, re.DOTALL)
    if brace_match:
        candidates.append(brace_match.group(0))

    for candidate in candidates:
        try:
            parsed = json.loads(candidate.strip())
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(parsed, dict) and parsed.get("phase") == "ready":
            return parsed

    return None


_TITLE_PROMPT = """You are naming a writing project. Read the interview transcript and produce a short, specific project title (4–8 words) that captures what the writer is actually working on — using their framing, not yours.

Output only the title. No quotes, no punctuation at the end, no explanation."""


async def suggest_title(messages: list[dict]) -> str:
    """Return a short project title derived from the interview transcript."""
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
                    {"role": "system", "content": _TITLE_PROMPT},
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

    payload = _try_extract_ready_payload(content)
    if payload is not None:
        return payload

    return content.strip()
