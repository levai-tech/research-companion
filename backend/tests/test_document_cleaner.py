"""TDD suite for DocumentCleaner (issue #54).

Vertical slices:
  1. strip_pages removes inclusive range (tracer bullet)
  2. strip_first_n_lines_per_page removes leading lines
  3. strip_patterns strips regex matches
  4. Empty pages after stripping are dropped
  5. clean() applies LLM-returned rules
  6. LLM bad JSON → pages returned unchanged (non-fatal)
  7. LLM HTTP exception → pages returned unchanged (non-fatal)
  8. Prompt judges by search impact / quality, not hardcoded pattern names
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.document_cleaner import DocumentCleaner


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_cleaner() -> DocumentCleaner:
    return DocumentCleaner(model="test-model", api_key="sk-test")


def _no_rules() -> dict:
    return {"strip_first_n_lines_per_page": 0, "strip_pages": [], "strip_patterns": []}


def _async_openrouter_mock(content: str):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"choices": [{"message": {"content": content}}]}

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)

    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
    mock_cm.__aexit__ = AsyncMock(return_value=None)
    return mock_cm


# ── Phase 0: Page sampling ────────────────────────────────────────────────────


def test_sample_pages_returns_all_when_fewer_than_2n():
    """Short documents (≤ 2×N pages) send all pages to the LLM — no sampling."""
    pages = [(i, f"page {i}") for i in range(1, 8)]  # 7 pages, threshold is 10
    result = DocumentCleaner._sample_pages(pages, 5)
    assert result == pages


def test_sample_pages_returns_first_and_last_n_for_long_docs():
    pages = [(i, f"page {i}") for i in range(1, 21)]  # 20 pages
    result = DocumentCleaner._sample_pages(pages, 5)
    assert [p for p, _ in result] == [1, 2, 3, 4, 5, 16, 17, 18, 19, 20]


# ── Phase 1: Rule application (static, no I/O) ────────────────────────────────


def test_strip_pages_removes_inclusive_range():
    """Tracer bullet: strip_pages [[2, 3]] removes pages 2 and 3."""
    pages = [(1, "alpha"), (2, "beta"), (3, "gamma"), (4, "delta")]
    rules = {**_no_rules(), "strip_pages": [[2, 3]]}
    result = DocumentCleaner._apply_rules(pages, rules)
    assert [p for p, _ in result] == [1, 4]


def test_strip_pages_single_page_range():
    pages = [(5, "keep"), (6, "remove"), (7, "keep")]
    rules = {**_no_rules(), "strip_pages": [[6, 6]]}
    result = DocumentCleaner._apply_rules(pages, rules)
    assert [p for p, _ in result] == [5, 7]


def test_strip_first_n_lines_removes_leading_lines():
    pages = [(1, "HEADER\ncontent line\nanother line")]
    rules = {**_no_rules(), "strip_first_n_lines_per_page": 1}
    result = DocumentCleaner._apply_rules(pages, rules)
    assert result == [(1, "content line\nanother line")]


def test_strip_first_n_lines_applies_to_every_page():
    pages = [(1, "HDR\npage 1 body"), (2, "HDR\npage 2 body")]
    rules = {**_no_rules(), "strip_first_n_lines_per_page": 1}
    result = DocumentCleaner._apply_rules(pages, rules)
    assert result == [(1, "page 1 body"), (2, "page 2 body")]


def test_strip_patterns_removes_regex_matches():
    pages = [(1, "text [1] more [23] end")]
    rules = {**_no_rules(), "strip_patterns": [r"\[\d+\]"]}
    result = DocumentCleaner._apply_rules(pages, rules)
    assert result[0][1] == "text  more  end"


def test_strip_patterns_multiple_patterns():
    pages = [(1, "text [1] and (Smith, 2020) here")]
    rules = {**_no_rules(), "strip_patterns": [r"\[\d+\]", r"\(\w+,\s*\d{4}\)"]}
    result = DocumentCleaner._apply_rules(pages, rules)
    assert result[0][1] == "text  and  here"


def test_empty_page_after_stripping_is_dropped():
    """A page that becomes empty after stripping is dropped; pages with remaining text are kept."""
    pages = [(1, "HEADER ONLY"), (2, "HEADER\nreal content")]
    rules = {**_no_rules(), "strip_first_n_lines_per_page": 1}
    result = DocumentCleaner._apply_rules(pages, rules)
    assert [p for p, _ in result] == [2]
    assert result[0][1] == "real content"


def test_all_rules_applied_together():
    """strip_pages + strip_first_n_lines + strip_patterns combine correctly."""
    pages = [
        (1, "HDR\ntext with [1]"),
        (2, "page 2 removed"),
        (3, "HDR\nclean text"),
    ]
    rules = {
        "strip_first_n_lines_per_page": 1,
        "strip_pages": [[2, 2]],
        "strip_patterns": [r"\[\d+\]"],
    }
    result = DocumentCleaner._apply_rules(pages, rules)
    assert len(result) == 2
    assert result[0] == (1, "text with ")
    assert result[1] == (3, "clean text")


# ── Phase 2: LLM integration ──────────────────────────────────────────────────


async def test_clean_applies_rules_from_llm():
    """clean() calls LLM, receives rules, and applies them to pages."""
    cleaner = _make_cleaner()
    pages = [(1, "HDR\nreal text"), (2, "HDR\nmore text")]
    llm_rules = {**_no_rules(), "strip_first_n_lines_per_page": 1}
    mock_cm = _async_openrouter_mock(json.dumps(llm_rules))

    with patch("backend.document_cleaner.httpx.AsyncClient", return_value=mock_cm):
        result = await cleaner.clean(pages)

    assert result == [(1, "real text"), (2, "more text")]


async def test_clean_bad_json_returns_pages_unchanged():
    """LLM returns non-JSON → clean() is non-fatal and returns original pages."""
    cleaner = _make_cleaner()
    pages = [(1, "page one"), (2, "page two")]
    mock_cm = _async_openrouter_mock("not valid json at all")

    with patch("backend.document_cleaner.httpx.AsyncClient", return_value=mock_cm):
        result = await cleaner.clean(pages)

    assert result == pages


async def test_clean_http_exception_returns_pages_unchanged():
    """HTTP error → clean() is non-fatal and returns original pages."""
    cleaner = _make_cleaner()
    pages = [(1, "page one")]

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=Exception("network error"))
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
    mock_cm.__aexit__ = AsyncMock(return_value=None)

    with patch("backend.document_cleaner.httpx.AsyncClient", return_value=mock_cm):
        result = await cleaner.clean(pages)

    assert result == pages


# ── Phase 3: Prompt content ───────────────────────────────────────────────────


async def test_prompt_judges_by_search_impact_not_pattern_names():
    """Prompt must instruct the LLM to judge by search quality/impact."""
    cleaner = _make_cleaner()
    pages = [(1, "some text")]
    llm_rules = _no_rules()

    captured: dict = {}

    async def capture_post(url, **kwargs):
        captured["json"] = kwargs.get("json", {})
        resp = MagicMock()
        resp.status_code = 200
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {"choices": [{"message": {"content": json.dumps(llm_rules)}}]}
        return resp

    mock_client = AsyncMock()
    mock_client.post = capture_post
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
    mock_cm.__aexit__ = AsyncMock(return_value=None)

    with patch("backend.document_cleaner.httpx.AsyncClient", return_value=mock_cm):
        await cleaner.clean(pages)

    assert captured, "LLM was never called"
    messages = captured["json"]["messages"]
    prompt_text = " ".join(m["content"] for m in messages).lower()
    assert "search" in prompt_text
    assert "impact" in prompt_text or "quality" in prompt_text
