"""TDD suite for SemanticIngesterV2 (issue #50).

Vertical slices: validator → para table → slicer → fallback → async ingest.
"""
from __future__ import annotations

import json
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.semantic_ingester_v2 import (
    BoundaryChunk,
    SemanticIngesterV2,
    ValidationError,
)


# ── Helpers ──────────────────────────────────────────────────────────────────


class FakeEmbedder:
    id = "fake-embedder-v0"
    DIM = 384

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * self.DIM for _ in texts]


@pytest.fixture
def store(tmp_path):
    from backend.resource_store import ResourceStore
    return ResourceStore(base_dir=tmp_path)


def _para_table_9():
    """Nine paragraphs across two pages — reusable in validator tests."""
    return {
        (12, 1): "First para.",
        (12, 2): "Second para.",
        (12, 3): "Third para.",
        (12, 4): "Fourth para.",
        (12, 5): "Fifth para.",
        (12, 6): "Sixth para.",
        (13, 1): "Page 13 para 1.",
        (13, 2): "Page 13 para 2.",
        (13, 3): "Page 13 para 3.",
    }


def _ok_response_9() -> str:
    """Valid boundary JSON covering all 9 paragraphs."""
    return json.dumps({
        "chunks": [
            {"start": [12, 1], "end": [12, 5]},
            {"start": [12, 6], "end": [13, 3]},
        ],
        "skip": [],
    })


def _async_openrouter_mock(content: str):
    """Return a mock httpx.AsyncClient context manager that replies with `content`."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"choices": [{"message": {"content": content}}]}

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)

    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
    mock_cm.__aexit__ = AsyncMock(return_value=None)

    return mock_cm, mock_resp


# ── Phase 1: Validator ────────────────────────────────────────────────────────


def test_validate_response_valid_input():
    """Tracer bullet: valid JSON → correct BoundaryChunk list."""
    chunks = SemanticIngesterV2._validate_response(_ok_response_9(), _para_table_9())
    assert len(chunks) == 2
    assert chunks[0].start == (12, 1)
    assert chunks[0].end == (12, 5)
    assert chunks[1].start == (12, 6)
    assert chunks[1].end == (13, 3)


def test_validate_response_malformed_json():
    with pytest.raises(ValidationError, match="not valid JSON"):
        SemanticIngesterV2._validate_response("not json at all", _para_table_9())


def test_validate_response_index_out_of_range():
    """Para index that doesn't exist in the para table → ValidationError."""
    response = json.dumps({
        "chunks": [{"start": [12, 1], "end": [12, 99]}],  # para 99 doesn't exist
        "skip": [],
    })
    with pytest.raises(ValidationError):
        SemanticIngesterV2._validate_response(response, _para_table_9())


def test_validate_response_overlapping_chunks():
    response = json.dumps({
        "chunks": [
            {"start": [12, 1], "end": [12, 4]},
            {"start": [12, 3], "end": [13, 3]},  # overlaps at (12,3) and (12,4)
        ],
        "skip": [],
    })
    with pytest.raises(ValidationError, match="overlap"):
        SemanticIngesterV2._validate_response(response, _para_table_9())


def test_validate_response_orphaned_paragraph():
    """A paragraph not in any chunk and not in skip → ValidationError."""
    response = json.dumps({
        "chunks": [
            {"start": [12, 1], "end": [12, 5]},
            # (12,6) through (13,3) are missing — orphaned
        ],
        "skip": [],
    })
    with pytest.raises(ValidationError, match="orphan"):
        SemanticIngesterV2._validate_response(response, _para_table_9())


def test_validate_response_empty_chunks():
    response = json.dumps({"chunks": [], "skip": []})
    with pytest.raises(ValidationError, match="empty"):
        SemanticIngesterV2._validate_response(response, _para_table_9())


# ── Phase 2: Paragraph table + text slicer ───────────────────────────────────


def test_build_paragraph_table():
    pages = [
        (5, "Alpha.\n\nBeta.\n\nGamma."),
        (6, "Delta.\n\nEpsilon."),
    ]
    table = SemanticIngesterV2._build_paragraph_table(pages)
    assert table[(5, 1)] == "Alpha."
    assert table[(5, 2)] == "Beta."
    assert table[(5, 3)] == "Gamma."
    assert table[(6, 1)] == "Delta."
    assert table[(6, 2)] == "Epsilon."


def test_slice_chunks():
    para_table = {
        (5, 1): "Alpha.",
        (5, 2): "Beta.",
        (5, 3): "Gamma.",
        (6, 1): "Delta.",
        (6, 2): "Epsilon.",
    }
    boundaries = [
        BoundaryChunk(start=(5, 1), end=(5, 3)),
        BoundaryChunk(start=(6, 1), end=(6, 2)),
    ]
    results = SemanticIngesterV2._slice_chunks(boundaries, para_table)
    assert len(results) == 2
    text0, loc0 = results[0]
    assert text0 == "Alpha.\n\nBeta.\n\nGamma."
    assert loc0 == "p. 5"
    text1, loc1 = results[1]
    assert text1 == "Delta.\n\nEpsilon."
    assert loc1 == "p. 6"


# ── Phase 3: Per-batch fallback ───────────────────────────────────────────────


def _make_ingester():
    return SemanticIngesterV2(model="test-model", api_key="sk-test")


async def test_paragraph_fallback_emits_one_chunk_per_para(store):
    """Two consecutive ValidationErrors → one chunk per paragraph, tagged paragraph-v1-fallback."""
    resource = store.get_or_create("hash-v2-fb", "Book")
    ingester = _make_ingester()

    mock_cm, _ = _async_openrouter_mock("not json")

    with patch("backend.semantic_ingester_v2.httpx.AsyncClient", return_value=mock_cm):
        await ingester.ingest(
            resource.id,
            [(1, "Para one.\n\nPara two.")],
            store,
            FakeEmbedder(),
        )

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "ready"
    chunks = store.get_chunks(resource.id)
    assert len(chunks) == 2
    assert {c["text"] for c in chunks} == {"Para one.", "Para two."}
    assert all(c["chunker_id"] == "paragraph-v1-fallback" for c in chunks)


async def test_paragraph_fallback_location_per_page(store):
    """Each fallback chunk location reflects its own paragraph's page, not the batch start."""
    resource = store.get_or_create("hash-v2-fb-loc", "Book")
    ingester = _make_ingester()

    mock_cm, _ = _async_openrouter_mock("not json")

    import backend.semantic_ingester_v2 as mod
    original = mod._BATCH_PAGES
    mod._BATCH_PAGES = 10  # keep both pages in one batch
    try:
        with patch("backend.semantic_ingester_v2.httpx.AsyncClient", return_value=mock_cm):
            await ingester.ingest(
                resource.id,
                [(3, "Alpha.\n\nBeta."), (4, "Gamma.")],
                store,
                FakeEmbedder(),
            )
    finally:
        mod._BATCH_PAGES = original

    chunks = store.get_chunks(resource.id)
    by_text = {c["text"]: c["location"] for c in chunks}
    assert by_text["Alpha."] == "p. 3"
    assert by_text["Beta."] == "p. 3"
    assert by_text["Gamma."] == "p. 4"


async def test_fallback_increments_batches_fallback(store):
    """A batch that falls back increments batches_fallback; clean batch doesn't."""
    resource = store.get_or_create("hash-v2-ctr", "Book")
    ingester = _make_ingester()

    # Produce enough pages for 2 batches: first batch fails, second succeeds
    # Use a tiny BATCH_PAGES to make this feasible in tests — we'll monkeypatch the constant
    page_one = (1, "Para A.\n\nPara B.")
    page_two = (2, "Para C.\n\nPara D.")

    # First call (batch 1) → bad JSON; second call (batch 1 retry) → bad JSON;
    # third call (batch 2) → valid response for page 2 only
    valid_batch2 = json.dumps({
        "chunks": [{"start": [2, 1], "end": [2, 2]}],
        "skip": [],
    })

    call_count = 0

    async def fake_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        resp.status_code = 200
        resp.raise_for_status = MagicMock()
        if call_count <= 2:
            resp.json.return_value = {"choices": [{"message": {"content": "not json"}}]}
        else:
            resp.json.return_value = {"choices": [{"message": {"content": valid_batch2}}]}
        return resp

    mock_client = AsyncMock()
    mock_client.post = fake_post
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
    mock_cm.__aexit__ = AsyncMock(return_value=None)

    import backend.semantic_ingester_v2 as mod
    original = mod._BATCH_PAGES
    mod._BATCH_PAGES = 1  # force 2 batches (1 page each)
    try:
        with patch("backend.semantic_ingester_v2.httpx.AsyncClient", return_value=mock_cm):
            await ingester.ingest(resource.id, [page_one, page_two], store, FakeEmbedder())
    finally:
        mod._BATCH_PAGES = original

    status = store.get_status(resource.id)
    assert status["batches_total"] == 2
    assert status["batches_fallback"] == 1


# ── Phase 4: Async ingest — API integration ───────────────────────────────────


async def test_ingest_fails_fast_when_no_api_key(store):
    resource = store.get_or_create("hash-v2-nokey", "Book")
    ingester = SemanticIngesterV2(model="test-model", api_key="")

    with patch("backend.semantic_ingester_v2.httpx.AsyncClient") as mock_cls:
        await ingester.ingest(resource.id, [(1, "text")], store, FakeEmbedder())
        mock_cls.assert_not_called()

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "failed"
    assert "OpenRouter API key" in status["error_message"]


async def test_ingest_happy_path_stores_chunks_and_sets_ready(store):
    resource = store.get_or_create("hash-v2-ok", "Book")
    ingester = _make_ingester()

    pages = [(1, "Para one.\n\nPara two.\n\nPara three.")]
    llm_content = json.dumps({
        "chunks": [{"start": [1, 1], "end": [1, 3]}],
        "skip": [],
    })
    mock_cm, _ = _async_openrouter_mock(llm_content)

    with patch("backend.semantic_ingester_v2.httpx.AsyncClient", return_value=mock_cm):
        await ingester.ingest(resource.id, iter(pages), store, FakeEmbedder())

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "ready"
    assert status["chunks_done"] == 1
    assert status["chunks_total"] == 1
    assert status["batches_total"] == 1
    assert status["batches_fallback"] == 0


async def test_ingest_retries_after_rate_limit(store):
    resource = store.get_or_create("hash-v2-rl", "Book")
    ingester = _make_ingester()

    llm_content = json.dumps({
        "chunks": [{"start": [1, 1], "end": [1, 1]}],
        "skip": [],
    })

    call_count = 0

    async def fake_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            resp = MagicMock()
            resp.status_code = 429
            resp.headers = {"Retry-After": "1"}
            return resp
        resp = MagicMock()
        resp.status_code = 200
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {"choices": [{"message": {"content": llm_content}}]}
        return resp

    mock_client = AsyncMock()
    mock_client.post = fake_post
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
    mock_cm.__aexit__ = AsyncMock(return_value=None)

    with patch("backend.semantic_ingester_v2.httpx.AsyncClient", return_value=mock_cm):
        with patch("backend.semantic_ingester_v2.asyncio.sleep", new_callable=AsyncMock):
            await ingester.ingest(
                resource.id,
                [(1, "Single para.")],
                store,
                FakeEmbedder(),
            )

    assert call_count == 2
    status = store.get_status(resource.id)
    assert status["indexing_status"] == "ready"
