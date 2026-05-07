from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class Approach:
    id: str
    project_id: str
    title: str
    description: str

    def to_dict(self) -> dict:
        return asdict(self)


_CREATE_APPROACHES_TABLE = """
CREATE TABLE IF NOT EXISTS approaches (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL
)
"""

_UPSERT_APPROACH = """
INSERT INTO approaches (id, project_id, title, description)
VALUES (?, ?, ?, ?)
ON CONFLICT(project_id) DO UPDATE SET
    id = excluded.id,
    title = excluded.title,
    description = excluded.description
"""

_SELECT_APPROACH = """
SELECT id, project_id, title, description FROM approaches WHERE project_id = ?
"""

_CREATE_TRANSCRIPT_TABLE = """
CREATE TABLE IF NOT EXISTS transcript (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL UNIQUE,
    messages   TEXT NOT NULL,
    summary    TEXT NOT NULL,
    created_at TEXT NOT NULL
)
"""

_UPSERT_TRANSCRIPT = """
INSERT INTO transcript (id, project_id, messages, summary, created_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(project_id) DO UPDATE SET
    messages = excluded.messages,
    summary = excluded.summary,
    created_at = excluded.created_at
"""

_SELECT_TRANSCRIPT = """
SELECT id, project_id, messages, summary, created_at FROM transcript WHERE project_id = ?
"""


@dataclass
class Transcript:
    id: str
    project_id: str
    messages: list[dict]
    summary: str
    created_at: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "messages": self.messages,
            "summary": self.summary,
            "created_at": self.created_at,
        }


@dataclass
class Project:
    id: str
    title: str
    topic: str
    document_type: str
    last_modified: str

    def to_dict(self) -> dict:
        return asdict(self)


_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS project_meta (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    topic         TEXT NOT NULL,
    document_type TEXT NOT NULL,
    last_modified TEXT NOT NULL
)
"""

_INSERT = """
INSERT INTO project_meta
    (id, title, topic, document_type, last_modified)
VALUES (?, ?, ?, ?, ?)
"""

_SELECT_ONE = """
SELECT id, title, topic, document_type, last_modified
FROM project_meta LIMIT 1
"""


@dataclass
class OutlineSection:
    id: str
    project_id: str
    parent_id: str | None
    title: str
    description: str
    position: int
    subsections: list["OutlineSection"] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["subsections"] = [s.to_dict() for s in self.subsections]
        return d


@dataclass
class Outline:
    sections: list[OutlineSection]

    def to_dict(self) -> dict:
        return {
            "sections": [s.to_dict() for s in self.sections],
        }


_CREATE_OUTLINE_SECTIONS_TABLE = """
CREATE TABLE IF NOT EXISTS outline_sections (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL,
    parent_id   TEXT,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    position    INTEGER NOT NULL
)
"""

_INSERT_OUTLINE_SECTION = """
INSERT INTO outline_sections (id, project_id, parent_id, title, description, position)
VALUES (?, ?, ?, ?, ?, ?)
"""


class ProjectService:
    def __init__(self, base_dir: Path) -> None:
        self._projects_dir = base_dir / "projects"

    def create(
        self,
        title: str,
        topic: str,
        document_type: str,
    ) -> Project:
        project_id = str(uuid.uuid4())
        project_dir = self._projects_dir / project_id
        project_dir.mkdir(parents=True)
        (project_dir / "sources").mkdir()

        last_modified = datetime.now(timezone.utc).isoformat()

        con = sqlite3.connect(project_dir / "db.sqlite")
        con.execute(_CREATE_TABLE)
        con.execute(_INSERT, (project_id, title, topic, document_type, last_modified))
        con.commit()
        con.close()

        return Project(
            id=project_id,
            title=title,
            topic=topic,
            document_type=document_type,
            last_modified=last_modified,
        )

    def list(self) -> list[Project]:
        if not self._projects_dir.exists():
            return []
        projects = []
        for project_dir in sorted(self._projects_dir.iterdir()):
            db_path = project_dir / "db.sqlite"
            if not db_path.exists():
                continue
            con = sqlite3.connect(db_path)
            row = con.execute(_SELECT_ONE).fetchone()
            con.close()
            if row:
                projects.append(Project(*row))
        return projects

    def get(self, project_id: str) -> Project | None:
        db_path = self._projects_dir / project_id / "db.sqlite"
        if not db_path.exists():
            return None
        con = sqlite3.connect(db_path)
        row = con.execute(_SELECT_ONE).fetchone()
        con.close()
        return Project(*row) if row else None

    def _db(self, project_id: str) -> sqlite3.Connection:
        db_path = self._projects_dir / project_id / "db.sqlite"
        con = sqlite3.connect(db_path)
        con.execute(_CREATE_APPROACHES_TABLE)
        con.execute(_CREATE_TRANSCRIPT_TABLE)
        return con

    def save_approach(self, project_id: str, approach: dict) -> Approach:
        approach_id = str(uuid.uuid4())
        con = self._db(project_id)
        con.execute(_UPSERT_APPROACH, (approach_id, project_id, approach["title"], approach["description"]))
        con.commit()
        con.close()
        return Approach(id=approach_id, project_id=project_id, title=approach["title"], description=approach["description"])

    def save_transcript(self, project_id: str, messages: list[dict], summary: str) -> Transcript:
        transcript_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        con = self._db(project_id)
        con.execute(_UPSERT_TRANSCRIPT, (transcript_id, project_id, json.dumps(messages), summary, created_at))
        con.commit()
        con.close()
        return Transcript(id=transcript_id, project_id=project_id, messages=messages, summary=summary, created_at=created_at)

    def get_transcript(self, project_id: str) -> Transcript | None:
        if not (self._projects_dir / project_id / "db.sqlite").exists():
            return None
        con = self._db(project_id)
        row = con.execute(_SELECT_TRANSCRIPT, (project_id,)).fetchone()
        con.close()
        if row is None:
            return None
        return Transcript(id=row[0], project_id=row[1], messages=json.loads(row[2]), summary=row[3], created_at=row[4])

    def get_approach(self, project_id: str) -> Approach | None:
        if not (self._projects_dir / project_id / "db.sqlite").exists():
            return None
        con = self._db(project_id)
        row = con.execute(_SELECT_APPROACH, (project_id,)).fetchone()
        con.close()
        return Approach(*row) if row else None

    def save_outline(
        self,
        project_id: str,
        sections: list[dict],
    ) -> "Outline":
        con = self._db(project_id)
        con.execute(_CREATE_OUTLINE_SECTIONS_TABLE)
        con.execute("DELETE FROM outline_sections WHERE project_id = ?", (project_id,))

        saved_sections: list[OutlineSection] = []
        for pos, section in enumerate(sections):
            section_id = str(uuid.uuid4())
            con.execute(
                _INSERT_OUTLINE_SECTION,
                (section_id, project_id, None, section["title"], section.get("description", ""), pos),
            )
            saved_sections.append(OutlineSection(
                id=section_id,
                project_id=project_id,
                parent_id=None,
                title=section["title"],
                description=section.get("description", ""),
                position=pos,
                subsections=[],
            ))
            for sub_pos, sub in enumerate(section.get("subsections", [])):
                sub_id = str(uuid.uuid4())
                con.execute(
                    _INSERT_OUTLINE_SECTION,
                    (sub_id, project_id, section_id, sub["title"], sub.get("description", ""), sub_pos),
                )
                saved_sections[-1].subsections.append(OutlineSection(
                    id=sub_id,
                    project_id=project_id,
                    parent_id=section_id,
                    title=sub["title"],
                    description=sub.get("description", ""),
                    position=sub_pos,
                    subsections=[],
                ))

        con.commit()
        con.close()
        return Outline(sections=saved_sections)

    def get_outline(self, project_id: str) -> "Outline":
        if not (self._projects_dir / project_id / "db.sqlite").exists():
            return Outline(sections=[])
        con = self._db(project_id)
        con.execute(_CREATE_OUTLINE_SECTIONS_TABLE)

        section_rows = con.execute(
            "SELECT id, project_id, parent_id, title, description, position FROM outline_sections WHERE project_id = ? ORDER BY parent_id IS NOT NULL, position",
            (project_id,),
        ).fetchall()
        con.close()

        top_level: list[OutlineSection] = []
        by_id: dict[str, OutlineSection] = {}
        for r in section_rows:
            sec = OutlineSection(id=r[0], project_id=r[1], parent_id=r[2], title=r[3], description=r[4], position=r[5], subsections=[])
            by_id[sec.id] = sec
            if sec.parent_id is None:
                top_level.append(sec)
            else:
                parent = by_id.get(sec.parent_id)
                if parent:
                    parent.subsections.append(sec)

        return Outline(sections=top_level)

    def get_document(self, project_id: str) -> dict:
        project = self.get(project_id)
        con = self._db(project_id)
        con.execute(_CREATE_DOCUMENTS_TABLE)
        row = con.execute(_SELECT_DOCUMENT, (project_id,)).fetchone()
        con.close()
        if row is None:
            return _default_doc(project.title if project else "")
        return json.loads(row[0])

    def save_document(self, project_id: str, content: dict) -> None:
        con = self._db(project_id)
        con.execute(_CREATE_DOCUMENTS_TABLE)
        con.execute(
            _UPSERT_DOCUMENT,
            (str(uuid.uuid4()), project_id, json.dumps(content), datetime.now(timezone.utc).isoformat()),
        )
        con.commit()
        con.close()


_CREATE_DOCUMENTS_TABLE = """
CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL UNIQUE,
    content     TEXT NOT NULL,
    updated_at  TEXT NOT NULL
)
"""

_UPSERT_DOCUMENT = """
INSERT INTO documents (id, project_id, content, updated_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(project_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
"""

_SELECT_DOCUMENT = "SELECT content FROM documents WHERE project_id = ?"


def _default_doc(title: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": title}]},
            {"type": "paragraph"},
        ],
    }
