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

    def to_dict(self) -> dict:
        return asdict(self)


_CREATE_RESOURCES = """
CREATE TABLE IF NOT EXISTS resources (
    id                TEXT PRIMARY KEY,
    content_hash      TEXT NOT NULL UNIQUE,
    resource_type     TEXT NOT NULL,
    indexing_status   TEXT NOT NULL DEFAULT 'queued',
    citation_metadata TEXT NOT NULL DEFAULT '{}',
    created_at        TEXT NOT NULL
)
"""

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
        con.commit()
        con.close()

    def _project_con(self, project_id: str) -> sqlite3.Connection:
        db_path = self._base_dir / "projects" / project_id / "db.sqlite"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(db_path)
        con.execute(_CREATE_PROJECT_RESOURCES)
        return con

    def get_or_create(
        self,
        content_hash: str,
        resource_type: str,
        citation_metadata: dict | None = None,
    ) -> Resource:
        con = self._connect()
        row = con.execute(
            "SELECT id, content_hash, resource_type, indexing_status, citation_metadata, created_at"
            " FROM resources WHERE content_hash = ?",
            (content_hash,),
        ).fetchone()
        if row:
            con.close()
            return Resource(
                id=row[0], content_hash=row[1], resource_type=row[2],
                indexing_status=row[3], citation_metadata=json.loads(row[4]),
                created_at=row[5],
            )

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
