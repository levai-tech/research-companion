from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

AngleStatus = str  # "accepted" | "rejected" | "pending"


@dataclass
class Angle:
    id: str
    project_id: str
    title: str
    description: str
    status: AngleStatus

    def to_dict(self) -> dict:
        return asdict(self)


_CREATE_ANGLES_TABLE = """
CREATE TABLE IF NOT EXISTS angles (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    status      TEXT NOT NULL
)
"""

_INSERT_ANGLE = """
INSERT INTO angles (id, project_id, title, description, status)
VALUES (?, ?, ?, ?, ?)
"""

_SELECT_ANGLES = """
SELECT id, project_id, title, description, status FROM angles
"""


@dataclass
class Project:
    id: str
    title: str
    topic: str
    theme: str
    angle: str
    document_type: str
    layout_id: str
    last_modified: str

    def to_dict(self) -> dict:
        return asdict(self)


_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS project_meta (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    topic         TEXT NOT NULL,
    theme         TEXT NOT NULL,
    angle         TEXT NOT NULL,
    document_type TEXT NOT NULL,
    layout_id     TEXT NOT NULL,
    last_modified TEXT NOT NULL
)
"""

_INSERT = """
INSERT INTO project_meta
    (id, title, topic, theme, angle, document_type, layout_id, last_modified)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
"""

_SELECT_ONE = """
SELECT id, title, topic, theme, angle, document_type, layout_id, last_modified
FROM project_meta LIMIT 1
"""


class ProjectService:
    def __init__(self, base_dir: Path) -> None:
        self._projects_dir = base_dir / "projects"

    def create(
        self,
        title: str,
        topic: str,
        theme: str,
        angle: str,
        document_type: str,
        layout_id: str,
    ) -> Project:
        project_id = str(uuid.uuid4())
        project_dir = self._projects_dir / project_id
        project_dir.mkdir(parents=True)
        (project_dir / "sources").mkdir()

        last_modified = datetime.now(timezone.utc).isoformat()

        con = sqlite3.connect(project_dir / "db.sqlite")
        con.execute(_CREATE_TABLE)
        con.execute(_INSERT, (project_id, title, topic, theme, angle, document_type, layout_id, last_modified))
        con.commit()
        con.close()

        return Project(
            id=project_id,
            title=title,
            topic=topic,
            theme=theme,
            angle=angle,
            document_type=document_type,
            layout_id=layout_id,
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
        con.execute(_CREATE_ANGLES_TABLE)
        return con

    def save_angles(self, project_id: str, angles: list[dict]) -> list[Angle]:
        accepted = [a for a in angles if a.get("status") == "accepted"]
        con = self._db(project_id)
        saved: list[Angle] = []
        for a in accepted:
            angle_id = str(uuid.uuid4())
            con.execute(_INSERT_ANGLE, (angle_id, project_id, a["title"], a["description"], "accepted"))
            saved.append(Angle(id=angle_id, project_id=project_id, title=a["title"], description=a["description"], status="accepted"))
        con.commit()
        con.close()
        return saved

    def get_angles(self, project_id: str) -> list[Angle]:
        if not (self._projects_dir / project_id / "db.sqlite").exists():
            return []
        con = self._db(project_id)
        rows = con.execute(_SELECT_ANGLES).fetchall()
        con.close()
        return [Angle(*row) for row in rows]
