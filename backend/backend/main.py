import argparse
import json
import multiprocessing
import socket
from pathlib import Path

import uvicorn
from fastapi import BackgroundTasks, FastAPI, File, Form, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import httpx
from fastapi import HTTPException
from backend import interview, approach_explorer, outline_generator
from backend.ingestion import IngestionService
from backend.projects import ProjectService
from backend.resource_store import ResourceStore
from backend.settings import Settings

_DEFAULT_BASE_DIR = Path.home() / ".research-companion"


# Top-level so multiprocessing.spawn can pickle them.
def _worker_file_pipeline(
    base_dir: str,
    resource_id: str,
    filename: str,
    semantic_model: str | None = None,
    semantic_api_key: str | None = None,
) -> None:
    from backend.resource_store import ResourceStore
    from backend.ingestion import IngestionService
    si = None
    if semantic_model and semantic_api_key:
        from backend.semantic_ingester import SemanticIngester
        si = SemanticIngester(model=semantic_model, api_key=semantic_api_key)
    IngestionService(store=ResourceStore(base_dir=Path(base_dir)), semantic_ingester=si).run_file_pipeline(
        resource_id, filename
    )


def _worker_url_pipeline(
    base_dir: str,
    resource_id: str,
    url: str,
    semantic_model: str | None = None,
    semantic_api_key: str | None = None,
) -> None:
    from backend.resource_store import ResourceStore
    from backend.ingestion import IngestionService
    si = None
    if semantic_model and semantic_api_key:
        from backend.semantic_ingester import SemanticIngester
        si = SemanticIngester(model=semantic_model, api_key=semantic_api_key)
    IngestionService(store=ResourceStore(base_dir=Path(base_dir)), semantic_ingester=si).run_url_pipeline(
        resource_id, url
    )


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


def create_app(settings_path: Path | None = None, projects_dir: Path | None = None, embedder=None) -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    settings = Settings(path=settings_path)
    base_dir = projects_dir or _DEFAULT_BASE_DIR
    project_service = ProjectService(base_dir=base_dir)
    resource_store = ResourceStore(base_dir=base_dir)
    ingestion_service = IngestionService(store=resource_store, embedder=embedder)
    _spawn_ctx = multiprocessing.get_context("spawn")

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

    @app.delete("/projects/{project_id}", status_code=204)
    async def delete_project(project_id: str):
        if not project_service.delete(project_id):
            raise HTTPException(status_code=404, detail="Project not found")
        return Response(status_code=204)

    @app.post("/projects/{project_id}/approaches/propose")
    async def post_approaches_propose(project_id: str, body: dict):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        try:
            approaches = await approach_explorer.call_llm(
                body["transcript_summary"],
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
    async def post_outline_generate(project_id: str):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        project = project_service.get(project_id)
        approach = project_service.get_approach(project_id)
        approach_dict = approach.to_dict() if approach else {}
        try:
            sections = await outline_generator.generate_outline(
                approach_dict,
                project.document_type,
                role="outline_generator",
            )
        except httpx.HTTPStatusError as e:
            raise _llm_error(e)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        outline = project_service.save_outline(project_id, sections)
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

    @app.post("/projects/{project_id}/transcript", status_code=201)
    async def post_transcript(project_id: str, body: dict):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        messages = body.get("messages", [])
        try:
            summary = await interview.generate_summary(messages)
        except httpx.HTTPStatusError as e:
            raise _llm_error(e)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        transcript = project_service.save_transcript(project_id, messages, summary)
        return transcript.to_dict()

    @app.get("/projects/{project_id}/transcript")
    async def get_transcript(project_id: str):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        transcript = project_service.get_transcript(project_id)
        if transcript is None:
            raise HTTPException(status_code=404, detail="Transcript not found")
        return transcript.to_dict()

    @app.post("/projects/{project_id}/resources/file", status_code=202)
    async def post_resource_file(
        project_id: str,
        background_tasks: BackgroundTasks,
        resource_type: str = "Book",
        citation_metadata: str = Form(default="{}"),
        file: UploadFile = File(...),
    ):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        try:
            meta = json.loads(citation_metadata) if citation_metadata else {}
        except json.JSONDecodeError:
            meta = {}
        content = await file.read()
        result = ingestion_service.accept_file(
            project_id=project_id,
            content=content,
            resource_type=resource_type,
            citation_metadata=meta or None,
        )
        if result["indexing_status"] == "queued":
            si_cfg = settings.get().get("roles", {}).get("semantic_ingester", {})
            si_model = si_cfg.get("model")
            si_key = settings.get_key("openrouter_api_key") if si_model else None
            background_tasks.add_task(
                _spawn_ctx.Process(
                    target=_worker_file_pipeline,
                    args=(str(base_dir), result["resource_id"], file.filename or "upload", si_model, si_key),
                    daemon=False,
                ).start
            )
        resource = resource_store.get(result["resource_id"])
        return resource.to_dict() if resource else result

    @app.post("/projects/{project_id}/resources/url", status_code=202)
    async def post_resource_url(
        project_id: str,
        body: dict,
        background_tasks: BackgroundTasks,
    ):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        url = body.get("url", "").strip()
        if not url:
            raise HTTPException(status_code=422, detail="url is required")
        meta = body.get("citation_metadata") or {}
        result = ingestion_service.accept_url(
            project_id=project_id,
            url=url,
            citation_metadata=meta or None,
        )
        if result["indexing_status"] == "queued":
            si_cfg = settings.get().get("roles", {}).get("semantic_ingester", {})
            si_model = si_cfg.get("model")
            si_key = settings.get_key("openrouter_api_key") if si_model else None
            background_tasks.add_task(
                _spawn_ctx.Process(
                    target=_worker_url_pipeline,
                    args=(str(base_dir), result["resource_id"], url, si_model, si_key),
                    daemon=False,
                ).start
            )
        resource = resource_store.get(result["resource_id"])
        return resource.to_dict() if resource else result

    @app.get("/projects/{project_id}/resources/{resource_id}/status")
    async def get_resource_status(project_id: str, resource_id: str):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        status = ingestion_service.get_status(resource_id)
        if status is None:
            raise HTTPException(status_code=404, detail="Resource not found")
        return status

    @app.get("/projects/{project_id}/resources/search")
    async def search_resources(project_id: str, q: str, top_k: int = 10):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        query_embedding = ingestion_service.embedder.embed([q])[0]
        results = resource_store.search(project_id, query_embedding, top_k)
        return {"results": results}

    @app.get("/projects/{project_id}/resources")
    async def list_resources(project_id: str):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        resources = resource_store.list_for_project(project_id)
        return [r.to_dict() for r in resources]

    @app.delete("/projects/{project_id}/resources/{resource_id}")
    async def delete_resource(project_id: str, resource_id: str):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        attached = resource_store.list_for_project(project_id)
        if not any(r.id == resource_id for r in attached):
            raise HTTPException(status_code=404, detail="Resource not found")
        resource_store.detach(project_id, resource_id)
        return {"ok": True}

    @app.post("/interview")
    async def post_interview(body: dict):
        messages = body.get("messages", [])
        try:
            result = await interview.call_llm(messages)
        except httpx.HTTPStatusError as e:
            raise _llm_error(e)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if isinstance(result, dict) and result.get("phase") == "ready":
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
