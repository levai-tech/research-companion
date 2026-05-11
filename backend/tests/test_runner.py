"""Unit tests for IngestionRunner — use a fake subprocess so they're fast and deterministic."""
import asyncio
import json

import pytest

from backend.resource_store import ResourceStore
from backend.runner import IngestionRunner


# ── Fake subprocess ───────────────────────────────────────────────────────────

class FakeStdin:
    def __init__(self):
        self.lines: list[str] = []

    def write(self, data: bytes) -> None:
        self.lines.append(data.decode())

    async def drain(self) -> None:
        pass


class FakeStdout:
    async def readline(self) -> bytes:
        await asyncio.sleep(9999)
        return b""


class FakeProcess:
    def __init__(self):
        self.stdin = FakeStdin()
        self.stdout = FakeStdout()
        self.returncode = None
        self._exit = asyncio.Event()

    async def wait(self) -> int:
        await self._exit.wait()
        return self.returncode or -1

    def kill(self) -> None:
        self.returncode = -9
        self._exit.set()

    def terminate(self) -> None:
        self.returncode = -15
        self._exit.set()


@pytest.fixture
def store(tmp_path):
    return ResourceStore(base_dir=tmp_path)


def _make_runner(store, proc):
    async def _spawn():
        return proc

    return IngestionRunner(base_dir=store._base_dir, store=store, _spawn=_spawn)


# ── Tracer bullet: enqueue_file sends the right JSON-line ────────────────────

@pytest.mark.asyncio
async def test_enqueue_file_writes_json_line_to_stdin(store):
    proc = FakeProcess()
    runner = _make_runner(store, proc)
    await runner.start()

    runner.enqueue_file("res-1", "report.pdf")

    await runner.stop()

    assert len(proc.stdin.lines) == 1
    msg = json.loads(proc.stdin.lines[0].strip())
    assert msg["cmd"] == "ingest_file"
    assert msg["resource_id"] == "res-1"
    assert msg["filename"] == "report.pdf"
    assert msg["model"] is None
    assert msg["api_key"] is None


# ── enqueue_url sends the right JSON-line ────────────────────────────────────

@pytest.mark.asyncio
async def test_enqueue_url_writes_json_line_to_stdin(store):
    proc = FakeProcess()
    runner = _make_runner(store, proc)
    await runner.start()

    runner.enqueue_url("res-2", "https://example.com/article")

    await runner.stop()

    assert len(proc.stdin.lines) == 1
    msg = json.loads(proc.stdin.lines[0].strip())
    assert msg["cmd"] == "ingest_url"
    assert msg["resource_id"] == "res-2"
    assert msg["url"] == "https://example.com/article"
    assert msg["model"] is None
    assert msg["api_key"] is None


# ── cancel sends the cancel JSON-line ────────────────────────────────────────

@pytest.mark.asyncio
async def test_cancel_writes_cancel_command(store):
    proc = FakeProcess()
    runner = _make_runner(store, proc)
    await runner.start()

    runner.enqueue_file("res-3", "notes.txt")
    runner.cancel("res-3")

    await runner.stop()

    cmds = [json.loads(l.strip()) for l in proc.stdin.lines]
    cancel_cmds = [c for c in cmds if c["cmd"] == "cancel"]
    assert len(cancel_cmds) == 1
    assert cancel_cmds[0]["resource_id"] == "res-3"


# ── stop() terminates the worker cleanly ─────────────────────────────────────

@pytest.mark.asyncio
async def test_stop_terminates_worker(store):
    proc = FakeProcess()
    runner = _make_runner(store, proc)
    await runner.start()

    await runner.stop()

    assert proc.returncode is not None  # process was terminated


# ── crash: inflight resources marked failed + runner respawns ────────────────

@pytest.mark.asyncio
async def test_crash_marks_inflight_failed_and_respawns(store, tmp_path):
    first_proc = FakeProcess()
    second_proc = FakeProcess()
    spawn_calls = [first_proc, second_proc]

    async def _spawn():
        return spawn_calls.pop(0)

    runner = IngestionRunner(base_dir=store._base_dir, store=store, _spawn=_spawn)
    await runner.start()

    # Create a queued resource and enqueue it (marks as inflight)
    resource = store.get_or_create("hash-crash", "Book")
    store.update_status(resource.id, "indexing")
    runner.enqueue_file(resource.id, "book.pdf")

    # Simulate worker crash
    first_proc.kill()

    # Give the monitor loop time to react
    await asyncio.sleep(0.05)

    # Inflight resource must now be failed
    status = store.get_status(resource.id)
    assert status["indexing_status"] == "failed"
    assert status["error_message"]

    # Runner should have respawned — second_proc is now active
    assert runner._proc is second_proc

    await runner.stop()


# ── enqueue_file with model/api_key passes them through ──────────────────────

@pytest.mark.asyncio
async def test_enqueue_file_passes_model_and_api_key(store):
    proc = FakeProcess()
    runner = _make_runner(store, proc)
    await runner.start()

    runner.enqueue_file("res-4", "paper.pdf", model="openai/gpt-4o", api_key="sk-test")

    await runner.stop()

    msg = json.loads(proc.stdin.lines[0].strip())
    assert msg["model"] == "openai/gpt-4o"
    assert msg["api_key"] == "sk-test"


# ── force_recursive flag is forwarded in the JSON command ────────────────────

@pytest.mark.asyncio
async def test_enqueue_file_with_force_recursive_sends_flag(store):
    proc = FakeProcess()
    runner = _make_runner(store, proc)
    await runner.start()

    runner.enqueue_file("res-5", "book.pdf", force_recursive=True)

    await runner.stop()

    msg = json.loads(proc.stdin.lines[0].strip())
    assert msg["force_recursive"] is True


@pytest.mark.asyncio
async def test_enqueue_url_with_force_recursive_sends_flag(store):
    proc = FakeProcess()
    runner = _make_runner(store, proc)
    await runner.start()

    runner.enqueue_url("res-6", "https://example.com", force_recursive=True)

    await runner.stop()

    msg = json.loads(proc.stdin.lines[0].strip())
    assert msg["force_recursive"] is True


@pytest.mark.asyncio
async def test_enqueue_file_force_recursive_defaults_false(store):
    proc = FakeProcess()
    runner = _make_runner(store, proc)
    await runner.start()

    runner.enqueue_file("res-7", "doc.txt")

    await runner.stop()

    msg = json.loads(proc.stdin.lines[0].strip())
    assert msg["force_recursive"] is False
