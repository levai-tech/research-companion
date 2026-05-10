"""Ingestion subprocess entry point.

Reads JSON-line commands from stdin, runs extraction/chunking/embedding,
writes progress directly to resources.db via ResourceStore.

Heavy imports (fastembed, pymupdf, onnxruntime, trafilatura) live here so the
API process never loads them — a crash here kills only this subprocess.

Stdout lines are for logging only; the DB is the source of truth for status.
"""
from __future__ import annotations

import asyncio
import json
import sys
import threading
from pathlib import Path


async def _main(base_dir: str) -> None:
    from backend.resource_store import ResourceStore
    from backend.ingestion import IngestionService

    store = ResourceStore(base_dir=Path(base_dir))
    service = IngestionService(store=store)

    cancel_flags: dict[str, threading.Event] = {}

    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    loop = asyncio.get_event_loop()
    await loop.connect_read_pipe(lambda: protocol, sys.stdin.buffer)

    async def _run_file(resource_id: str, filename: str, model: str | None, api_key: str | None) -> None:
        cancel_event = threading.Event()
        cancel_flags[resource_id] = cancel_event
        try:
            if model and api_key:
                from backend.semantic_ingester import SemanticIngester
                si = SemanticIngester(model=model, api_key=api_key)
                svc = IngestionService(store=store, semantic_ingester=si)
            else:
                svc = service
            await asyncio.to_thread(svc.run_file_pipeline, resource_id, filename, cancel_event)
        finally:
            cancel_flags.pop(resource_id, None)
        print(json.dumps({"event": "done", "resource_id": resource_id}), flush=True)

    async def _run_url(resource_id: str, url: str, model: str | None, api_key: str | None) -> None:
        cancel_event = threading.Event()
        cancel_flags[resource_id] = cancel_event
        try:
            if model and api_key:
                from backend.semantic_ingester import SemanticIngester
                si = SemanticIngester(model=model, api_key=api_key)
                svc = IngestionService(store=store, semantic_ingester=si)
            else:
                svc = service
            await asyncio.to_thread(svc.run_url_pipeline, resource_id, url, cancel_event)
        finally:
            cancel_flags.pop(resource_id, None)
        print(json.dumps({"event": "done", "resource_id": resource_id}), flush=True)

    while True:
        line = await reader.readline()
        if not line:
            break
        try:
            msg = json.loads(line.decode().strip())
        except (json.JSONDecodeError, ValueError):
            continue

        cmd = msg.get("cmd")
        if cmd == "ingest_file":
            asyncio.create_task(
                _run_file(msg["resource_id"], msg["filename"], msg.get("model"), msg.get("api_key"))
            )
        elif cmd == "ingest_url":
            asyncio.create_task(
                _run_url(msg["resource_id"], msg["url"], msg.get("model"), msg.get("api_key"))
            )
        elif cmd == "cancel":
            rid = msg.get("resource_id")
            flag = cancel_flags.get(rid)
            if flag:
                flag.set()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python -m backend.worker_main <base_dir>", file=sys.stderr)
        sys.exit(1)
    asyncio.run(_main(sys.argv[1]))
