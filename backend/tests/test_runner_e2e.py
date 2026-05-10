"""E2E tests for IngestionRunner — spawn the real worker subprocess."""
import asyncio
import hashlib

import pytest

from backend.resource_store import ResourceStore
from backend.runner import IngestionRunner


async def _wait_for_status(store, resource_id, target, timeout=10.0):
    """Poll until resource reaches target status or timeout."""
    for _ in range(int(timeout / 0.1)):
        status = store.get_status(resource_id)
        if status and status["indexing_status"] == target:
            return status
        await asyncio.sleep(0.1)
    status = store.get_status(resource_id)
    raise TimeoutError(
        f"resource {resource_id} stuck at {status['indexing_status']!r}, want {target!r}"
    )


@pytest.fixture
async def runner(tmp_path):
    store = ResourceStore(base_dir=tmp_path)
    r = IngestionRunner(base_dir=tmp_path, store=store)
    await r.start()
    yield r, store
    await r.stop()


# ── E2E 1: TXT file ingest reaches ready ─────────────────────────────────────

@pytest.mark.asyncio
async def test_e2e_txt_ingest_reaches_ready(tmp_path):
    store = ResourceStore(base_dir=tmp_path)
    runner = IngestionRunner(base_dir=tmp_path, store=store)
    await runner.start()

    try:
        content = b"The quick brown fox jumps over the lazy dog. " * 20
        sha256 = hashlib.sha256(content).hexdigest()
        resource = store.get_or_create(sha256, "Book")
        (tmp_path / "sources").mkdir(exist_ok=True)
        (tmp_path / "sources" / sha256).write_bytes(content)
        store.attach("project-e2e", resource.id)

        runner.enqueue_file(resource.id, "fox.txt")

        status = await _wait_for_status(store, resource.id, "ready", timeout=30)
        assert status["chunks_done"] > 0
    finally:
        await runner.stop()


# ── E2E 2: kill-and-respawn cycle ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_e2e_kill_and_respawn(tmp_path):
    store = ResourceStore(base_dir=tmp_path)
    runner = IngestionRunner(base_dir=tmp_path, store=store)
    await runner.start()

    try:
        first_proc = runner._proc

        # Create a resource and mark it as indexing so crash recovery can see it
        resource = store.get_or_create("hash-kill-e2e", "Book")
        store.update_status(resource.id, "indexing")
        runner._inflight.add(resource.id)

        # Kill the worker
        first_proc.kill()

        # Wait for crash recovery and respawn
        for _ in range(100):
            if runner._proc is not first_proc:
                break
            await asyncio.sleep(0.05)
        else:
            raise TimeoutError("runner did not respawn after kill")

        # Inflight resource must be marked failed
        status = store.get_status(resource.id)
        assert status["indexing_status"] == "failed"
        assert status["error_message"]

        # New uploads must work after respawn
        content2 = b"Hello world after respawn. " * 10
        sha256 = hashlib.sha256(content2).hexdigest()
        resource2 = store.get_or_create(sha256, "Book")
        (tmp_path / "sources" / sha256).write_bytes(content2)
        store.attach("project-respawn", resource2.id)

        runner.enqueue_file(resource2.id, "respawn.txt")

        status2 = await _wait_for_status(store, resource2.id, "ready", timeout=30)
        assert status2["chunks_done"] > 0
    finally:
        await runner.stop()
