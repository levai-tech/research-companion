from __future__ import annotations

import re
from dataclasses import dataclass

import httpx

from backend.embedder import Embedder
from backend.resource_store import ResourceStore

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_CHUNK_DELIMITER = "===CHUNK==="
_BATCH_SIZE = 40
_OVERLAP = 2


@dataclass
class ChunkResult:
    text: str
    location: str | None


class SemanticIngester:
    id = "semantic-ingester-v1"

    def __init__(self, model: str, api_key: str) -> None:
        self._model = model
        self._api_key = api_key

    def ingest(
        self,
        resource_id: str,
        pages: list[tuple[int, str]],
        store: ResourceStore,
        embedder: Embedder,
    ) -> None:
        if not self._api_key:
            store.update_status(
                resource_id, "failed",
                error_message="Semantic ingestion requires an OpenRouter API key — add one in Settings."
            )
            return
        try:
            store.update_status(resource_id, "indexing")
            all_results: list[ChunkResult] = []
            stride = _BATCH_SIZE - _OVERLAP
            for i in range(0, len(pages), stride):
                start = i
                batch = pages[start : start + _BATCH_SIZE]
                overlap_page_nums: set[int] = (
                    {pages[start][0], pages[start + 1][0]} if i > 0 and len(pages) > start + 1
                    else {pages[start][0]} if i > 0
                    else set()
                )
                response_text = self._call_openrouter(batch, overlap_page_nums)
                all_results.extend(self._parse_response(response_text, overlap_page_nums))

            texts = [r.text for r in all_results]
            locations = [r.location for r in all_results]
            embeddings = embedder.embed(texts)
            store.store_chunks_and_embeddings(
                resource_id, texts, embeddings, self.id, embedder.id, locations
            )
        except Exception as exc:
            store.update_status(resource_id, "failed", error_message=str(exc))

    def _call_openrouter(self, batch: list[tuple[int, str]], overlap_page_nums: set[int]) -> str:
        pages_text = "\n\n".join(f"[Page {n}]\n{text}" for n, text in batch)
        if overlap_page_nums:
            page_list = ", ".join(f"p. {n}" for n in sorted(overlap_page_nums))
            skip_line = f"\nSkip any chunks that begin on {page_list} (overlap zone — context only)."
        else:
            skip_line = ""
        prompt = (
            "You are processing pages from a book or document. Your task:\n\n"
            "1. STRIP boilerplate sections (References, Bibliography, Table of Contents, "
            "Copyright notices, Index, repeating headers/footers). Do not output chunks from these.\n\n"
            "2. SPLIT the remaining verbatim text at natural semantic boundaries.\n\n"
            "3. Output each chunk in this exact format:\n"
            "===CHUNK===\n"
            "LOCATION: p. <page_number>\n"
            "<verbatim text>\n"
            f"{skip_line}\n\n"
            "Output ONLY the chunks. No commentary, no preamble.\n\n"
            "---\n"
            f"{pages_text}"
        )
        try:
            resp = httpx.post(
                _OPENROUTER_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"model": self._model, "messages": [{"role": "user", "content": prompt}]},
                timeout=120.0,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                "Semantic ingestion requires Claude API — check your OpenRouter API key"
            ) from exc
        return resp.json()["choices"][0]["message"]["content"]

    @staticmethod
    def _parse_response(response: str, overlap_page_nums: set[int]) -> list[ChunkResult]:
        parts = response.split(_CHUNK_DELIMITER)
        results: list[ChunkResult] = []
        for part in parts[1:]:
            part = part.strip()
            if not part:
                continue
            lines = part.split("\n", 1)
            if lines[0].startswith("LOCATION:"):
                location = lines[0][len("LOCATION:"):].strip()
                text = lines[1].strip() if len(lines) > 1 else ""
            else:
                location = None
                text = part
            if not text:
                continue
            if location and overlap_page_nums:
                page_num = _location_page_number(location)
                if page_num is not None and page_num in overlap_page_nums:
                    continue
            results.append(ChunkResult(text=text, location=location))
        return results


def _location_page_number(location: str) -> int | None:
    m = re.match(r"p\.\s*(\d+)", location.strip(), re.IGNORECASE)
    return int(m.group(1)) if m else None
