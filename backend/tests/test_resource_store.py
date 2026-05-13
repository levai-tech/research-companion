import json
import sqlite3

import pytest
import sqlite_vec

from backend.resource_store import ResourceStore


@pytest.fixture
def store(tmp_path):
    return ResourceStore(base_dir=tmp_path)


# ── Behavior 1: schema ────────────────────────────────────────────────────────

def test_schema_creates_resources_db_and_sources_dir(store, tmp_path):
    assert (tmp_path / "resources.db").is_file()
    assert (tmp_path / "sources").is_dir()


def test_schema_version_table_exists(store, tmp_path):
    con = sqlite3.connect(tmp_path / "resources.db")
    names = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    con.close()
    assert "schema_version" in names


def test_schema_version_idempotent(tmp_path):
    ResourceStore(base_dir=tmp_path)
    ResourceStore(base_dir=tmp_path)
    con = sqlite3.connect(tmp_path / "resources.db")
    count = con.execute("SELECT COUNT(*) FROM schema_version").fetchone()[0]
    con.close()
    assert count == 1


def _seed_old_db(tmp_path):
    """Create a pre-schema_version DB with data, as if from a previous install."""
    db_path = tmp_path / "resources.db"
    con = sqlite3.connect(db_path)
    con.execute(
        "CREATE TABLE resources (id TEXT PRIMARY KEY, content_hash TEXT NOT NULL UNIQUE,"
        " resource_type TEXT NOT NULL, indexing_status TEXT NOT NULL DEFAULT 'queued',"
        " citation_metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)"
    )
    con.execute(
        "CREATE TABLE chunks (id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, text TEXT NOT NULL, position INTEGER NOT NULL)"
    )
    con.execute("INSERT INTO resources VALUES ('r1','h1','Book','ready','{}','2026-01-01')")
    con.execute("INSERT INTO chunks VALUES ('c1','r1','old text',0)")
    con.commit()
    con.close()


def test_destructive_migration_drops_chunks_and_resources(tmp_path):
    _seed_old_db(tmp_path)
    ResourceStore(base_dir=tmp_path)
    con = sqlite3.connect(tmp_path / "resources.db")
    resources_count = con.execute("SELECT COUNT(*) FROM resources").fetchone()[0]
    chunks_count = con.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    con.close()
    assert resources_count == 0
    assert chunks_count == 0


def test_destructive_migration_wipes_sources_dir(tmp_path):
    _seed_old_db(tmp_path)
    sources_dir = tmp_path / "sources"
    sources_dir.mkdir(exist_ok=True)
    (sources_dir / "old_file.bin").write_bytes(b"stale data")
    ResourceStore(base_dir=tmp_path)
    assert not (sources_dir / "old_file.bin").exists()


def test_destructive_migration_runs_only_once(tmp_path):
    _seed_old_db(tmp_path)
    store = ResourceStore(base_dir=tmp_path)
    resource = store.get_or_create("new-hash", "Book")
    ResourceStore(base_dir=tmp_path)
    con = sqlite3.connect(tmp_path / "resources.db")
    count = con.execute("SELECT COUNT(*) FROM resources WHERE id=?", (resource.id,)).fetchone()[0]
    con.close()
    assert count == 1


def test_schema_resources_and_chunks_tables_exist(store, tmp_path):
    con = sqlite3.connect(tmp_path / "resources.db")
    names = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    con.close()
    assert "resources" in names
    assert "chunks" in names


def test_schema_embeddings_virtual_table_exists(store, tmp_path):
    con = sqlite3.connect(tmp_path / "resources.db")
    con.enable_load_extension(True)
    sqlite_vec.load(con)
    con.enable_load_extension(False)
    names = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    con.close()
    assert "embeddings" in names


def test_schema_chunks_has_location_column(store, tmp_path):
    con = sqlite3.connect(tmp_path / "resources.db")
    cols = {r[1] for r in con.execute("PRAGMA table_info(chunks)").fetchall()}
    con.close()
    assert "location" in cols


def test_schema_chunks_has_chunker_id_column(store, tmp_path):
    con = sqlite3.connect(tmp_path / "resources.db")
    cols = {r[1] for r in con.execute("PRAGMA table_info(chunks)").fetchall()}
    con.close()
    assert "chunker_id" in cols


def test_store_chunks_per_chunk_chunker_id_round_trips(store, tmp_path):
    resource = store.get_or_create("hash-cid", "Book")
    chunks = ["semantic chunk", "fallback chunk"]
    embeddings = [[0.1] * 384, [0.2] * 384]
    chunker_ids = ["semantic-ingester-v2", "recursive-v1-fallback"]

    store.store_chunks_and_embeddings(
        resource.id, chunks, embeddings, "semantic-ingester-v2", "embedder-v1",
        chunker_ids=chunker_ids,
    )

    con = sqlite3.connect(tmp_path / "resources.db")
    rows = con.execute(
        "SELECT text, chunker_id FROM chunks WHERE resource_id=? ORDER BY position",
        (resource.id,),
    ).fetchall()
    con.close()
    assert rows == [("semantic chunk", "semantic-ingester-v2"), ("fallback chunk", "recursive-v1-fallback")]


def test_store_chunks_without_chunker_ids_uses_resource_chunker_id(store, tmp_path):
    resource = store.get_or_create("hash-cid-default", "Book")
    chunks = ["only chunk"]
    embeddings = [[0.1] * 384]

    store.store_chunks_and_embeddings(
        resource.id, chunks, embeddings, "recursive-v1-fallback", "embedder-v1",
    )

    con = sqlite3.connect(tmp_path / "resources.db")
    row = con.execute(
        "SELECT chunker_id FROM chunks WHERE resource_id=?", (resource.id,)
    ).fetchone()
    con.close()
    assert row[0] == "recursive-v1-fallback"


def test_store_chunks_executemany_correct_count(store, tmp_path):
    resource = store.get_or_create("hash-many", "Book")
    n = 5
    store.store_chunks_and_embeddings(
        resource.id,
        chunks=[f"chunk {i}" for i in range(n)],
        embeddings=[[float(i) / 10] * 384 for i in range(n)],
        chunker_id="c",
        embedder_id="e",
    )
    con = sqlite3.connect(tmp_path / "resources.db")
    con.enable_load_extension(True)
    sqlite_vec.load(con)
    con.enable_load_extension(False)
    chunk_count = con.execute("SELECT COUNT(*) FROM chunks WHERE resource_id=?", (resource.id,)).fetchone()[0]
    emb_count = con.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0]
    con.close()
    assert chunk_count == n
    assert emb_count == n


def test_store_chunks_and_embeddings_stores_locations(store, tmp_path):
    resource = store.get_or_create("hash-loc", "Book")
    chunks = ["first chunk", "second chunk"]
    embeddings = [[0.1] * 384, [0.2] * 384]
    locations = ["p. 1", "p. 2"]

    store.store_chunks_and_embeddings(
        resource.id, chunks, embeddings, "chunker-v1", "embedder-v1",
        locations=locations,
    )

    con = sqlite3.connect(tmp_path / "resources.db")
    rows = con.execute(
        "SELECT text, location FROM chunks WHERE resource_id=? ORDER BY position",
        (resource.id,),
    ).fetchall()
    con.close()
    assert rows == [("first chunk", "p. 1"), ("second chunk", "p. 2")]


def test_store_chunks_without_locations_stores_null(store, tmp_path):
    resource = store.get_or_create("hash-noloc", "Book")
    chunks = ["only chunk"]
    embeddings = [[0.1] * 384]

    store.store_chunks_and_embeddings(
        resource.id, chunks, embeddings, "chunker-v1", "embedder-v1",
    )

    con = sqlite3.connect(tmp_path / "resources.db")
    row = con.execute(
        "SELECT location FROM chunks WHERE resource_id=?", (resource.id,)
    ).fetchone()
    con.close()
    assert row[0] is None


# ── Behavior 2: get_or_create creates ─────────────────────────────────────────

def test_get_or_create_returns_resource_with_queued_status(store):
    resource = store.get_or_create("abc123", "Book")
    assert resource.id
    assert resource.content_hash == "abc123"
    assert resource.resource_type == "Book"
    assert resource.indexing_status == "queued"
    assert resource.created_at


def test_get_or_create_stores_citation_metadata(store):
    meta = {"author": "Alice", "title": "My Book"}
    resource = store.get_or_create("abc123", "Book", citation_metadata=meta)
    assert resource.citation_metadata == meta


# ── Behavior 3: get_or_create deduplicates ────────────────────────────────────

def test_get_or_create_returns_existing_resource_on_duplicate_hash(store):
    first = store.get_or_create("abc123", "Book")
    second = store.get_or_create("abc123", "Book")
    assert first.id == second.id


def test_get_or_create_does_not_insert_duplicate_row(store, tmp_path):
    store.get_or_create("abc123", "Book")
    store.get_or_create("abc123", "Book")
    con = sqlite3.connect(tmp_path / "resources.db")
    count = con.execute("SELECT COUNT(*) FROM resources WHERE content_hash='abc123'").fetchone()[0]
    con.close()
    assert count == 1


# ── Behavior 3b: get_or_create resets failed resources ───────────────────────

def test_get_or_create_resets_failed_resource_to_queued(store):
    resource = store.get_or_create("abc-fail", "Book")
    store.update_status(resource.id, "failed", error_message="something went wrong")

    reset = store.get_or_create("abc-fail", "Book")

    assert reset.id == resource.id
    assert reset.indexing_status == "queued"
    status = store.get_status(resource.id)
    assert status["error_message"] is None
    assert status["indexing_status"] == "queued"


def test_get_or_create_clears_partial_chunks_on_failed_reset(store):
    import sqlite3 as _sqlite3
    from pathlib import Path
    resource = store.get_or_create("abc-partial", "Book")
    # Simulate partial ingestion leaving chunks behind
    texts = ["chunk one", "chunk two"]
    embeddings = [[0.1] * 384, [0.2] * 384]
    store.update_status(resource.id, "indexing", chunks_total=2)
    store.store_chunks_and_embeddings(resource.id, texts, embeddings, "chunker-v1", "embedder-v1")
    store.update_status(resource.id, "failed", error_message="embedding blew up")

    store.get_or_create("abc-partial", "Book")

    db_path = store._db_path
    con = _sqlite3.connect(db_path)
    chunk_count = con.execute(
        "SELECT COUNT(*) FROM chunks WHERE resource_id=?", (resource.id,)
    ).fetchone()[0]
    con.close()
    assert chunk_count == 0


# ── Behavior 4: list_all ──────────────────────────────────────────────────────

def test_list_all_returns_empty_when_no_resources(store):
    assert store.list_all() == []


def test_list_all_returns_all_resources(store):
    r1 = store.get_or_create("hash-a", "Book")
    r2 = store.get_or_create("hash-b", "Press/Journal Article")

    resources = store.list_all()
    ids = {r.id for r in resources}
    assert ids == {r1.id, r2.id}


# ── Behavior 5: delete ───────────────────────────────────────────────────────

def test_delete_removes_resource_row(store, tmp_path):
    resource = store.get_or_create("hash-a", "Book")

    store.delete(resource.id)

    con = sqlite3.connect(tmp_path / "resources.db")
    row = con.execute("SELECT id FROM resources WHERE id=?", (resource.id,)).fetchone()
    con.close()
    assert row is None


def test_delete_removes_chunks_and_embeddings(store, tmp_path):
    resource = store.get_or_create("hash-a", "Book")
    con = sqlite3.connect(tmp_path / "resources.db")
    con.enable_load_extension(True)
    sqlite_vec.load(con)
    con.enable_load_extension(False)
    chunk_id = "chunk-001"
    con.execute(
        "INSERT INTO chunks (id, resource_id, text, position) VALUES (?, ?, ?, ?)",
        (chunk_id, resource.id, "some text", 0),
    )
    con.execute(
        "INSERT INTO embeddings (chunk_id, embedding) VALUES (?, ?)",
        (chunk_id, json.dumps([0.1] * 384)),
    )
    con.commit()
    con.close()

    store.delete(resource.id)

    con = sqlite3.connect(tmp_path / "resources.db")
    con.enable_load_extension(True)
    sqlite_vec.load(con)
    con.enable_load_extension(False)
    chunk_row = con.execute("SELECT id FROM chunks WHERE id=?", (chunk_id,)).fetchone()
    emb_row = con.execute("SELECT chunk_id FROM embeddings WHERE chunk_id=?", (chunk_id,)).fetchone()
    con.close()
    assert chunk_row is None
    assert emb_row is None


def test_delete_removes_raw_file(store, tmp_path):
    resource = store.get_or_create("sha256offile", "Book")
    raw_file = tmp_path / "sources" / "sha256offile"
    raw_file.write_bytes(b"fake file content")

    store.delete(resource.id)

    assert not raw_file.exists()


# ── Behavior 6: search returns location ──────────────────────────────────────

def test_search_results_include_location(store):
    resource = store.get_or_create("hash-search", "Book")
    store.store_chunks_and_embeddings(
        resource.id,
        chunks=["hello world"],
        embeddings=[[0.1] * 384],
        chunker_id="c",
        embedder_id="e",
        locations=["p. 7"],
    )

    results = store.search([0.1] * 384, top_k=1)

    assert len(results) == 1
    assert results[0]["location"] == "p. 7"


def test_search_results_location_is_none_when_not_stored(store):
    resource = store.get_or_create("hash-search-null", "Book")
    store.store_chunks_and_embeddings(
        resource.id,
        chunks=["hello world"],
        embeddings=[[0.1] * 384],
        chunker_id="c",
        embedder_id="e",
    )

    results = store.search([0.1] * 384, top_k=1)

    assert len(results) == 1
    assert results[0]["location"] is None


# ── Behavior 9: current_step ──────────────────────────────────────────────────

def test_schema_resources_has_current_step_column(store, tmp_path):
    con = sqlite3.connect(tmp_path / "resources.db")
    cols = {r[1] for r in con.execute("PRAGMA table_info(resources)").fetchall()}
    con.close()
    assert "current_step" in cols


def test_schema_resources_has_batch_columns(store, tmp_path):
    con = sqlite3.connect(tmp_path / "resources.db")
    cols = {r[1] for r in con.execute("PRAGMA table_info(resources)").fetchall()}
    con.close()
    assert "batches_total" in cols
    assert "batches_fallback" in cols


def test_get_status_includes_current_step_as_null_initially(store):
    resource = store.get_or_create("hash-step-init", "Book")
    status = store.get_status(resource.id)
    assert "current_step" in status
    assert status["current_step"] is None


def test_update_step_persists_current_step(store):
    resource = store.get_or_create("hash-step-set", "Book")
    store.update_step(resource.id, "extracting")
    status = store.get_status(resource.id)
    assert status["current_step"] == "extracting"


def test_update_step_can_clear_current_step(store):
    resource = store.get_or_create("hash-step-clear", "Book")
    store.update_step(resource.id, "extracting")
    store.update_step(resource.id, None)
    status = store.get_status(resource.id)
    assert status["current_step"] is None


def test_update_status_failed_clears_current_step(store):
    resource = store.get_or_create("hash-step-failed", "Book")
    store.update_step(resource.id, "chunking")
    store.update_status(resource.id, "failed", error_message="boom")
    status = store.get_status(resource.id)
    assert status["current_step"] is None
    assert status["indexing_status"] == "failed"


def test_store_chunks_and_embeddings_clears_current_step(store):
    resource = store.get_or_create("hash-step-ready", "Book")
    store.update_step(resource.id, "embedding")
    store.store_chunks_and_embeddings(
        resource.id, ["chunk"], [[0.1] * 384], "c", "e"
    )
    status = store.get_status(resource.id)
    assert status["current_step"] is None
    assert status["indexing_status"] == "ready"


# ── Behavior 10: source_ref ───────────────────────────────────────────────────

def test_set_source_ref_persists_on_resource(store):
    resource = store.get_or_create("hash-src-ref", "Book")
    store.set_source_ref(resource.id, "thesis.pdf")
    fetched = store.get(resource.id)
    assert fetched.source_ref == "thesis.pdf"


def test_source_ref_defaults_to_none(store):
    resource = store.get_or_create("hash-no-src-ref", "Book")
    assert resource.source_ref is None


# ── Behavior 11: reset_for_reingest ──────────────────────────────────────────

def test_reset_for_reingest_sets_status_to_queued(store):
    resource = store.get_or_create("hash-reingest-status", "Book")
    store.update_status(resource.id, "ready")
    store.reset_for_reingest(resource.id)
    assert store.get_status(resource.id)["indexing_status"] == "queued"


def test_reset_for_reingest_zeroes_batch_counters(store):
    resource = store.get_or_create("hash-reingest-batches", "Book")
    store.update_batches(resource.id, batches_total=6, batches_fallback=3)
    store.reset_for_reingest(resource.id)
    status = store.get_status(resource.id)
    assert status["batches_total"] == 0
    assert status["batches_fallback"] == 0


def test_reset_for_reingest_clears_chunks_and_embeddings(store, tmp_path):
    resource = store.get_or_create("hash-reingest-chunks", "Book")
    store.store_chunks_and_embeddings(
        resource.id, ["old chunk"], [[0.1] * 384], "chunker-v1", "embedder-v1"
    )
    store.reset_for_reingest(resource.id)
    con = sqlite3.connect(tmp_path / "resources.db")
    count = con.execute(
        "SELECT COUNT(*) FROM chunks WHERE resource_id=?", (resource.id,)
    ).fetchone()[0]
    con.close()
    assert count == 0


def test_reset_for_reingest_preserves_source_ref(store):
    resource = store.get_or_create("hash-reingest-srcref", "Book")
    store.set_source_ref(resource.id, "book.pdf")
    store.reset_for_reingest(resource.id)
    assert store.get(resource.id).source_ref == "book.pdf"
