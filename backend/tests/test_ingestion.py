import hashlib
import json
import sqlite3

import pytest
import sqlite_vec

from backend.resource_store import ResourceStore
from backend.ingestion import IngestionService


# ── Helpers ──────────────────────────────────────────────────────────────────

class FakeChunker:
    id = "fake-chunker-v0"

    def __init__(self, output: list[str] | None = None):
        self._output = output or ["chunk one", "chunk two"]

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
    result = service.accept_file(project_id="proj-1", content=content, resource_type="Book")
    assert result["indexing_status"] == "queued"
    assert result["resource_id"]


def test_file_upload_uses_sha256_as_identity(service):
    content = b"hello"
    sha256 = hashlib.sha256(content).hexdigest()
    result = service.accept_file(project_id="proj-1", content=content, resource_type="Book")
    # The store key is the sha256
    assert result["resource_id"]
    # Calling again should deduplicate
    result2 = service.accept_file(project_id="proj-1", content=content, resource_type="Book")
    assert result["resource_id"] == result2["resource_id"]


# ── Slice 3b: file dedup — existing resource ─────────────────────────────────

def test_file_upload_dedup_existing_ready_returns_ready(service, store):
    content = b"same content"
    sha256 = hashlib.sha256(content).hexdigest()
    resource = store.get_or_create(sha256, "Book")
    store.update_status(resource.id, "ready")

    result = service.accept_file(project_id="proj-1", content=content, resource_type="Book")
    assert result["indexing_status"] == "ready"
    assert result["resource_id"] == resource.id


def test_file_upload_dedup_attaches_to_project(service, store):
    content = b"same content"
    sha256 = hashlib.sha256(content).hexdigest()
    resource = store.get_or_create(sha256, "Book")
    store.update_status(resource.id, "ready")

    service.accept_file(project_id="proj-1", content=content, resource_type="Book")
    assert any(r.id == resource.id for r in store.list_for_project("proj-1"))


# ── Slice 3c: URL upload — new resource ──────────────────────────────────────

def test_url_upload_new_resource_returns_queued(service):
    result = service.accept_url(project_id="proj-1", url="https://example.com/article")
    assert result["indexing_status"] == "queued"
    assert result["resource_id"]


# ── Slice 3d: URL dedup ───────────────────────────────────────────────────────

def test_url_upload_dedup_existing_ready_returns_ready(service, store):
    normalized = "https://example.com/article"
    resource = store.get_or_create(normalized, "Webpage")
    store.update_status(resource.id, "ready")

    result = service.accept_url(project_id="proj-1", url=normalized)
    assert result["indexing_status"] == "ready"
    assert result["resource_id"] == resource.id


# ── Slice 3e: URL normalization ───────────────────────────────────────────────

def test_url_fragment_is_stripped(service, store):
    normalized = "https://example.com/page"
    resource = store.get_or_create(normalized, "Webpage")
    store.update_status(resource.id, "ready")

    result = service.accept_url(project_id="proj-1", url="https://example.com/page#intro")
    assert result["resource_id"] == resource.id


def test_url_scheme_and_host_are_lowercased(service, store):
    normalized = "https://example.com/page"
    resource = store.get_or_create(normalized, "Webpage")
    store.update_status(resource.id, "ready")

    result = service.accept_url(project_id="proj-1", url="HTTPS://EXAMPLE.COM/page")
    assert result["resource_id"] == resource.id


# ── Slice 4: status query ─────────────────────────────────────────────────────

def test_get_status_returns_queued_after_accept(service):
    result = service.accept_file(project_id="proj-1", content=b"data", resource_type="Book")
    status = service.get_status(result["resource_id"])
    assert status["indexing_status"] == "queued"
    assert "chunks_done" in status
    assert "chunks_total" in status


def test_get_status_returns_none_for_unknown_resource(service):
    assert service.get_status("nonexistent-id") is None


# ── Slice 5a: ingestion run stores chunks + embeddings ────────────────────────

def test_ingestion_run_stores_chunks(service, store, tmp_path):
    resource = store.get_or_create("hash-x", "Book")
    service.run_ingestion(resource.id, "some text", FakeChunker(["a", "b", "c"]), FakeEmbedder())

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
