# ADR-0004: Semantic Ingester returns chunk boundaries, not chunk text

**Status:** Accepted
**Date:** 2026-05-11

The Semantic Ingester (LLM-driven Chunker) asks the OpenRouter model to emit chunk **boundaries** as `(page, paragraph_idx)` ranges plus a boilerplate-skip list, rather than re-emitting the verbatim chunk text. The backend pre-numbers paragraphs per page locally and slices the original extracted text using the returned indices.

## Context

The original Semantic Ingester ([semantic_ingester.py @ 22876d3](../../backend/backend/semantic_ingester.py)) prompted the LLM to emit each chunk's full verbatim text framed by `===CHUNK===` delimiters. For a 250-page book at batch size 40, each of the ~7 batches produced ~15-20k output tokens (most of the input echoed back). On free OpenRouter tiers (Hermes 3 405B, Llama 3.3 70B, Qwen3 80B — ~30-60 tok/s generation), a single batch took 5-7 minutes; the full ingest ran 35-50 min sequentially and tripped rate limits when parallelised.

The stated target is a **250-page book vectorised in ~2 min on a free OpenRouter model**. Verbatim output makes that arithmetically impossible — output tokens dominate.

## Decision

### 1. Output format

The LLM returns JSON of the shape:

```json
{
  "chunks": [
    {"start": [12, 1], "end": [12, 5]},
    {"start": [12, 6], "end": [13, 3]}
  ],
  "skip": [[14, 1], [14, 2]]
}
```

`(page, paragraph_idx)` pairs index into a paragraph table the backend builds locally from the extracted text (paragraph splits on `\n\n` per page; DOCX uses heading-bounded sections per existing extractor behaviour). The LLM only emits small integers.

Output drops from ~20k tokens/batch (verbatim) to ~100-500 tokens/batch (JSON), a 40-100× reduction on the output side. With parallelism 4, a 7-batch run completes in ~30-100s wallclock on a healthy free model — within the 2 min target.

### 2. Strict validation, one retry, per-batch fallback

Validation enforces: parseable JSON, every `(page, paragraph)` exists in the local paragraph table, no overlapping chunk ranges, no orphaned paragraphs (every paragraph appears in exactly one chunk or in `skip`). On failure: one retry with a tightened "you must include every paragraph exactly once" prompt. If that also fails, the batch falls back to `RecursiveChunker` over the same page range — the resource still completes.

Each Chunk records `chunker_id` (per-chunk, not per-resource): `semantic-ingester-v2` or `recursive-v1-fallback`. The Resource records `batches_total` and `batches_fallback`.

### 3. Soft-fail surface for mixed-quality ingests

Resources always land as `ready` (or `failed` only for catastrophic extraction errors). The UI is responsible for surfacing the ratio: when `batches_fallback / batches_total > 0.25`, the Resource row in the Resources tab and Job Tray displays "N of M batches used recursive fallback" with a "Re-ingest with recursive chunker" button. The user decides whether to accept the mixed result or re-run.

This deliberately rejects the alternative of marking such resources `failed`. The chunks are usable; recursive fallback is not garbage; the user has visibility and an escape hatch.

### 4. No batch overlap

The previous design used a 2-page overlap between batches so the verbatim-emitting model had cross-batch context. Boundaries-not-text removes the need: the LLM only makes paragraph-level decisions within each batch. Overlap is dropped (`_OVERLAP = 0`) — saves a full batch on a 250-page book and removes the dedup logic that filtered overlap-zone chunks.

## Consequences

- **No on-the-fly OCR cleanup.** The LLM no longer touches the chunk text; if the extracted text has line-break artifacts from a noisy PDF, those flow through unchanged. Accepted: search-time embedding is robust enough that minor whitespace noise doesn't materially hurt retrieval. If quality regressions appear on scanned PDFs, the per-batch fallback to RecursiveChunker handles those locally; or we add a targeted text-normalisation pass before chunking.
- **Per-chunk `chunker_id`.** Existing schema stores `chunker_id` at the Resource level. The new design moves it to the Chunks table; the Resource keeps `chunker_id` as the "primary path" indicator.
- **New columns on `resources`:** `batches_total`, `batches_fallback`.
- **Configurable concurrency:** `OPENROUTER_PARALLEL_BATCHES = 4`, `OPENROUTER_RPM_BUDGET = 18` (under the free-tier 20 RPM ceiling). Not exposed in Settings for v1.
- **Quality monitoring is a UI affordance, not a hard gate.** This is a deliberate weakening from the more aggressive "hard fail >25%" option we considered. Trade-off chosen for user agency.

## Considered alternatives

| Alternative | Reason rejected |
|---|---|
| Keep verbatim output, raise time budget to 10-15 min | Misses the stated 2-min target; forces user to wait through every ingest |
| Drop the Semantic Ingester entirely; use only `RecursiveChunker` + regex boilerplate heuristics | Loses the LLM's ability to recognise structural boilerplate (Table of Contents, References, repeating headers). Regex heuristics are brittle across document genres |
| Character offsets into concatenated text | LLMs miscount badly over 20k-token spans; produces silently corrupt chunks |
| Anchor strings (first ~20 chars of each chunk start) | Bigger output (~50× current proposal), needs substring-search disambiguation for duplicate anchors |
| Hard fail on >25% fallback (original recommendation) | User explicitly preferred to see counts and choose for themselves |
| Best-effort patching of bad LLM output | Silently corrupts the vector store; opaque to user |
