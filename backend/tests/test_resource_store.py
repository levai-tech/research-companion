import json
import sqlite3

import pytest
import sqlite_vec

from backend.resource_store import ResourceStore


@pytest.fixture
def store(tmp_path):
    return ResourceStore(base_dir=tmp_path)


def _project_db(tmp_path, project_id):
    project_dir = tmp_path / "projects" / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    return project_dir / "db.sqlite"


# ── Behavior 1: schema ────────────────────────────────────────────────────────

def test_schema_creates_resources_db_and_sources_dir(store, tmp_path):
    assert (tmp_path / "resources.db").is_file()
    assert (tmp_path / "sources").is_dir()


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


# ── Behavior 4: attach ────────────────────────────────────────────────────────

def test_attach_writes_project_resources_row_in_per_project_db(store, tmp_path):
    resource = store.get_or_create("abc123", "Book")
    project_db = _project_db(tmp_path, "proj-1")

    store.attach("proj-1", resource.id)

    con = sqlite3.connect(project_db)
    row = con.execute(
        "SELECT project_id, resource_id FROM project_resources WHERE project_id='proj-1'"
    ).fetchone()
    con.close()
    assert row == ("proj-1", resource.id)


def test_attach_is_idempotent(store, tmp_path):
    resource = store.get_or_create("abc123", "Book")
    store.attach("proj-1", resource.id)
    store.attach("proj-1", resource.id)  # should not raise

    con = sqlite3.connect(_project_db(tmp_path, "proj-1"))
    count = con.execute(
        "SELECT COUNT(*) FROM project_resources WHERE project_id='proj-1'"
    ).fetchone()[0]
    con.close()
    assert count == 1


# ── Behavior 5: list_for_project ──────────────────────────────────────────────

def test_list_for_project_returns_empty_when_nothing_attached(store):
    assert store.list_for_project("proj-1") == []


def test_list_for_project_returns_attached_resources(store):
    r1 = store.get_or_create("hash-a", "Book")
    r2 = store.get_or_create("hash-b", "Press/Journal Article")
    store.attach("proj-1", r1.id)
    store.attach("proj-1", r2.id)

    resources = store.list_for_project("proj-1")
    ids = {r.id for r in resources}
    assert ids == {r1.id, r2.id}


def test_list_for_project_does_not_return_resources_from_other_projects(store):
    r1 = store.get_or_create("hash-a", "Book")
    r2 = store.get_or_create("hash-b", "Book")
    store.attach("proj-1", r1.id)
    store.attach("proj-2", r2.id)

    resources = store.list_for_project("proj-1")
    assert len(resources) == 1
    assert resources[0].id == r1.id


# ── Behavior 6: detach non-last reference ─────────────────────────────────────

def test_detach_removes_join_row(store):
    resource = store.get_or_create("hash-a", "Book")
    store.attach("proj-1", resource.id)
    store.detach("proj-1", resource.id)

    assert store.list_for_project("proj-1") == []


def test_detach_non_last_reference_preserves_resource(store, tmp_path):
    resource = store.get_or_create("hash-a", "Book")
    store.attach("proj-1", resource.id)
    store.attach("proj-2", resource.id)

    store.detach("proj-1", resource.id)

    con = sqlite3.connect(tmp_path / "resources.db")
    row = con.execute("SELECT id FROM resources WHERE id=?", (resource.id,)).fetchone()
    con.close()
    assert row is not None, "Resource should survive while proj-2 still references it"


# ── Behavior 7: detach last reference ────────────────────────────────────────

def test_detach_last_reference_deletes_resource_row(store, tmp_path):
    resource = store.get_or_create("hash-a", "Book")
    store.attach("proj-1", resource.id)
    store.detach("proj-1", resource.id)

    con = sqlite3.connect(tmp_path / "resources.db")
    row = con.execute("SELECT id FROM resources WHERE id=?", (resource.id,)).fetchone()
    con.close()
    assert row is None


def test_detach_last_reference_deletes_chunks_and_embeddings(store, tmp_path):
    resource = store.get_or_create("hash-a", "Book")
    # Seed a chunk + embedding directly so we can verify cascade deletion
    con = sqlite3.connect(tmp_path / "resources.db")
    con.enable_load_extension(True)
    sqlite_vec.load(con)
    con.enable_load_extension(False)
    chunk_id = "chunk-001"
    con.execute(
        "INSERT INTO chunks (id, resource_id, text, position) VALUES (?, ?, ?, ?)",
        (chunk_id, resource.id, "some text", 0),
    )
    embedding = [0.1] * 384
    con.execute(
        "INSERT INTO embeddings (chunk_id, embedding) VALUES (?, ?)",
        (chunk_id, json.dumps(embedding)),
    )
    con.commit()
    con.close()

    store.attach("proj-1", resource.id)
    store.detach("proj-1", resource.id)

    con = sqlite3.connect(tmp_path / "resources.db")
    con.enable_load_extension(True)
    sqlite_vec.load(con)
    con.enable_load_extension(False)
    chunk_row = con.execute("SELECT id FROM chunks WHERE id=?", (chunk_id,)).fetchone()
    embedding_row = con.execute("SELECT chunk_id FROM embeddings WHERE chunk_id=?", (chunk_id,)).fetchone()
    con.close()
    assert chunk_row is None
    assert embedding_row is None


def test_detach_last_reference_deletes_raw_file(store, tmp_path):
    resource = store.get_or_create("sha256offile", "Book")
    raw_file = tmp_path / "sources" / "sha256offile"
    raw_file.write_bytes(b"fake file content")

    store.attach("proj-1", resource.id)
    store.detach("proj-1", resource.id)

    assert not raw_file.exists()


# ── Behavior 8: search returns location ───────────────────────────────────────

def test_search_results_include_location(store):
    resource = store.get_or_create("hash-search", "Book")
    store.update_status(resource.id, "ready")
    store.store_chunks_and_embeddings(
        resource.id,
        chunks=["hello world"],
        embeddings=[[0.1] * 384],
        chunker_id="c",
        embedder_id="e",
        locations=["p. 7"],
    )
    store.attach("proj-search", resource.id)

    results = store.search("proj-search", [0.1] * 384, top_k=1)

    assert len(results) == 1
    assert results[0]["location"] == "p. 7"


def test_search_results_location_is_none_when_not_stored(store):
    resource = store.get_or_create("hash-search-null", "Book")
    store.update_status(resource.id, "ready")
    store.store_chunks_and_embeddings(
        resource.id,
        chunks=["hello world"],
        embeddings=[[0.1] * 384],
        chunker_id="c",
        embedder_id="e",
    )
    store.attach("proj-search-null", resource.id)

    results = store.search("proj-search-null", [0.1] * 384, top_k=1)

    assert len(results) == 1
    assert results[0]["location"] is None


# ── Behavior 9: current_step ──────────────────────────────────────────────────

def test_schema_resources_has_current_step_column(store, tmp_path):
    con = sqlite3.connect(tmp_path / "resources.db")
    cols = {r[1] for r in con.execute("PRAGMA table_info(resources)").fetchall()}
    con.close()
    assert "current_step" in cols


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
