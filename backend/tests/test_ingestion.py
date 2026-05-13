import hashlib
import json
import sqlite3
import threading

import pytest
import sqlite_vec

from backend.resource_store import ResourceStore
from backend.ingestion import IngestionService


# ── Helpers ──────────────────────────────────────────────────────────────────

def _prose(label: str) -> str:
    """Return a 30+ word prose chunk that survives the quality gate."""
    filler = "alpha beta gamma delta epsilon zeta theta iota kappa lambda " * 3
    return f"{label} {filler}".strip()


class FakeChunker:
    id = "fake-chunker-v0"

    def __init__(self, output: list[str] | None = None):
        self._output = output or [_prose("chunk-one"), _prose("chunk-two")]

    def chunk(self, text: str) -> list[str]:
        return self._output


class FakeEmbedder:
    id = "fake-embedder-v0"
    DIM = 384

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * self.DIM for _ in texts]


@pytest.fixture
def store(tmp_path):
    return ResourceStore(base_dir=tmp_path)


@pytest.fixture
def service(store):
    return IngestionService(store=store)


# ── Slice 3a: file upload — new resource ─────────────────────────────────────

def test_file_upload_new_resource_returns_queued(service):
    content = b"some file content"
    result = service.accept_file(content=content, resource_type="Book")
    assert result["indexing_status"] == "queued"
    assert result["resource_id"]


def test_file_upload_uses_sha256_as_identity(service):
    content = b"hello"
    result = service.accept_file(content=content, resource_type="Book")
    assert result["resource_id"]
    result2 = service.accept_file(content=content, resource_type="Book")
    assert result["resource_id"] == result2["resource_id"]


# ── Slice 3b: file dedup — existing resource ─────────────────────────────────

def test_file_upload_dedup_existing_ready_returns_ready(service, store):
    content = b"same content"
    sha256 = hashlib.sha256(content).hexdigest()
    resource = store.get_or_create(sha256, "Book")
    store.update_status(resource.id, "ready")

    result = service.accept_file(content=content, resource_type="Book")
    assert result["indexing_status"] == "ready"
    assert result["resource_id"] == resource.id


# ── Slice 3c: URL upload — new resource ──────────────────────────────────────

def test_url_upload_new_resource_returns_queued(service):
    result = service.accept_url(url="https://example.com/article")
    assert result["indexing_status"] == "queued"
    assert result["resource_id"]


# ── Slice 3d: URL dedup ───────────────────────────────────────────────────────

def test_url_upload_dedup_existing_ready_returns_ready(service, store):
    normalized = "https://example.com/article"
    resource = store.get_or_create(normalized, "Webpage")
    store.update_status(resource.id, "ready")

    result = service.accept_url(url=normalized)
    assert result["indexing_status"] == "ready"
    assert result["resource_id"] == resource.id


# ── Slice 3e: URL normalization ───────────────────────────────────────────────

def test_url_fragment_is_stripped(service, store):
    normalized = "https://example.com/page"
    resource = store.get_or_create(normalized, "Webpage")
    store.update_status(resource.id, "ready")

    result = service.accept_url(url="https://example.com/page#intro")
    assert result["resource_id"] == resource.id


def test_url_scheme_and_host_are_lowercased(service, store):
    normalized = "https://example.com/page"
    resource = store.get_or_create(normalized, "Webpage")
    store.update_status(resource.id, "ready")

    result = service.accept_url(url="HTTPS://EXAMPLE.COM/page")
    assert result["resource_id"] == resource.id


# ── Slice 4: status query ─────────────────────────────────────────────────────

def test_get_status_returns_queued_after_accept(service):
    result = service.accept_file(content=b"data", resource_type="Book")
    status = service.get_status(result["resource_id"])
    assert status["indexing_status"] == "queued"
    assert "chunks_done" in status
    assert "chunks_total" in status


def test_get_status_returns_none_for_unknown_resource(service):
    assert service.get_status("nonexistent-id") is None


# ── Slice 5a: ingestion run stores chunks + embeddings ────────────────────────

def test_ingestion_run_stores_chunks(service, store, tmp_path):
    resource = store.get_or_create("hash-x", "Book")
    service.run_ingestion(resource.id, "some text", FakeChunker([_prose("a"), _prose("b"), _prose("c")]), FakeEmbedder())

    con = sqlite3.connect(tmp_path / "resources.db")
    count = con.execute("SELECT COUNT(*) FROM chunks WHERE resource_id=?", (resource.id,)).fetchone()[0]
    con.close()
    assert count == 3


def test_ingestion_run_updates_status_to_ready(service, store):
    resource = store.get_or_create("hash-y", "Book")
    service.run_ingestion(resource.id, "some text", FakeChunker(), FakeEmbedder())

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "ready"
    assert status["chunks_done"] == 2
    assert status["chunks_total"] == 2


def test_ingestion_run_records_chunker_and_embedder_ids(service, store):
    resource = store.get_or_create("hash-z", "Book")
    service.run_ingestion(resource.id, "text", FakeChunker(), FakeEmbedder())

    con = sqlite3.connect(store._db_path)
    row = con.execute(
        "SELECT chunker_id, embedder_id FROM resources WHERE id=?", (resource.id,)
    ).fetchone()
    con.close()
    assert row[0] == "fake-chunker-v0"
    assert row[1] == "fake-embedder-v0"


# ── Slice 5b: ingestion failure ───────────────────────────────────────────────

def test_ingestion_run_sets_failed_on_embedder_error(service, store):
    class BrokenEmbedder:
        id = "broken"
        def embed(self, texts):
            raise RuntimeError("model unavailable")

    resource = store.get_or_create("hash-fail", "Book")
    service.run_ingestion(resource.id, "text", FakeChunker(), BrokenEmbedder())

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "failed"
    assert status["error_message"]


# ── Slice 5c: run_ingestion step transitions ──────────────────────────────────

def test_run_ingestion_sets_chunking_then_embedding_steps(store):
    resource = store.get_or_create("hash-steps-ri", "Book")
    service = IngestionService(store=store, chunker=FakeChunker(), embedder=FakeEmbedder())

    step_calls = []
    original_update_step = store.update_step
    def capture_step(rid, step):
        step_calls.append(step)
        return original_update_step(rid, step)

    from unittest.mock import patch
    with patch.object(store, "update_step", side_effect=capture_step):
        service.run_ingestion(resource.id, "some text", FakeChunker(), FakeEmbedder())

    assert step_calls == ["chunking", "embedding"]


# ── Slice 5d: run_file_pipeline extracting step ───────────────────────────────

def test_run_file_pipeline_sets_extracting_step(store):
    service = IngestionService(store=store, chunker=FakeChunker(), embedder=FakeEmbedder())
    content = b"Hello world text."
    result = service.accept_file(content=content, resource_type="Book")
    resource_id = result["resource_id"]

    step_calls = []
    original_update_step = store.update_step
    def capture_step(rid, step):
        step_calls.append(step)
        return original_update_step(rid, step)

    from unittest.mock import patch
    with patch.object(store, "update_step", side_effect=capture_step), \
         patch.object(service, "run_ingestion"):
        service.run_file_pipeline(resource_id, "test.txt")

    assert step_calls[0] == "extracting"


# ── Slice 5e: run_url_pipeline extracting step ────────────────────────────────

def test_run_url_pipeline_sets_extracting_step(store):
    service = IngestionService(store=store, chunker=FakeChunker(), embedder=FakeEmbedder())
    result = service.accept_url(url="https://example.com/page")
    resource_id = result["resource_id"]

    step_calls = []
    original_update_step = store.update_step
    def capture_step(rid, step):
        step_calls.append(step)
        return original_update_step(rid, step)

    fake_resp = __import__("unittest.mock", fromlist=["MagicMock"]).MagicMock()
    fake_resp.text = "<html><body><p>Article text.</p></body></html>"
    fake_resp.raise_for_status = lambda: None

    from unittest.mock import patch
    with patch.object(store, "update_step", side_effect=capture_step), \
         patch("backend.ingestion.httpx.get", return_value=fake_resp), \
         patch("backend.extractor.extract_url", return_value=("Article text.", {})), \
         patch.object(service, "run_ingestion"):
        service.run_url_pipeline(resource_id, "https://example.com/page")

    assert step_calls[0] == "extracting"


# ── Slice 6: per-batch cancellation ──────────────────────────────────────────

def test_run_ingestion_stops_before_second_batch_when_cancelled(store):
    cancel_event = threading.Event()

    class BatchCountingEmbedder:
        id = "counting"
        calls = 0

        def embed(self, texts):
            BatchCountingEmbedder.calls += 1
            cancel_event.set()  # set after first batch completes
            return [[0.1] * 384 for _ in texts]

    # 130 chunks → 3 batches with EMBED_BATCH=64
    chunks = [_prose(f"chunk-{i}") for i in range(130)]
    resource = store.get_or_create("hash-cancel-batch", "Book")
    service = IngestionService(store=store)
    service.run_ingestion(resource.id, "text", FakeChunker(chunks), BatchCountingEmbedder(), cancel_event=cancel_event)

    # Only the first batch should have been embedded
    assert BatchCountingEmbedder.calls == 1
    status = store.get_status(resource.id)
    assert status["indexing_status"] == "failed"
    assert "cancel" in (status["error_message"] or "").lower()


def test_run_ingestion_without_cancel_event_runs_fully(store):
    chunks = [_prose(f"chunk-{i}") for i in range(130)]
    resource = store.get_or_create("hash-no-cancel", "Book")
    service = IngestionService(store=store)
    service.run_ingestion(resource.id, "text", FakeChunker(chunks), FakeEmbedder())

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "ready"
    assert status["chunks_done"] == 130
