import argparse
import socket
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

import httpx
from fastapi import HTTPException
from backend import interview, angle_explorer, outline_generator
from backend.projects import ProjectService
from backend.settings import Settings

_DEFAULT_BASE_DIR = Path.home() / ".research-companion"


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _llm_error(e: httpx.HTTPStatusError) -> HTTPException:
    try:
        body = e.response.json()
        openrouter_msg = (body.get("error") or {}).get("message") or str(body)
    except Exception:
        openrouter_msg = e.response.text or str(e)
    return HTTPException(status_code=e.response.status_code, detail=openrouter_msg)


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
            document_type=body["document_type"],
        )
        return project.to_dict()

    @app.post("/projects/{project_id}/approaches/propose")
    async def post_approaches_propose(project_id: str, body: dict):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        try:
            approaches = await angle_explorer.call_llm(
                body["topic"],
                body["document_type"],
                role="approach_explorer",
            )
        except httpx.HTTPStatusError as e:
            raise _llm_error(e)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return approaches

    @app.patch("/projects/{project_id}/approach")
    async def patch_approach(project_id: str, body: dict):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        saved = project_service.save_approach(project_id, body["approach"])
        return saved.to_dict()

    @app.get("/projects/{project_id}/approach")
    async def get_approach(project_id: str):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        approach = project_service.get_approach(project_id)
        return approach.to_dict() if approach else None

    @app.post("/projects/{project_id}/outline/generate")
    async def post_outline_generate(project_id: str, body: dict):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        project = project_service.get(project_id)
        approach = project_service.get_approach(project_id)
        approach_dict = approach.to_dict() if approach else {}
        structure = body["structure"]
        try:
            sections = await outline_generator.generate_outline(
                approach_dict,
                project.document_type,
                structure,
                role="outline_generator",
            )
        except httpx.HTTPStatusError as e:
            raise _llm_error(e)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        outline = project_service.save_outline(project_id, structure, sections)
        return outline.to_dict()

    @app.get("/projects/{project_id}/outline")
    async def get_outline(project_id: str):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return project_service.get_outline(project_id).to_dict()

    @app.get("/projects/{project_id}/document")
    async def get_document(project_id: str):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return project_service.get_document(project_id)

    @app.put("/projects/{project_id}/document", status_code=204)
    async def put_document(project_id: str, body: dict):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        project_service.save_document(project_id, body)
        return Response(status_code=204)

    @app.post("/interview")
    async def post_interview(body: dict):
        messages = body.get("messages", [])
        try:
            result = await interview.call_llm(messages)
        except httpx.HTTPStatusError as e:
            raise _llm_error(e)
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
