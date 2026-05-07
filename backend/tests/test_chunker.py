from backend.chunker import RecursiveChunker


# ── Slice 1a: empty / whitespace ─────────────────────────────────────────────

def test_empty_text_returns_empty():
    assert RecursiveChunker().chunk("") == []


def test_whitespace_only_returns_empty():
    assert RecursiveChunker().chunk("   \n  ") == []


# ── Slice 1b: short text stays as one chunk ───────────────────────────────────

def test_short_text_returns_single_chunk():
    chunker = RecursiveChunker(chunk_size=2000, overlap=200)
    text = "Hello world"
    assert chunker.chunk(text) == ["Hello world"]


# ── Slice 1c: no chunk exceeds chunk_size ─────────────────────────────────────

def test_no_chunk_exceeds_chunk_size():
    chunker = RecursiveChunker(chunk_size=100, overlap=20)
    text = "word " * 200  # 1000 chars
    chunks = chunker.chunk(text)
    assert chunks
    assert all(len(c) <= 100 for c in chunks)


# ── Slice 1d: all text is covered ────────────────────────────────────────────

def test_all_text_covered():
    chunker = RecursiveChunker(chunk_size=100, overlap=20)
    text = "alpha " * 50  # 300 chars
    chunks = chunker.chunk(text)
    # Every 10-char window in the original appears in at least one chunk
    for i in range(0, len(text) - 10):
        snippet = text[i : i + 10]
        assert any(snippet in c for c in chunks), f"position {i} not covered"


# ── Slice 1e: overlap shared between adjacent chunks ─────────────────────────

def test_overlap_shared_between_adjacent_chunks():
    chunker = RecursiveChunker(chunk_size=50, overlap=10)
    text = "a" * 200
    chunks = chunker.chunk(text)
    assert len(chunks) > 1
    tail = chunks[0][-10:]
    assert chunks[1].startswith(tail)


# ── Slice 1f: chunker has an id ───────────────────────────────────────────────

def test_chunker_has_id():
    assert RecursiveChunker().id
