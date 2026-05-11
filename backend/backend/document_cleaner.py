"""DocumentCleaner: LLM-driven structural noise removal before semantic ingestion.

Samples first + last N pages, asks the LLM to identify content that hurts
semantic search quality, and applies the returned rules deterministically to
all pages before handing off to SemanticIngesterV2.

Non-fatal: any LLM failure returns the original pages unchanged.

Issue #54.
"""
from __future__ import annotations

import json
import re

import httpx

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_SAMPLE_N = 5


class DocumentCleaner:
    def __init__(self, model: str, api_key: str) -> None:
        self._model = model
        self._api_key = api_key

    async def clean(self, pages: list[tuple[int, str]]) -> list[tuple[int, str]]:
        try:
            rules = await self._get_rules(pages)
            return self._apply_rules(pages, rules)
        except Exception as exc:
            print(f"[DocumentCleaner] failed ({exc!r}) — continuing with uncleaned pages")
            return pages

    async def _get_rules(self, pages: list[tuple[int, str]]) -> dict:
        sample = self._sample_pages(pages, _SAMPLE_N)
        prompt = self._build_prompt(sample)
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                _OPENROUTER_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"model": self._model, "messages": [{"role": "user", "content": prompt}]},
                timeout=60.0,
            )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return json.loads(content)

    @staticmethod
    def _sample_pages(pages: list[tuple[int, str]], n: int) -> list[tuple[int, str]]:
        if len(pages) <= n * 2:
            return pages
        seen: set[int] = set()
        result = []
        for p in pages[:n] + pages[-n:]:
            if p[0] not in seen:
                seen.add(p[0])
                result.append(p)
        return result

    @staticmethod
    def _build_prompt(sample_pages: list[tuple[int, str]]) -> str:
        pages_text = "\n\n".join(
            f"[Page {page_no}]\n{text}" for page_no, text in sample_pages
        )
        return (
            "You are analyzing a document sample to identify content that would hurt semantic search quality.\n\n"
            "Identify structural noise — running headers, footers, bibliography sections, "
            "inline citation patterns, page numbers, and other boilerplate — based on their "
            "IMPACT on semantic search quality, not by their names.\n\n"
            "Return ONLY a JSON object with these fields:\n"
            '  "strip_first_n_lines_per_page": integer (0 if no header to strip)\n'
            '  "strip_pages": list of [start, end] inclusive page number ranges to remove entirely\n'
            '  "strip_patterns": list of regex patterns to strip from page text\n\n'
            'Example: {"strip_first_n_lines_per_page": 1, "strip_pages": [[142, 158]], '
            '"strip_patterns": ["\\\\[\\\\d+\\\\]", "\\\\(\\\\w+,\\\\s*\\\\d{4}\\\\)"]}\n\n'
            f"Document sample:\n\n{pages_text}\n\nReturn only the JSON object."
        )

    @staticmethod
    def _apply_rules(pages: list[tuple[int, str]], rules: dict) -> list[tuple[int, str]]:
        n_strip = int(rules.get("strip_first_n_lines_per_page", 0))
        strip_ranges = rules.get("strip_pages", [])
        strip_patterns = rules.get("strip_patterns", [])

        strip_page_nos: set[int] = set()
        for start, end in strip_ranges:
            for p in range(int(start), int(end) + 1):
                strip_page_nos.add(p)

        result = []
        for page_no, text in pages:
            if page_no in strip_page_nos:
                print(f"[DocumentCleaner] stripped page {page_no} (strip_pages rule)")
                continue

            if n_strip > 0:
                lines = text.split("\n")
                text = "\n".join(lines[n_strip:])

            for pattern in strip_patterns:
                try:
                    text = re.sub(pattern, "", text)
                except re.error as exc:
                    print(f"[DocumentCleaner] skipping invalid pattern {pattern!r}: {exc}")

            if text.strip():
                result.append((page_no, text))
            else:
                print(f"[DocumentCleaner] dropped page {page_no} (empty after stripping)")

        return result
