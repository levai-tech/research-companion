from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

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
    error_message     TEXT
)
"""

_MIGRATIONS = [
    "ALTER TABLE resources ADD COLUMN chunker_id TEXT",
    "ALTER TABLE resources ADD COLUMN embedder_id TEXT",
    "ALTER TABLE resources ADD COLUMN chunks_done INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE resources ADD COLUMN chunks_total INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE resources ADD COLUMN error_message TEXT",
]

_CREATE_CHUNKS = """
CREATE TABLE IF NOT EXISTS chunks (
    id          TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL REFERENCES resources(id),
    text        TEXT NOT NULL,
    position    INTEGER NOT NULL
)
"""

_CREATE_EMBEDDINGS = """
CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
    chunk_id  TEXT PRIMARY KEY,
    embedding FLOAT[384]
)
"""

_CREATE_PROJECT_RESOURCES = """
CREATE TABLE IF NOT EXISTS project_resources (
    project_id  TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    added_at    TEXT NOT NULL,
    PRIMARY KEY (project_id, resource_id)
)
"""


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

    def _init_db(self) -> None:
        con = self._connect()
        con.execute(_CREATE_RESOURCES)
        con.execute(_CREATE_CHUNKS)
        con.execute(_CREATE_EMBEDDINGS)
        for stmt in _MIGRATIONS:
            try:
                con.execute(stmt)
            except sqlite3.OperationalError:
                pass  # column already exists
        con.commit()
        con.close()

    def _project_con(self, project_id: str) -> sqlite3.Connection:
        db_path = self._base_dir / "projects" / project_id / "db.sqlite"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(db_path)
        con.execute(_CREATE_PROJECT_RESOURCES)
        return con

    def _row_to_resource(self, row: tuple) -> Resource:
        return Resource(
            id=row[0], content_hash=row[1], resource_type=row[2],
            indexing_status=row[3], citation_metadata=json.loads(row[4]),
            created_at=row[5], chunker_id=row[6], embedder_id=row[7],
            chunks_done=row[8] or 0, chunks_total=row[9] or 0,
            error_message=row[10],
        )

    def _select_resource(self, con: sqlite3.Connection, where: str, params: tuple) -> Resource | None:
        row = con.execute(
            "SELECT id, content_hash, resource_type, indexing_status, citation_metadata,"
            " created_at, chunker_id, embedder_id, chunks_done, chunks_total, error_message"
            f" FROM resources WHERE {where}",
            params,
        ).fetchone()
        return self._row_to_resource(row) if row else None

    def get_or_create(
        self,
        content_hash: str,
        resource_type: str,
        citation_metadata: dict | None = None,
    ) -> Resource:
        con = self._connect()
        existing = self._select_resource(con, "content_hash = ?", (content_hash,))
        if existing:
            con.close()
            return existing

        resource_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        metadata_json = json.dumps(citation_metadata or {})
        con.execute(
            "INSERT INTO resources (id, content_hash, resource_type, indexing_status, citation_metadata, created_at)"
            " VALUES (?, ?, ?, 'queued', ?, ?)",
            (resource_id, content_hash, resource_type, metadata_json, created_at),
        )
        con.commit()
        con.close()
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
        con = self._connect()
        con.execute(
            "UPDATE resources SET indexing_status=?, chunker_id=?, embedder_id=?,"
            " chunks_done=?, chunks_total=?, error_message=? WHERE id=?",
            (status, chunker_id, embedder_id, chunks_done, chunks_total, error_message, resource_id),
        )
        con.commit()
        con.close()

    def update_progress(self, resource_id: str, chunks_done: int, chunks_total: int) -> None:
        con = self._connect()
        con.execute(
            "UPDATE resources SET chunks_done=?, chunks_total=? WHERE id=?",
            (chunks_done, chunks_total, resource_id),
        )
        con.commit()
        con.close()

    def get(self, resource_id: str) -> Resource | None:
        con = self._connect()
        resource = self._select_resource(con, "id = ?", (resource_id,))
        con.close()
        return resource

    def get_status(self, resource_id: str) -> dict | None:
        con = self._connect()
        resource = self._select_resource(con, "id = ?", (resource_id,))
        con.close()
        if resource is None:
            return None
        return {
            "indexing_status": resource.indexing_status,
            "chunks_done": resource.chunks_done,
            "chunks_total": resource.chunks_total,
            "error_message": resource.error_message,
        }

    def store_chunks_and_embeddings(
        self,
        resource_id: str,
        chunks: list[str],
        embeddings: list[list[float]],
        chunker_id: str,
        embedder_id: str,
    ) -> None:
        con = self._connect()
        existing_chunk_ids = [
            r[0] for r in con.execute(
                "SELECT id FROM chunks WHERE resource_id = ?", (resource_id,)
            ).fetchall()
        ]
        for cid in existing_chunk_ids:
            con.execute("DELETE FROM embeddings WHERE chunk_id = ?", (cid,))
        con.execute("DELETE FROM chunks WHERE resource_id = ?", (resource_id,))
        for i, (text, vector) in enumerate(zip(chunks, embeddings)):
            chunk_id = str(uuid.uuid4())
            con.execute(
                "INSERT INTO chunks (id, resource_id, text, position) VALUES (?, ?, ?, ?)",
                (chunk_id, resource_id, text, i),
            )
            con.execute(
                "INSERT INTO embeddings (chunk_id, embedding) VALUES (?, ?)",
                (chunk_id, json.dumps(vector)),
            )
        con.execute(
            "UPDATE resources SET indexing_status='ready', chunker_id=?, embedder_id=?,"
            " chunks_done=?, chunks_total=? WHERE id=?",
            (chunker_id, embedder_id, len(chunks), len(chunks), resource_id),
        )
        con.commit()
        con.close()

    def attach(self, project_id: str, resource_id: str) -> None:
        added_at = datetime.now(timezone.utc).isoformat()
        con = self._project_con(project_id)
        con.execute(
            "INSERT OR IGNORE INTO project_resources (project_id, resource_id, added_at) VALUES (?, ?, ?)",
            (project_id, resource_id, added_at),
        )
        con.commit()
        con.close()

    def list_for_project(self, project_id: str) -> list[Resource]:
        proj_con = self._project_con(project_id)
        resource_ids = [
            r[0] for r in proj_con.execute(
                "SELECT resource_id FROM project_resources WHERE project_id = ?",
                (project_id,),
            ).fetchall()
        ]
        proj_con.close()
        if not resource_ids:
            return []
        con = self._connect()
        placeholders = ",".join("?" * len(resource_ids))
        rows = con.execute(
            f"SELECT id, content_hash, resource_type, indexing_status, citation_metadata, created_at"
            f" FROM resources WHERE id IN ({placeholders})",
            resource_ids,
        ).fetchall()
        con.close()
        return [
            Resource(
                id=r[0], content_hash=r[1], resource_type=r[2],
                indexing_status=r[3], citation_metadata=json.loads(r[4]),
                created_at=r[5],
            )
            for r in rows
        ]

    def search(
        self,
        project_id: str,
        query_embedding: list[float],
        top_k: int = 10,
    ) -> list[dict]:
        proj_con = self._project_con(project_id)
        resource_ids = [
            r[0] for r in proj_con.execute(
                "SELECT resource_id FROM project_resources WHERE project_id = ?",
                (project_id,),
            ).fetchall()
        ]
        proj_con.close()
        if not resource_ids:
            return []

        con = self._connect()
        placeholders = ",".join("?" * len(resource_ids))
        ready_ids = {
            r[0] for r in con.execute(
                f"SELECT id FROM resources WHERE id IN ({placeholders}) AND indexing_status = 'ready'",
                resource_ids,
            ).fetchall()
        }
        if not ready_ids:
            con.close()
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
                "SELECT text, resource_id FROM chunks WHERE id = ?", (chunk_id,)
            ).fetchone()
            if chunk_row is None or chunk_row[1] not in ready_ids:
                continue
            resource = self._select_resource(con, "id = ?", (chunk_row[1],))
            results.append({
                "chunk_text": chunk_row[0],
                "score": round(max(0.0, 1.0 - float(distance)), 4),
                "resource_type": resource.resource_type if resource else "",
                "citation_metadata": resource.citation_metadata if resource else {},
            })

        con.close()
        return results

    def detach(self, project_id: str, resource_id: str) -> None:
        proj_con = self._project_con(project_id)
        proj_con.execute(
            "DELETE FROM project_resources WHERE project_id = ? AND resource_id = ?",
            (project_id, resource_id),
        )
        proj_con.commit()
        proj_con.close()

        if not self._is_referenced(resource_id, exclude_project=project_id):
            self._delete_resource(resource_id)

    def _is_referenced(self, resource_id: str, exclude_project: str) -> bool:
        projects_dir = self._base_dir / "projects"
        if not projects_dir.exists():
            return False
        for project_dir in projects_dir.iterdir():
            if project_dir.name == exclude_project:
                continue
            db_path = project_dir / "db.sqlite"
            if not db_path.exists():
                continue
            con = sqlite3.connect(db_path)
            has_table = con.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='project_resources'"
            ).fetchone()
            if not has_table:
                con.close()
                continue
            row = con.execute(
                "SELECT 1 FROM project_resources WHERE resource_id = ? LIMIT 1",
                (resource_id,),
            ).fetchone()
            con.close()
            if row:
                return True
        return False

    def _delete_resource(self, resource_id: str) -> None:
        con = self._connect()
        chunk_ids = [
            r[0] for r in con.execute(
                "SELECT id FROM chunks WHERE resource_id = ?", (resource_id,)
            ).fetchall()
        ]
        for chunk_id in chunk_ids:
            con.execute("DELETE FROM embeddings WHERE chunk_id = ?", (chunk_id,))
        con.execute("DELETE FROM chunks WHERE resource_id = ?", (resource_id,))
        row = con.execute(
            "SELECT content_hash FROM resources WHERE id = ?", (resource_id,)
        ).fetchone()
        con.execute("DELETE FROM resources WHERE id = ?", (resource_id,))
        con.commit()
        con.close()
        if row:
            file_path = self._sources_dir / row[0]
            if file_path.exists():
                file_path.unlink()
