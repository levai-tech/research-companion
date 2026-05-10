from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Callable, Awaitable, Any

from backend.resource_store import ResourceStore


class IngestionRunner:
    """Manages a single long-lived ingestion subprocess.

    The subprocess owns all heavy imports (fastembed, pymupdf, onnxruntime,
    trafilatura). The API process never imports those modules.

    Communication is JSON-lines over stdin (commands) and stdout (log-only
    completion summaries). The DB is the source of truth for resource status.
    """

    def __init__(
        self,
        base_dir: Path,
        store: ResourceStore,
        _spawn: Callable[[], Awaitable[Any]] | None = None,
    ) -> None:
        self._base_dir = base_dir
        self._store = store
        self._spawn_fn = _spawn
        self._proc: Any = None
        self._monitor_task: asyncio.Task | None = None
        self._stdout_task: asyncio.Task | None = None
        self._inflight: set[str] = set()

    async def _spawn(self) -> Any:
        if self._spawn_fn:
            return await self._spawn_fn()
        return await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "backend.worker_main",
            str(self._base_dir),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

    async def start(self) -> None:
        self._proc = await self._spawn()
        self._monitor_task = asyncio.create_task(self._monitor())
        self._stdout_task = asyncio.create_task(self._drain_stdout())

    async def _drain_stdout(self) -> None:
        """Read and discard/log worker stdout lines."""
        try:
            while True:
                line = await self._proc.stdout.readline()
                if not line:
                    break
        except Exception:
            pass

    async def _monitor(self) -> None:
        """Watch the worker; on crash mark inflight resources failed and respawn."""
        while True:
            await self._proc.wait()
            for rid in list(self._inflight):
                try:
                    self._store.update_status(
                        rid, "failed", error_message="ingestion worker crashed"
                    )
                except Exception:
                    pass
            self._inflight.clear()
            self._proc = await self._spawn()
            if self._stdout_task:
                self._stdout_task.cancel()
            self._stdout_task = asyncio.create_task(self._drain_stdout())

    def enqueue_file(
        self,
        resource_id: str,
        filename: str,
        model: str | None = None,
        api_key: str | None = None,
    ) -> None:
        cmd = json.dumps(
            {
                "cmd": "ingest_file",
                "resource_id": resource_id,
                "filename": filename,
                "model": model,
                "api_key": api_key,
            }
        )
        self._inflight.add(resource_id)
        self._proc.stdin.write((cmd + "\n").encode())

    def enqueue_url(
        self,
        resource_id: str,
        url: str,
        model: str | None = None,
        api_key: str | None = None,
    ) -> None:
        cmd = json.dumps(
            {
                "cmd": "ingest_url",
                "resource_id": resource_id,
                "url": url,
                "model": model,
                "api_key": api_key,
            }
        )
        self._inflight.add(resource_id)
        self._proc.stdin.write((cmd + "\n").encode())

    def cancel(self, resource_id: str) -> None:
        cmd = json.dumps({"cmd": "cancel", "resource_id": resource_id})
        self._proc.stdin.write((cmd + "\n").encode())

    async def stop(self) -> None:
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
        if self._stdout_task:
            self._stdout_task.cancel()
            try:
                await self._stdout_task
            except asyncio.CancelledError:
                pass
        if self._proc and self._proc.returncode is None:
            self._proc.terminate()
            await self._proc.wait()
