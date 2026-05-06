"""Shared OpenRouter HTTP helper with 429 retry."""
import asyncio

import httpx

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_MAX_RETRIES = 3
_BACKOFF = [3, 8, 20]  # seconds between attempts


async def openrouter_post(api_key: str, model: str, messages: list[dict]) -> httpx.Response:
    """POST to OpenRouter with exponential backoff on 429. Raises on other errors."""
    headers = {"Authorization": f"Bearer {api_key}"}
    payload = {"model": model, "messages": messages}

    async with httpx.AsyncClient(timeout=90.0) as client:
        for wait in _BACKOFF:
            response = await client.post(_OPENROUTER_URL, headers=headers, json=payload)
            if response.status_code < 400:
                return response
            # retry on 429 (rate limit) and 5xx (provider error) — anything else is a hard failure
            if response.status_code not in (429, 500, 502, 503):
                response.raise_for_status()
            retry_after = response.headers.get("Retry-After")
            sleep_for = int(retry_after) if retry_after and retry_after.isdigit() else wait
            await asyncio.sleep(sleep_for)

        # final attempt — let raise_for_status carry the original response so callers can read the body
        response = await client.post(_OPENROUTER_URL, headers=headers, json=payload)
        response.raise_for_status()
        return response
