import argparse
import socket
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

import httpx
from fastapi import HTTPException
from backend import setup_chat
from backend.projects import ProjectService
from backend.settings import Settings

_DEFAULT_BASE_DIR = Path.home() / ".research-companion"


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def create_app(settings_path: Path | None = None, projects_dir: Path | None = None) -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    settings = Settings(path=settings_path)
    project_service = ProjectService(base_dir=projects_dir or _DEFAULT_BASE_DIR)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/settings")
    async def get_settings():
        return settings.get()

    @app.put("/settings")
    async def put_settings(patch: dict):
        settings.update(patch)
        return settings.get()

    @app.get("/settings/keys")
    async def get_keys():
        return settings.keys_mask()

    @app.put("/settings/keys")
    async def put_keys(body: dict):
        for name, value in body.items():
            if isinstance(value, str):
                settings.save_key(name, value)
        return {"ok": True}

    @app.get("/projects")
    async def get_projects():
        return [p.to_dict() for p in project_service.list()]

    @app.post("/projects", status_code=201)
    async def post_projects(body: dict):
        project = project_service.create(
            title=body["title"],
            topic=body["topic"],
            theme=body["theme"],
            angle=body["angle"],
            document_type=body["document_type"],
            layout_id=body["layout_id"],
        )
        return project.to_dict()

    @app.post("/setup/chat")
    async def post_setup_chat(body: dict):
        messages = body.get("messages", [])
        try:
            result = await setup_chat.call_llm(messages)
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=str(e))
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if isinstance(result, dict) and result.get("phase") == "suggest":
            return result
        return {"phase": "chat", "message": result}

    return app


def run(port: int) -> None:
    uvicorn.run(create_app(), host="127.0.0.1", port=port)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=find_free_port())
    args = parser.parse_args()
    run(args.port)
