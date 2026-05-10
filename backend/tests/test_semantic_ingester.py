import pytest
import httpx
from unittest.mock import patch, MagicMock

from backend.semantic_ingester import SemanticIngester, ChunkResult


# ── Helpers ──────────────────────────────────────────────────────────────────

class FakeEmbedder:
    id = "fake-embedder-v0"
    DIM = 384

    def embed(self, texts):
        return [[0.1] * self.DIM for _ in texts]


# ── Slice 4: ingest() happy path ──────────────────────────────────────────────

@pytest.fixture
def store(tmp_path):
    from backend.resource_store import ResourceStore
    return ResourceStore(base_dir=tmp_path)


def _fake_openrouter_response(chunk_text: str, location: str = "p. 1"):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": f"===CHUNK===\nLOCATION: {location}\n{chunk_text}"}}]
    }
    mock_resp.raise_for_status = MagicMock()
    return mock_resp


# ── Slice 5: ingest() fast-fail when no API key ───────────────────────────────

def test_ingest_fails_fast_when_no_api_key(store):
    resource = store.get_or_create("hash-b", "Book")
    ingester = SemanticIngester(model="test-model", api_key="")

    with patch("backend.semantic_ingester.httpx.post") as mock_post:
        ingester.ingest(resource.id, [(1, "text")], store, FakeEmbedder())
        mock_post.assert_not_called()

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "failed"
    assert "OpenRouter API key" in status["error_message"]


# ── Slice 6: ingest() sets failed on OpenRouter error ────────────────────────

def test_ingest_sets_failed_on_openrouter_error(store):
    resource = store.get_or_create("hash-c", "Book")
    ingester = SemanticIngester(model="test-model", api_key="sk-test")

    error_resp = MagicMock()
    error_resp.status_code = 401
    http_error = httpx.HTTPStatusError("Unauthorized", request=MagicMock(), response=error_resp)
    error_resp.raise_for_status.side_effect = http_error

    with patch("backend.semantic_ingester.httpx.post", return_value=error_resp):
        ingester.ingest(resource.id, [(1, "text")], store, FakeEmbedder())

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "failed"
    assert "401" in status["error_message"]


# ── Slice 7: ingest() gives readable error when response has no 'choices' ────

def test_ingest_gives_readable_error_on_missing_choices(store):
    resource = store.get_or_create("hash-d", "Book")
    ingester = SemanticIngester(model="test-model", api_key="sk-test")

    bad_resp = MagicMock()
    bad_resp.status_code = 200
    bad_resp.raise_for_status = MagicMock()
    bad_resp.json.return_value = {"error": {"message": "model not found"}}
    bad_resp.text = '{"error": {"message": "model not found"}}'

    with patch("backend.semantic_ingester.httpx.post", return_value=bad_resp):
        ingester.ingest(resource.id, [(1, "text")], store, FakeEmbedder())

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "failed"
    assert "choices" in status["error_message"]
    assert "model not found" in status["error_message"]


# ── Slice 8: ingest() waits on 429 and retries ───────────────────────────────

def test_ingest_retries_after_rate_limit(store):
    resource = store.get_or_create("hash-e", "Book")
    ingester = SemanticIngester(model="test-model", api_key="sk-test")

    rate_limit_resp = MagicMock()
    rate_limit_resp.status_code = 429
    rate_limit_resp.headers = {"Retry-After": "1"}

    success_resp = _fake_openrouter_response("Hello world.", "p. 1")

    call_count = 0

    def mock_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return rate_limit_resp if call_count == 1 else success_resp

    with patch("backend.semantic_ingester.httpx.post", side_effect=mock_post):
        with patch("backend.semantic_ingester.time.sleep"):
            ingester.ingest(resource.id, [(1, "text")], store, FakeEmbedder())

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "ready"
    assert call_count == 2


def test_ingest_sets_rate_limited_step_while_waiting(store):
    resource = store.get_or_create("hash-f", "Book")
    ingester = SemanticIngester(model="test-model", api_key="sk-test")

    rate_limit_resp = MagicMock()
    rate_limit_resp.status_code = 429
    rate_limit_resp.headers = {"Retry-After": "1"}

    success_resp = _fake_openrouter_response("Hello world.", "p. 1")

    steps: list[str | None] = []
    original_update_step = store.update_step

    def capturing_update_step(rid, step):
        steps.append(step)
        original_update_step(rid, step)

    store.update_step = capturing_update_step

    call_count = 0

    def mock_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return rate_limit_resp if call_count == 1 else success_resp

    with patch("backend.semantic_ingester.httpx.post", side_effect=mock_post):
        with patch("backend.semantic_ingester.time.sleep"):
            ingester.ingest(resource.id, [(1, "text")], store, FakeEmbedder())

    rate_limited_steps = [i for i, s in enumerate(steps) if s and s.startswith("rate_limited:")]
    assert rate_limited_steps, "expected at least one rate_limited:<n> step"
    # step resumes to the batch step after the countdown, then moves to "embedding"
    assert steps[rate_limited_steps[-1] + 1].startswith("chunking:")


# ── Slice 9: ingest() sets chunking then embedding steps ─────────────────────

def test_ingest_sets_chunking_and_embedding_steps(store):
    resource = store.get_or_create("hash-steps-si", "Book")
    ingester = SemanticIngester(model="test-model", api_key="sk-test")

    step_calls = []
    original_update_step = store.update_step
    def capture_step(rid, step):
        step_calls.append(step)
        return original_update_step(rid, step)

    with patch("backend.semantic_ingester.httpx.post", return_value=_fake_openrouter_response("Chunk text.")), \
         patch.object(store, "update_step", side_effect=capture_step):
        ingester.ingest(resource.id, [(1, "Page text.")], store, FakeEmbedder())

    assert step_calls == ["chunking:1/1", "embedding"]
    status = store.get_status(resource.id)
    assert status["current_step"] is None  # cleared on ready


# ── Slice 8: run_url_pipeline passes single page to SemanticIngester ─────────

def test_run_url_pipeline_passes_single_page_to_semantic_ingester(tmp_path):
    from backend.resource_store import ResourceStore
    from backend.ingestion import IngestionService

    store = ResourceStore(base_dir=tmp_path)
    ingester = SemanticIngester(model="test-model", api_key="sk-test")
    service = IngestionService(store=store, semantic_ingester=ingester)

    result = service.accept_url(project_id="p1", url="https://example.com/article")
    resource_id = result["resource_id"]

    captured_pages: list = []

    def fake_ingest(rid, pages, s, e):
        captured_pages.extend(pages)
        store.update_status(rid, "ready")

    fake_resp = MagicMock()
    fake_resp.text = "<html><body><p>Article text.</p></body></html>"
    fake_resp.raise_for_status = MagicMock()

    with patch("backend.ingestion.httpx.get", return_value=fake_resp), \
         patch("backend.extractor.extract_url", return_value=("Article text.", {})), \
         patch.object(ingester, "ingest", side_effect=fake_ingest):
        service.run_url_pipeline(resource_id, "https://example.com/article")

    assert len(captured_pages) == 1
    assert captured_pages[0][0] == 1
