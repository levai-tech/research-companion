import pytest
from backend.embedder import Embedder


# ── Shared fake that satisfies the Embedder protocol ─────────────────────────

class FakeEmbedder:
    id = "fake-v0"
    DIM = 384

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[float(i % 10) / 10 for i in range(self.DIM)] for _ in texts]


# ── Slice 2a: protocol compliance ────────────────────────────────────────────

def test_fake_embedder_satisfies_protocol():
    assert isinstance(FakeEmbedder(), Embedder)


# ── Slice 2b: one vector per text ────────────────────────────────────────────

def test_embed_returns_one_vector_per_text():
    result = FakeEmbedder().embed(["hello", "world", "test"])
    assert len(result) == 3


# ── Slice 2c: vector dimension ───────────────────────────────────────────────

def test_embed_vector_has_correct_dimension():
    result = FakeEmbedder().embed(["hello"])
    assert len(result[0]) == 384


# ── Slice 2d: empty input ────────────────────────────────────────────────────

def test_embed_empty_input_returns_empty():
    assert FakeEmbedder().embed([]) == []


# ── Slice 2e: embedder has an id ─────────────────────────────────────────────

def test_embedder_has_id():
    assert FakeEmbedder().id
