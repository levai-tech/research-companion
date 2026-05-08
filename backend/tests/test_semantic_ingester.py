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


# ── Slice 1: _parse_response → ChunkResult list (tracer bullet) ───────────────

def test_parse_response_extracts_chunks_with_location():
    response = (
        "===CHUNK===\n"
        "LOCATION: p. 5\n"
        "First chunk text here.\n"
        "===CHUNK===\n"
        "LOCATION: p. 7\n"
        "Second chunk text here."
    )
    results = SemanticIngester._parse_response(response, set())
    assert len(results) == 2
    assert results[0].text == "First chunk text here."
    assert results[0].location == "p. 5"
    assert results[1].text == "Second chunk text here."
    assert results[1].location == "p. 7"


def test_parse_response_chunk_without_location_header():
    response = "===CHUNK===\nSome unlabelled text."
    results = SemanticIngester._parse_response(response, set())
    assert len(results) == 1
    assert results[0].location is None
    assert results[0].text == "Some unlabelled text."


def test_parse_response_filters_overlap_zone_pages():
    response = (
        "===CHUNK===\nLOCATION: p. 38\nOverlap page — should be dropped.\n"
        "===CHUNK===\nLOCATION: p. 39\nAnother overlap page — dropped.\n"
        "===CHUNK===\nLOCATION: p. 40\nReal chunk — should be kept."
    )
    results = SemanticIngester._parse_response(response, {38, 39})
    assert len(results) == 1
    assert results[0].location == "p. 40"


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


def test_ingest_stores_chunks_and_sets_ready(store):
    resource = store.get_or_create("hash-a", "Book")
    ingester = SemanticIngester(model="anthropic/claude-haiku-4-5", api_key="sk-test")

    with patch("backend.semantic_ingester.httpx.post", return_value=_fake_openrouter_response("Hello world.")):
        ingester.ingest(resource.id, [(1, "Page one text.")], store, FakeEmbedder())

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "ready"
    assert status["chunks_done"] == 1
    assert status["chunks_total"] == 1


# ── Slice 5: ingest() fast-fail when no API key ───────────────────────────────

def test_ingest_fails_fast_when_no_api_key(store):
    resource = store.get_or_create("hash-b", "Book")
    ingester = SemanticIngester(model="anthropic/claude-haiku-4-5", api_key="")

    with patch("backend.semantic_ingester.httpx.post") as mock_post:
        ingester.ingest(resource.id, [(1, "text")], store, FakeEmbedder())
        mock_post.assert_not_called()

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "failed"
    assert "OpenRouter API key" in status["error_message"]


# ── Slice 6: ingest() sets failed on OpenRouter error ────────────────────────

def test_ingest_sets_failed_on_openrouter_error(store):
    resource = store.get_or_create("hash-c", "Book")
    ingester = SemanticIngester(model="anthropic/claude-haiku-4-5", api_key="sk-test")

    error_resp = MagicMock()
    error_resp.status_code = 401
    http_error = httpx.HTTPStatusError("Unauthorized", request=MagicMock(), response=error_resp)
    error_resp.raise_for_status.side_effect = http_error

    with patch("backend.semantic_ingester.httpx.post", return_value=error_resp):
        ingester.ingest(resource.id, [(1, "text")], store, FakeEmbedder())

    status = store.get_status(resource.id)
    assert status["indexing_status"] == "failed"
    assert "Claude API" in status["error_message"]


# ── Slice 7: run_file_pipeline uses SemanticIngester ─────────────────────────

def test_run_file_pipeline_uses_semantic_ingester(tmp_path):
    from backend.resource_store import ResourceStore
    from backend.ingestion import IngestionService

    store = ResourceStore(base_dir=tmp_path)
    ingester = SemanticIngester(model="anthropic/claude-haiku-4-5", api_key="sk-test")
    service = IngestionService(store=store, semantic_ingester=ingester)

    content = b"Hello world, this is page one text."
    result = service.accept_file(project_id="p1", content=content, resource_type="Book")
    resource_id = result["resource_id"]

    with patch("backend.semantic_ingester.httpx.post", return_value=_fake_openrouter_response("A chunk.", "p. 1")):
        service.run_file_pipeline(resource_id, "test.txt")

    status = store.get_status(resource_id)
    assert status["indexing_status"] == "ready"


# ── Slice 8: run_url_pipeline passes single page to SemanticIngester ─────────

def test_run_url_pipeline_passes_single_page_to_semantic_ingester(tmp_path):
    from backend.resource_store import ResourceStore
    from backend.ingestion import IngestionService

    store = ResourceStore(base_dir=tmp_path)
    ingester = SemanticIngester(model="anthropic/claude-haiku-4-5", api_key="sk-test")
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
