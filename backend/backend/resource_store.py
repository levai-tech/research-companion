from __future__ import annotations

import json
import shutil
import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator

import sqlite_vec


@dataclass
class Resource:
    id: str
    content_hash: str
    resource_type: str
    indexing_status: str
    citation_metadata: dict
    created_at: str
    chunker_id: str | None = None
    embedder_id: str | None = None
    chunks_done: int = 0
    chunks_total: int = 0
    error_message: str | None = None
    current_step: str | None = None
    batches_total: int = 0
    batches_fallback: int = 0
    source_ref: str | None = None
    project_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


_CREATE_RESOURCES = """
CREATE TABLE IF NOT EXISTS resources (
    id                TEXT PRIMARY KEY,
    content_hash      TEXT NOT NULL UNIQUE,
    resource_type     TEXT NOT NULL,
    indexing_status   TEXT NOT NULL DEFAULT 'queued',
    citation_metadata TEXT NOT NULL DEFAULT '{}',
    created_at        TEXT NOT NULL,
    chunker_id        TEXT,
    embedder_id       TEXT,
    chunks_done       INTEGER NOT NULL DEFAULT 0,
    chunks_total      INTEGER NOT NULL DEFAULT 0,
    error_message     TEXT,
    current_step      TEXT,
    batches_total     INTEGER NOT NULL DEFAULT 0,
    batches_fallback  INTEGER NOT NULL DEFAULT 0,
    source_ref        TEXT
)
"""

_CREATE_CHUNKS = """
CREATE TABLE IF NOT EXISTS chunks (
    id          TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL REFERENCES resources(id),
    text        TEXT NOT NULL,
    position    INTEGER NOT NULL,
    location    TEXT,
    chunker_id  TEXT
)
"""

_CREATE_EMBEDDINGS = """
CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
    chunk_id  TEXT PRIMARY KEY,
    embedding FLOAT[384]
)
"""

_CREATE_SCHEMA_VERSION = """
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
)
"""

_CREATE_RESOURCE_PROJECTS = """
CREATE TABLE IF NOT EXISTS resource_projects (
    resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    project_id  TEXT NOT NULL,
    PRIMARY KEY (resource_id, project_id)
)
"""

_SCHEMA_VERSION = 4


class ResourceStore:
    def __init__(self, base_dir: Path) -> None:
        self._base_dir = base_dir
        self._db_path = base_dir / "resources.db"
        self._sources_dir = base_dir / "sources"
        self._sources_dir.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self._db_path)
        con.enable_load_extension(True)
        sqlite_vec.load(con)
        con.enable_load_extension(False)
        return con

    @contextmanager
    def _db(self) -> Generator[sqlite3.Connection, None, None]:
        con = self._connect()
        try:
            yield con
            con.commit()
        finally:
            con.close()

    def _destructive_migrate(self, con: sqlite3.Connection) -> None:
        for table in ("chunks", "embeddings", "resources"):
            con.execute(f"DROP TABLE IF EXISTS {table}")
        if self._sources_dir.exists():
            shutil.rmtree(self._sources_dir)
            self._sources_dir.mkdir()

    def _init_db(self) -> None:
        with self._db() as con:
            con.execute(_CREATE_SCHEMA_VERSION)
            current = con.execute("SELECT MAX(version) FROM schema_version").fetchone()[0] or 0
            if current < _SCHEMA_VERSION:
                self._destructive_migrate(con)
                con.execute(
                    "INSERT OR REPLACE INTO schema_version (version) VALUES (?)",
                    (_SCHEMA_VERSION,),
                )
            con.execute(_CREATE_RESOURCES)
            con.execute(_CREATE_CHUNKS)
            con.execute(_CREATE_EMBEDDINGS)
            con.execute(_CREATE_RESOURCE_PROJECTS)

    def _row_to_resource(self, row: tuple) -> Resource:
        return Resource(
            id=row[0], content_hash=row[1], resource_type=row[2],
            indexing_status=row[3], citation_metadata=json.loads(row[4]),
            created_at=row[5], chunker_id=row[6], embedder_id=row[7],
            chunks_done=row[8] or 0, chunks_total=row[9] or 0,
            error_message=row[10], current_step=row[11],
            batches_total=row[12] or 0, batches_fallback=row[13] or 0,
            source_ref=row[14],
        )

    def _select_resource(self, con: sqlite3.Connection, where: str, params: tuple) -> Resource | None:
        row = con.execute(
            "SELECT id, content_hash, resource_type, indexing_status, citation_metadata,"
            " created_at, chunker_id, embedder_id, chunks_done, chunks_total, error_message,"
            " current_step, batches_total, batches_fallback, source_ref"
            f" FROM resources WHERE {where}",
            params,
        ).fetchone()
        if row is None:
            return None
        resource = self._row_to_resource(row)
        pid_rows = con.execute(
            "SELECT project_id FROM resource_projects WHERE resource_id = ?", (resource.id,)
        ).fetchall()
        resource.project_ids = [r[0] for r in pid_rows]
        return resource

    def _reset_failed(self, resource_id: str, con: sqlite3.Connection) -> None:
        chunk_ids = [
            r[0] for r in con.execute(
                "SELECT id FROM chunks WHERE resource_id = ?", (resource_id,)
            ).fetchall()
        ]
        if chunk_ids:
            placeholders = ",".join("?" * len(chunk_ids))
            con.execute(f"DELETE FROM embeddings WHERE chunk_id IN ({placeholders})", chunk_ids)
        con.execute("DELETE FROM chunks WHERE resource_id = ?", (resource_id,))
        con.execute(
            "UPDATE resources SET indexing_status='queued', error_message=NULL,"
            " current_step=NULL, chunks_done=0, chunks_total=0,"
            " chunker_id=NULL, embedder_id=NULL WHERE id=?",
            (resource_id,),
        )

    def get_or_create(
        self,
        content_hash: str,
        resource_type: str,
        citation_metadata: dict | None = None,
    ) -> Resource:
        with self._db() as con:
            existing = self._select_resource(con, "content_hash = ?", (content_hash,))
            if existing:
                if existing.indexing_status == "failed":
                    self._reset_failed(existing.id, con)
                    return Resource(
                        id=existing.id,
                        content_hash=existing.content_hash,
                        resource_type=existing.resource_type,
                        indexing_status="queued",
                        citation_metadata=existing.citation_metadata,
                        created_at=existing.created_at,
                    )
                return existing

            resource_id = str(uuid.uuid4())
            created_at = datetime.now(timezone.utc).isoformat()
            metadata_json = json.dumps(citation_metadata or {})
            con.execute(
                "INSERT INTO resources (id, content_hash, resource_type, indexing_status, citation_metadata, created_at)"
                " VALUES (?, ?, ?, 'queued', ?, ?)",
                (resource_id, content_hash, resource_type, metadata_json, created_at),
            )
            return Resource(
                id=resource_id, content_hash=content_hash, resource_type=resource_type,
                indexing_status="queued", citation_metadata=citation_metadata or {},
                created_at=created_at,
            )

    def update_status(
        self,
        resource_id: str,
        status: str,
        chunker_id: str | None = None,
        embedder_id: str | None = None,
        chunks_done: int = 0,
        chunks_total: int = 0,
        error_message: str | None = None,
    ) -> None:
        with self._db() as con:
            if status in ("ready", "failed"):
                con.execute(
                    "UPDATE resources SET indexing_status=?, chunker_id=?, embedder_id=?,"
                    " chunks_done=?, chunks_total=?, error_message=?, current_step=NULL WHERE id=?",
                    (status, chunker_id, embedder_id, chunks_done, chunks_total, error_message, resource_id),
                )
            else:
                con.execute(
                    "UPDATE resources SET indexing_status=?, chunker_id=?, embedder_id=?,"
                    " chunks_done=?, chunks_total=?, error_message=? WHERE id=?",
                    (status, chunker_id, embedder_id, chunks_done, chunks_total, error_message, resource_id),
                )

    def update_step(self, resource_id: str, step: str | None) -> None:
        with self._db() as con:
            con.execute(
                "UPDATE resources SET current_step=? WHERE id=?",
                (step, resource_id),
            )

    def update_progress(self, resource_id: str, chunks_done: int, chunks_total: int) -> None:
        with self._db() as con:
            con.execute(
                "UPDATE resources SET chunks_done=?, chunks_total=? WHERE id=?",
                (chunks_done, chunks_total, resource_id),
            )

    def update_batches(self, resource_id: str, batches_total: int, batches_fallback: int) -> None:
        with self._db() as con:
            con.execute(
                "UPDATE resources SET batches_total=?, batches_fallback=? WHERE id=?",
                (batches_total, batches_fallback, resource_id),
            )

    def set_source_ref(self, resource_id: str, source_ref: str) -> None:
        with self._db() as con:
            con.execute(
                "UPDATE resources SET source_ref=? WHERE id=?",
                (source_ref, resource_id),
            )

    def reset_for_reingest(self, resource_id: str) -> None:
        with self._db() as con:
            chunk_ids = [
                r[0] for r in con.execute(
                    "SELECT id FROM chunks WHERE resource_id = ?", (resource_id,)
                ).fetchall()
            ]
            if chunk_ids:
                placeholders = ",".join("?" * len(chunk_ids))
                con.execute(f"DELETE FROM embeddings WHERE chunk_id IN ({placeholders})", chunk_ids)
            con.execute("DELETE FROM chunks WHERE resource_id = ?", (resource_id,))
            con.execute(
                "UPDATE resources SET indexing_status='queued', error_message=NULL,"
                " current_step=NULL, chunks_done=0, chunks_total=0,"
                " chunker_id=NULL, embedder_id=NULL,"
                " batches_total=0, batches_fallback=0 WHERE id=?",
                (resource_id,),
            )

    def get(self, resource_id: str) -> Resource | None:
        with self._db() as con:
            return self._select_resource(con, "id = ?", (resource_id,))

    def get_status(self, resource_id: str) -> dict | None:
        with self._db() as con:
            resource = self._select_resource(con, "id = ?", (resource_id,))
        if resource is None:
            return None
        return {
            "indexing_status": resource.indexing_status,
            "chunks_done": resource.chunks_done,
            "chunks_total": resource.chunks_total,
            "error_message": resource.error_message,
            "current_step": resource.current_step,
            "batches_total": resource.batches_total,
            "batches_fallback": resource.batches_fallback,
        }

    def get_chunks(self, resource_id: str) -> list[dict]:
        with self._db() as con:
            rows = con.execute(
                "SELECT id, text, position, location, chunker_id FROM chunks"
                " WHERE resource_id = ? ORDER BY position",
                (resource_id,),
            ).fetchall()
        return [
            {"id": r[0], "text": r[1], "position": r[2], "location": r[3], "chunker_id": r[4]}
            for r in rows
        ]

    def store_chunks_and_embeddings(
        self,
        resource_id: str,
        chunks: list[str],
        embeddings: list[list[float]],
        chunker_id: str,
        embedder_id: str,
        locations: list[str | None] | None = None,
        chunker_ids: list[str] | None = None,
    ) -> None:
        locs = locations if locations is not None else [None] * len(chunks)
        cids = chunker_ids if chunker_ids is not None else [chunker_id] * len(chunks)
        with self._db() as con:
            existing_chunk_ids = [
                r[0] for r in con.execute(
                    "SELECT id FROM chunks WHERE resource_id = ?", (resource_id,)
                ).fetchall()
            ]
            if existing_chunk_ids:
                placeholders = ",".join("?" * len(existing_chunk_ids))
                con.execute(
                    f"DELETE FROM embeddings WHERE chunk_id IN ({placeholders})",
                    existing_chunk_ids,
                )
            con.execute("DELETE FROM chunks WHERE resource_id = ?", (resource_id,))
            chunk_rows = []
            embedding_rows = []
            for i, (text, vector, loc, cid) in enumerate(zip(chunks, embeddings, locs, cids)):
                chunk_uuid = str(uuid.uuid4())
                chunk_rows.append((chunk_uuid, resource_id, text, i, loc, cid))
                embedding_rows.append((chunk_uuid, json.dumps(vector)))
            con.executemany(
                "INSERT INTO chunks (id, resource_id, text, position, location, chunker_id) VALUES (?, ?, ?, ?, ?, ?)",
                chunk_rows,
            )
            con.executemany(
                "INSERT INTO embeddings (chunk_id, embedding) VALUES (?, ?)",
                embedding_rows,
            )
            con.execute(
                "UPDATE resources SET indexing_status='ready', chunker_id=?, embedder_id=?,"
                " chunks_done=?, chunks_total=?, current_step=NULL WHERE id=?",
                (chunker_id, embedder_id, len(chunks), len(chunks), resource_id),
            )

    def list_all(self) -> list[Resource]:
        with self._db() as con:
            rows = con.execute(
                "SELECT id, content_hash, resource_type, indexing_status, citation_metadata, created_at"
                " FROM resources ORDER BY created_at DESC"
            ).fetchall()
            link_rows = con.execute(
                "SELECT resource_id, project_id FROM resource_projects"
            ).fetchall()
        project_ids_by_resource: dict[str, list[str]] = {}
        for resource_id, project_id in link_rows:
            project_ids_by_resource.setdefault(resource_id, []).append(project_id)
        return [
            Resource(
                id=r[0], content_hash=r[1], resource_type=r[2],
                indexing_status=r[3], citation_metadata=json.loads(r[4]),
                created_at=r[5],
                project_ids=project_ids_by_resource.get(r[0], []),
            )
            for r in rows
        ]

    def search(
        self,
        query_embedding: list[float],
        top_k: int = 10,
    ) -> list[dict]:
        with self._db() as con:
            ready_ids = {
                r[0] for r in con.execute(
                    "SELECT id FROM resources WHERE indexing_status = 'ready'"
                ).fetchall()
            }
            if not ready_ids:
                return []

            knn_rows = con.execute(
                "SELECT chunk_id, distance FROM embeddings WHERE embedding MATCH ? AND k = ?",
                (json.dumps(query_embedding), top_k * max(len(ready_ids), 5)),
            ).fetchall()

            results = []
            for chunk_id, distance in knn_rows:
                if len(results) >= top_k:
                    break
                chunk_row = con.execute(
                    "SELECT text, resource_id, location FROM chunks WHERE id = ?", (chunk_id,)
                ).fetchone()
                if chunk_row is None or chunk_row[1] not in ready_ids:
                    continue
                resource = self._select_resource(con, "id = ?", (chunk_row[1],))
                results.append({
                    "chunk_text": chunk_row[0],
                    "score": round(max(0.0, 1.0 - float(distance)), 4),
                    "resource_type": resource.resource_type if resource else "",
                    "citation_metadata": resource.citation_metadata if resource else {},
                    "location": chunk_row[2],
                })

        return results

    def attach_to_project(self, resource_id: str, project_id: str) -> None:
        with self._db() as con:
            con.execute(
                "INSERT OR IGNORE INTO resource_projects (resource_id, project_id) VALUES (?, ?)",
                (resource_id, project_id),
            )

    def detach_from_project(self, resource_id: str, project_id: str) -> bool:
        with self._db() as con:
            cur = con.execute(
                "DELETE FROM resource_projects WHERE resource_id = ? AND project_id = ?",
                (resource_id, project_id),
            )
            return cur.rowcount > 0

    def list_for_project(self, project_id: str) -> list["Resource"]:
        with self._db() as con:
            rows = con.execute(
                "SELECT r.id, r.content_hash, r.resource_type, r.indexing_status,"
                " r.citation_metadata, r.created_at"
                " FROM resources r"
                " JOIN resource_projects rp ON rp.resource_id = r.id"
                " WHERE rp.project_id = ?"
                " ORDER BY r.created_at DESC",
                (project_id,),
            ).fetchall()
            project_ids_rows = con.execute(
                "SELECT resource_id, project_id FROM resource_projects WHERE resource_id IN"
                f" (SELECT resource_id FROM resource_projects WHERE project_id = ?)",
                (project_id,),
            ).fetchall()
        project_ids_by_resource: dict[str, list[str]] = {}
        for rid, pid in project_ids_rows:
            project_ids_by_resource.setdefault(rid, []).append(pid)
        return [
            Resource(
                id=r[0], content_hash=r[1], resource_type=r[2],
                indexing_status=r[3], citation_metadata=json.loads(r[4]),
                created_at=r[5],
                project_ids=project_ids_by_resource.get(r[0], []),
            )
            for r in rows
        ]

    def delete(self, resource_id: str) -> None:
        with self._db() as con:
            chunk_ids = [
                r[0] for r in con.execute(
                    "SELECT id FROM chunks WHERE resource_id = ?", (resource_id,)
                ).fetchall()
            ]
            if chunk_ids:
                placeholders = ",".join("?" * len(chunk_ids))
                con.execute(
                    f"DELETE FROM embeddings WHERE chunk_id IN ({placeholders})",
                    chunk_ids,
                )
            con.execute("DELETE FROM chunks WHERE resource_id = ?", (resource_id,))
            row = con.execute(
                "SELECT content_hash FROM resources WHERE id = ?", (resource_id,)
            ).fetchone()
            con.execute("DELETE FROM resources WHERE id = ?", (resource_id,))
        if row:
            file_path = self._sources_dir / row[0]
            if file_path.exists():
                file_path.unlink()
