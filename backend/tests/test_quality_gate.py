"""TDD suite for ChunkQualityGate (issue #55).

Vertical slices:
  1. Valid prose chunk passes through unchanged (tracer bullet)
  2. Chunk under 30 words rejected as "too_short"
  3. Pure number / list content rejected as "no_prose"
  4. Orphaned cross-reference rejected as "cross_ref"
  5. Standalone figure/table caption rejected as "bare_caption"
  6. Mixed batch — only bad chunks filtered
  7. run_ingestion logs filtered chunks and embeds only accepted chunks
"""
from __future__ import annotations

import logging

import pytest

from backend.quality_gate import ChunkQualityGate


@pytest.fixture
def gate() -> ChunkQualityGate:
    return ChunkQualityGate()


# ── Slice 1: tracer — valid prose passes ──────────────────────────────────────

def test_valid_prose_chunk_passes(gate):
    prose = (
        "The study found that long-term exposure to elevated cortisol levels "
        "is associated with measurable reductions in hippocampal volume, "
        "suggesting a neurobiological mechanism for stress-related memory impairment. "
        "These findings replicate earlier animal studies and extend them to a human cohort."
    )
    accepted, rejected = gate.filter([prose])
    assert accepted == [prose]
    assert rejected == []


# ── Slice 2: too_short ────────────────────────────────────────────────────────

def test_chunk_under_30_words_is_rejected(gate):
    short = "See above for details."
    accepted, rejected = gate.filter([short])
    assert accepted == []
    assert rejected == [(short, "too_short")]


def test_chunk_of_exactly_30_words_passes(gate):
    # 30 real words — meets the minimum exactly
    chunk = (
        "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu "
        "xi omicron pi rho sigma tau upsilon phi chi psi omega alpha beta gamma "
        "delta epsilon zeta"
    )
    assert len(chunk.split()) == 30
    accepted, _ = gate.filter([chunk])
    assert accepted == [chunk]


def test_chunk_over_30_words_passes(gate):
    chunk = (
        "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu "
        "xi omicron pi rho sigma tau upsilon phi chi psi omega alpha beta gamma "
        "delta epsilon zeta eta"
    )
    assert len(chunk.split()) == 31
    accepted, _ = gate.filter([chunk])
    assert accepted == [chunk]


# ── Slice 3: cross_ref ───────────────────────────────────────────────────────

def test_see_section_cross_ref_is_rejected(gate):
    chunk = "See section 4.2 for a detailed breakdown of the methodology."
    _, rejected = gate.filter([chunk])
    assert len(rejected) == 1
    assert rejected[0][1] == "cross_ref"


def test_ibid_cross_ref_is_rejected(gate):
    chunk = "Ibid., p. 47."
    _, rejected = gate.filter([chunk])
    assert rejected[0][1] == "cross_ref"


def test_op_cit_cross_ref_is_rejected(gate):
    chunk = "Op. cit., Foucault, p. 112."
    _, rejected = gate.filter([chunk])
    assert rejected[0][1] == "cross_ref"


def test_cross_ref_embedded_in_prose_passes(gate):
    # "See section" buried inside real prose should not be rejected
    chunk = (
        "As discussed in the preceding chapter, the author argues that institutional "
        "trust shapes civic participation more than income level does — see section 4.2 "
        "for the regression tables, though the qualitative interviews are equally "
        "compelling and form the backbone of this analysis."
    )
    accepted, _ = gate.filter([chunk])
    assert accepted == [chunk]


# ── Slice 4: bare_caption ────────────────────────────────────────────────────

def test_figure_caption_without_description_is_rejected(gate):
    chunk = "Figure 3. Population growth by region, 2000–2020."
    _, rejected = gate.filter([chunk])
    assert rejected[0][1] == "bare_caption"


def test_table_caption_without_description_is_rejected(gate):
    chunk = "Table 12: Summary statistics for the experimental group."
    _, rejected = gate.filter([chunk])
    assert rejected[0][1] == "bare_caption"


def test_figure_caption_with_descriptive_prose_passes(gate):
    chunk = (
        "Figure 3. Population growth by region, 2000–2020. "
        "The shaded areas represent periods of economic contraction during which "
        "growth stalled or reversed in more than half of the surveyed countries, "
        "particularly across Sub-Saharan Africa and South-East Asia."
    )
    accepted, _ = gate.filter([chunk])
    assert accepted == [chunk]


# ── Slice 5: mixed batch ─────────────────────────────────────────────────────

def test_mixed_batch_only_bad_chunks_filtered(gate):
    good = (
        "The author contends that state capacity, not cultural factors, explains "
        "divergent development trajectories across post-colonial nations in the "
        "second half of the twentieth century, drawing on twenty comparative case studies."
    )
    bad_cross_ref = "See section 4.2 for full derivations."
    bad_caption = "Table 4. Regression coefficients."
    # 40 tokens, all digits — no alpha prose
    bad_no_prose = " ".join(str(i) for i in range(40))

    accepted, rejected = gate.filter([good, bad_cross_ref, bad_caption, bad_no_prose])

    assert accepted == [good]
    assert len(rejected) == 3
    reasons = {r for _, r in rejected}
    assert reasons == {"cross_ref", "bare_caption", "no_prose"}


# ── Slice 6: run_ingestion integration ───────────────────────────────────────


class _FakeChunker:
    id = "fake-chunker-v0"

    def __init__(self, output: list[str]):
        self._output = output

    def chunk(self, text: str) -> list[str]:
        return self._output


class _FakeEmbedder:
    id = "fake-embedder-v0"
    DIM = 384

    def __init__(self):
        self.received: list[str] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.received.extend(texts)
        return [[0.1] * self.DIM for _ in texts]


def _long_prose(seed: str) -> str:
    return (seed + " ") * 8  # 8 × repetitions → well over 30 words


def test_run_ingestion_filtered_chunks_not_embedded(tmp_path):
    from backend.resource_store import ResourceStore
    from backend.ingestion import IngestionService

    store = ResourceStore(base_dir=tmp_path)
    embedder = _FakeEmbedder()

    good = _long_prose("This chapter examines structural inequality across nations")
    bad = "See section 4.2."  # cross_ref

    chunker = _FakeChunker([good, bad])
    service = IngestionService(store=store)
    resource = store.get_or_create("hash-gate", "Book")

    service.run_ingestion(resource.id, "text", chunker, embedder)

    assert good in embedder.received
    assert bad not in embedder.received


def test_run_ingestion_filtered_chunks_logged(tmp_path, caplog):
    import logging
    from backend.resource_store import ResourceStore
    from backend.ingestion import IngestionService

    store = ResourceStore(base_dir=tmp_path)
    embedder = _FakeEmbedder()

    good = _long_prose("This chapter examines structural inequality across nations")
    bad = "See section 4.2."

    chunker = _FakeChunker([good, bad])
    service = IngestionService(store=store)
    resource = store.get_or_create("hash-gate-log", "Book")

    with caplog.at_level(logging.INFO, logger="backend.ingestion"):
        service.run_ingestion(resource.id, "text", chunker, embedder)

    assert any("cross_ref" in r.message for r in caplog.records)
    assert any("See section 4.2." in r.message for r in caplog.records)


# ── Slice 7: no_prose ─────────────────────────────────────────────────────────

def test_pure_number_list_is_rejected(gate):
    # A block of numbers with no prose — common in data tables or index pages
    chunk = "\n".join([f"{i}. {i * 100}" for i in range(1, 35)])
    _, rejected = gate.filter([chunk])
    assert len(rejected) == 1
    assert rejected[0][1] == "no_prose"


def test_chunk_that_is_list_of_short_numeric_items_is_rejected(gate):
    # e.g. a page of prices or index entries — no prose connective tissue
    chunk = "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31"
    _, rejected = gate.filter([chunk])
    assert len(rejected) == 1
    assert rejected[0][1] == "no_prose"


def test_chunk_with_prose_among_numbers_passes(gate):
    chunk = (
        "1. Introduction\n"
        "This chapter examines the relationship between economic inequality and "
        "educational attainment across thirty OECD nations over a twenty-year period. "
        "The evidence suggests structural factors dominate individual variables. "
        "2. Methodology\n"
    )
    accepted, _ = gate.filter([chunk])
    assert accepted == [chunk]
