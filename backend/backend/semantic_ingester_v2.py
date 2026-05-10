"""SemanticIngesterV2: LLM returns chunk boundaries, not verbatim text.

ADR-0004: boundaries (page, para_idx) ranges + boilerplate skip list.
Output drops ~50x vs v1; 250-page book targets ~2 min on free OpenRouter model.
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Iterable

import httpx

from backend.chunker import RecursiveChunker
from backend.embedder import Embedder
from backend.resource_store import ResourceStore

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_BATCH_PAGES = 40
_OPENROUTER_PARALLEL_BATCHES = 4
_OPENROUTER_RPM_BUDGET = 18
_MAX_TRANSPORT_ATTEMPTS = 3


class ValidationError(Exception):
    pass


@dataclass
class BoundaryChunk:
    start: tuple[int, int]
    end: tuple[int, int]


class SemanticIngesterV2:
    id = "semantic-ingester-v2"

    def __init__(self, model: str, api_key: str) -> None:
        self._model = model
        self._api_key = api_key

    async def ingest(
        self,
        resource_id: str,
        pages: Iterable[tuple[int, str]],
        store: ResourceStore,
        embedder: Embedder,
    ) -> None:
        if not self._api_key:
            store.update_status(
                resource_id, "failed",
                error_message="Semantic ingestion requires an OpenRouter API key — add one in Settings.",
            )
            return
        try:
            store.update_status(resource_id, "indexing")
            page_list = list(pages)
            para_table = self._build_paragraph_table(page_list)
            batches = [page_list[i:i + _BATCH_PAGES] for i in range(0, len(page_list), _BATCH_PAGES)]
            total_batches = len(batches)

            sem = asyncio.Semaphore(_OPENROUTER_PARALLEL_BATCHES)

            async def _run_batch(idx: int, batch_pages: list[tuple[int, str]]):
                async with sem:
                    batch_page_nums = {p for p, _ in batch_pages}
                    batch_para_table = {k: v for k, v in para_table.items() if k[0] in batch_page_nums}
                    batch_step = f"chunking:{idx + 1}/{total_batches}"
                    store.update_step(resource_id, batch_step)
                    return await self._process_batch(batch_pages, batch_para_table, resource_id, store, batch_step)

            tasks = [_run_batch(i, batch) for i, batch in enumerate(batches)]
            batch_results = await asyncio.gather(*tasks)

            all_chunks: list[tuple[str, str | None, str]] = [
                item for chunks, _ in batch_results for item in chunks
            ]
            batches_fallback = sum(1 for _, used_fb in batch_results if used_fb)

            texts = [c[0] for c in all_chunks]
            locations = [c[1] for c in all_chunks]
            chunker_ids = [c[2] for c in all_chunks]

            store.update_step(resource_id, "embedding")
            embeddings = await asyncio.to_thread(embedder.embed, texts)
            store.store_chunks_and_embeddings(
                resource_id, texts, embeddings, self.id, embedder.id, locations, chunker_ids,
            )
            store.update_batches(resource_id, total_batches, batches_fallback)
        except Exception as exc:
            store.update_status(resource_id, "failed", error_message=str(exc))

    async def _process_batch(
        self,
        batch_pages: list[tuple[int, str]],
        batch_para_table: dict[tuple[int, int], str],
        resource_id: str,
        store: ResourceStore,
        batch_step: str,
    ) -> tuple[list[tuple[str, str | None, str]], bool]:
        """Returns (chunk_triples, used_fallback); each triple is (text, location, chunker_id)."""
        for attempt in range(2):
            prompt = self._build_prompt(batch_pages, batch_para_table, retry=attempt > 0)
            try:
                response_str = await self._call_openrouter_async(prompt, resource_id, store, batch_step)
                boundaries = self._validate_response(response_str, batch_para_table)
                chunks = self._slice_chunks(boundaries, batch_para_table)
                return [(text, loc, self.id) for text, loc in chunks], False
            except ValidationError:
                continue

        chunker = RecursiveChunker()
        batch_text = "\n\n".join(text for _, text in batch_pages)
        location = f"p. {batch_pages[0][0]}" if batch_pages else None
        fallback_chunks = chunker.chunk(batch_text)
        return [(text, location, "recursive-v1-fallback") for text in fallback_chunks], True

    async def _call_openrouter_async(
        self,
        prompt: str,
        resource_id: str,
        store: ResourceStore,
        resume_step: str,
    ) -> str:
        transport_fails = 0
        while True:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        _OPENROUTER_URL,
                        headers={"Authorization": f"Bearer {self._api_key}"},
                        json={"model": self._model, "messages": [{"role": "user", "content": prompt}]},
                        timeout=120.0,
                    )
            except httpx.TransportError as exc:
                transport_fails += 1
                if transport_fails < _MAX_TRANSPORT_ATTEMPTS:
                    await asyncio.sleep(2 ** transport_fails)
                    continue
                raise RuntimeError(
                    f"OpenRouter connection dropped after {_MAX_TRANSPORT_ATTEMPTS} attempts: {exc}"
                ) from exc

            if resp.status_code == 429:
                remaining = int(resp.headers.get("Retry-After", 60))
                while remaining > 0:
                    store.update_step(resource_id, f"rate_limited:{remaining}")
                    await asyncio.sleep(1)
                    remaining -= 1
                store.update_step(resource_id, resume_step)
                transport_fails = 0
                continue

            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise RuntimeError(
                    f"OpenRouter error {resp.status_code}: {resp.text[:300]}"
                ) from exc

            try:
                return resp.json()["choices"][0]["message"]["content"]
            except (KeyError, IndexError) as exc:
                raise RuntimeError(
                    f"Unexpected OpenRouter response (missing 'choices'): {resp.text[:300]}"
                ) from exc

    def _build_prompt(
        self,
        batch_pages: list[tuple[int, str]],
        para_table: dict[tuple[int, int], str],
        retry: bool = False,
    ) -> str:
        lines = []
        for page_no, _ in batch_pages:
            lines.append(f"[Page {page_no}]")
            paras = sorted(
                ((idx, text) for (p, idx), text in para_table.items() if p == page_no),
                key=lambda x: x[0],
            )
            for idx, text in paras:
                lines.append(f"{idx}. {text}")
            lines.append("")
        pages_text = "\n".join(lines)
        retry_line = (
            "\nIMPORTANT: You MUST account for every paragraph exactly once — "
            "in a chunk or in skip.\n"
        ) if retry else ""
        return (
            "You are chunking pages from a document. Your task:\n\n"
            "1. Group consecutive paragraphs into semantically coherent chunks.\n"
            "2. List boilerplate paragraphs (References, Bibliography, ToC, Copyright, Index, "
            "repeating headers/footers) in the `skip` array.\n"
            "3. Every paragraph must appear in exactly one chunk OR in `skip`. No orphans.\n\n"
            f"{retry_line}"
            'Output ONLY a JSON object:\n'
            '{"chunks": [{"start": [page, para], "end": [page, para]}, ...], "skip": [[page, para], ...]}\n\n'
            "---\n"
            f"{pages_text}"
        )

    @staticmethod
    def _build_paragraph_table(
        pages: Iterable[tuple[int, str]],
    ) -> dict[tuple[int, int], str]:
        table: dict[tuple[int, int], str] = {}
        for page_no, text in pages:
            paras = [p.strip() for p in text.split("\n\n") if p.strip()]
            for idx, para in enumerate(paras, start=1):
                table[(page_no, idx)] = para
        return table

    @staticmethod
    def _validate_response(
        response_str: str,
        para_table: dict[tuple[int, int], str],
    ) -> list[BoundaryChunk]:
        try:
            data = json.loads(response_str)
        except json.JSONDecodeError as exc:
            raise ValidationError(f"Response is not valid JSON: {exc}") from exc

        chunks_raw = data.get("chunks", [])
        if not chunks_raw:
            raise ValidationError("Response has empty 'chunks' array")

        skip_raw = data.get("skip", [])
        skip_set: set[tuple[int, int]] = set()
        for p in skip_raw:
            key = (int(p[0]), int(p[1]))
            if key not in para_table:
                raise ValidationError(f"skip entry {key} not in paragraph table")
            skip_set.add(key)

        all_paras = sorted(para_table.keys())
        covered: set[tuple[int, int]] = set()
        result: list[BoundaryChunk] = []

        for spec in chunks_raw:
            start = (int(spec["start"][0]), int(spec["start"][1]))
            end = (int(spec["end"][0]), int(spec["end"][1]))
            if start not in para_table:
                raise ValidationError(f"start {start} not in paragraph table")
            if end not in para_table:
                raise ValidationError(f"end {end} not in paragraph table")
            chunk_paras = {p for p in all_paras if start <= p <= end}
            overlap = chunk_paras & covered
            if overlap:
                raise ValidationError(f"overlapping chunk ranges at {overlap}")
            covered |= chunk_paras
            result.append(BoundaryChunk(start=start, end=end))

        covered |= skip_set
        orphans = set(all_paras) - covered
        if orphans:
            raise ValidationError(f"orphaned paragraphs: {orphans}")

        return result

    @staticmethod
    def _slice_chunks(
        boundaries: list[BoundaryChunk],
        para_table: dict[tuple[int, int], str],
    ) -> list[tuple[str, str | None]]:
        all_paras = sorted(para_table.keys())
        results: list[tuple[str, str | None]] = []
        for bc in boundaries:
            chunk_paras = [para_table[p] for p in all_paras if bc.start <= p <= bc.end]
            text = "\n\n".join(chunk_paras)
            results.append((text, f"p. {bc.start[0]}"))
        return results
