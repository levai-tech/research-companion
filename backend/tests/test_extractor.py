from __future__ import annotations

import io

import pytest


def make_pdf(pages: list[str]) -> bytes:
    import pymupdf  # type: ignore

    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        page.insert_text((72, 72), text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def make_docx(paragraphs: list[tuple[str, str]]) -> bytes:
    """paragraphs: list of (style, text) where style is 'Normal' or 'Heading 1' etc."""
    from docx import Document  # type: ignore

    doc = Document()
    for style, text in paragraphs:
        doc.add_paragraph(text, style=style)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


from backend.extractor import extract_file_pages


# ── Slice 1: TXT ──────────────────────────────────────────────────────────────

def test_txt_returns_single_page():
    result = extract_file_pages(b"hello world", "notes.txt")
    assert result == [(1, "hello world")]


# ── Slice 2: PDF ──────────────────────────────────────────────────────────────

def test_pdf_returns_one_tuple_per_page():
    pdf = make_pdf(["page one text", "page two text", "page three text"])
    result = extract_file_pages(pdf, "book.pdf")
    assert len(result) == 3


def test_pdf_page_numbers_are_one_indexed():
    pdf = make_pdf(["first", "second"])
    result = extract_file_pages(pdf, "doc.pdf")
    assert result[0][0] == 1
    assert result[1][0] == 2


def test_pdf_page_text_is_preserved():
    pdf = make_pdf(["hello from page one", "hello from page two"])
    result = extract_file_pages(pdf, "doc.pdf")
    assert "hello from page one" in result[0][1]
    assert "hello from page two" in result[1][1]


# ── Slice 3: DOCX ─────────────────────────────────────────────────────────────

def test_docx_with_headings_groups_by_section():
    docx = make_docx([
        ("Heading 1", "Introduction"),
        ("Normal", "Some intro text."),
        ("Heading 1", "Methods"),
        ("Normal", "Some methods text."),
    ])
    result = extract_file_pages(docx, "paper.docx")
    assert len(result) == 2
    assert result[0][0] == 1
    assert result[1][0] == 2


def test_docx_heading_text_is_first_line_of_section():
    docx = make_docx([
        ("Heading 1", "Chapter One"),
        ("Normal", "Body of chapter one."),
    ])
    result = extract_file_pages(docx, "book.docx")
    assert result[0][1].startswith("Chapter One")
    assert "Body of chapter one." in result[0][1]


def test_docx_without_headings_returns_single_tuple():
    docx = make_docx([
        ("Normal", "First paragraph."),
        ("Normal", "Second paragraph."),
    ])
    result = extract_file_pages(docx, "notes.docx")
    assert len(result) == 1
    assert result[0][0] == 1
    assert "First paragraph." in result[0][1]
    assert "Second paragraph." in result[0][1]


# ── Slice 4: other file types ─────────────────────────────────────────────────

def test_html_returns_single_page():
    result = extract_file_pages(b"<html><body>content</body></html>", "article.html")
    assert len(result) == 1
    assert result[0][0] == 1
