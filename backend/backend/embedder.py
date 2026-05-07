from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class Embedder(Protocol):
    id: str

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class FastEmbedEmbedder:
    id = "fastembed-bge-small-en-v1.5"
    _model = None

    def _get_model(self):
        if self._model is None:
            from fastembed import TextEmbedding
            FastEmbedEmbedder._model = TextEmbedding(
                "BAAI/bge-small-en-v1.5",
                providers=["CPUExecutionProvider"],
            )
        return self._model

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._get_model()
        return [v.tolist() for v in model.embed(texts)]


class OllamaEmbedder:
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "nomic-embed-text") -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.id = f"ollama-{model}"

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        import httpx
        results = []
        for text in texts:
            resp = httpx.post(
                f"{self.base_url}/api/embeddings",
                json={"model": self.model, "prompt": text},
                timeout=60,
            )
            resp.raise_for_status()
            results.append(resp.json()["embedding"])
        return results
