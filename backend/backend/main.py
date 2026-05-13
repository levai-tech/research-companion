import argparse
import hashlib
import json
import socket
from contextlib import asynccontextmanager
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
from backend.runner import IngestionRunner
from backend.settings import Settings

_DEFAULT_BASE_DIR = Path.home() / ".research-companion"
MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB


def _apply_title_collision_suffixes(stems: list[str], contents: list[bytes]) -> list[str]:
    seen: dict[str, int] = {}
    titles = []
    for stem, content in zip(stems, contents):
        if stem in seen:
            suffix = hashlib.sha256(content).hexdigest()[:6]
            titles.append(f"{stem} ({suffix})")
        else:
            seen[stem] = 1
            titles.append(stem)
    return titles


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
    settings = Settings(path=settings_path)
    base_dir = projects_dir or _DEFAULT_BASE_DIR
    project_service = ProjectService(base_dir=base_dir)
    resource_store = ResourceStore(base_dir=base_dir)
    ingestion_service = IngestionService(store=resource_store, embedder=embedder)
    runner = IngestionRunner(base_dir=base_dir, store=resource_store)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await runner.start()
        yield
        await runner.stop()

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

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

    @app.patch("/projects/{project_id}")
    async def patch_project(project_id: str, body: dict):
        project = project_service.update_title(project_id, body["title"])
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
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

    @app.get("/resources")
    async def list_resources():
        return [r.to_dict() for r in resource_store.list_all()]

    @app.post("/resources/file", status_code=202)
    async def post_resource_file(
        resource_type: str = "Book",
        files: list[UploadFile] = File(...),
        project_id: str = Form(default=""),
        titles: str = Form(default="[]"),
    ):
        contents = []
        for f in files:
            content = await f.read()
            if len(content) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="File exceeds 200 MB limit")
            contents.append(content)

        filenames = [f.filename or "upload" for f in files]
        try:
            provided_titles: list[str] = json.loads(titles)
        except (json.JSONDecodeError, TypeError):
            provided_titles = []
        if len(provided_titles) == len(files):
            resolved_titles = provided_titles
        else:
            stems = [Path(name).stem for name in filenames]
            resolved_titles = _apply_title_collision_suffixes(stems, contents)

        si_cfg = settings.get().get("roles", {}).get("semantic_ingester", {})
        si_model = si_cfg.get("model")
        si_key = settings.get_key("openrouter_api_key") if si_model else None

        results = []
        for content, filename, title in zip(contents, filenames, resolved_titles):
            file_meta = {"title": title}
            result = ingestion_service.accept_file(
                content=content,
                resource_type=resource_type,
                citation_metadata=file_meta or None,
            )
            if result["indexing_status"] == "queued":
                resource_store.set_source_ref(result["resource_id"], filename)
                runner.enqueue_file(result["resource_id"], filename, si_model, si_key)
            if project_id:
                try:
                    resource_store.attach_to_project(result["resource_id"], project_id)
                except Exception:
                    pass
            resource = resource_store.get(result["resource_id"])
            results.append(resource.to_dict() if resource else result)
        return results

    @app.post("/resources/url", status_code=202)
    async def post_resource_url(body: dict):
        url = body.get("url", "").strip()
        if not url:
            raise HTTPException(status_code=422, detail="url is required")
        meta = body.get("citation_metadata") or {}
        result = ingestion_service.accept_url(
            url=url,
            citation_metadata=meta or None,
        )
        if result["indexing_status"] == "queued":
            si_cfg = settings.get().get("roles", {}).get("semantic_ingester", {})
            si_model = si_cfg.get("model")
            si_key = settings.get_key("openrouter_api_key") if si_model else None
            resource_store.set_source_ref(result["resource_id"], url)
            runner.enqueue_url(result["resource_id"], url, si_model, si_key)
        resource = resource_store.get(result["resource_id"])
        return resource.to_dict() if resource else result

    @app.get("/resources/{resource_id}/status")
    async def get_resource_status(resource_id: str):
        status = ingestion_service.get_status(resource_id)
        if status is None:
            raise HTTPException(status_code=404, detail="Resource not found")
        return status

    @app.post("/resources/{resource_id}/reingest", status_code=202)
    async def reingest_resource(resource_id: str):
        resource = resource_store.get(resource_id)
        if resource is None:
            raise HTTPException(status_code=404, detail="Resource not found")
        resource_store.reset_for_reingest(resource_id)
        si_cfg = settings.get().get("roles", {}).get("semantic_ingester", {})
        si_model = si_cfg.get("model")
        si_key = settings.get_key("openrouter_api_key") if si_model else None
        source = resource.source_ref or ""
        if resource.resource_type == "Webpage":
            runner.enqueue_url(resource_id, source, si_model, si_key, force_recursive=True)
        else:
            runner.enqueue_file(resource_id, source or "upload", si_model, si_key, force_recursive=True)
        return {"ok": True}

    @app.get("/resources/search")
    async def search_resources(q: str, top_k: int = 10):
        query_embedding = ingestion_service.embedder.embed([q])[0]
        results = resource_store.search(query_embedding, top_k)
        return {"results": results}

    @app.post("/resources/{resource_id}/projects/{project_id}")
    async def attach_resource_to_project(resource_id: str, project_id: str):
        if resource_store.get(resource_id) is None:
            raise HTTPException(status_code=404, detail="Resource not found")
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        resource_store.attach_to_project(resource_id, project_id)
        return {"ok": True}

    @app.delete("/resources/{resource_id}/projects/{project_id}", status_code=204)
    async def detach_resource_from_project(resource_id: str, project_id: str):
        if resource_store.get(resource_id) is None:
            raise HTTPException(status_code=404, detail="Resource not found")
        if not resource_store.detach_from_project(resource_id, project_id):
            raise HTTPException(status_code=404, detail="Resource not attached to project")
        return Response(status_code=204)

    @app.get("/projects/{project_id}/resources")
    async def get_project_resources(project_id: str):
        if project_service.get(project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        resources = resource_store.list_for_project(project_id)
        return {"count": len(resources), "resources": [r.to_dict() for r in resources]}

    @app.delete("/resources/{resource_id}")
    async def delete_resource(resource_id: str):
        if resource_store.get(resource_id) is None:
            raise HTTPException(status_code=404, detail="Resource not found")
        resource_store.delete(resource_id)
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

    @app.post("/interview/suggest-title")
    async def post_interview_suggest_title(body: dict):
        messages = body.get("messages", [])
        try:
            title = await interview.suggest_title(messages)
        except httpx.HTTPStatusError as e:
            raise _llm_error(e)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"title": title}

    return app


def run(port: int) -> None:
    uvicorn.run(create_app(), host="127.0.0.1", port=port)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=find_free_port())
    args = parser.parse_args()
    run(args.port)
