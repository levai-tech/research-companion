from __future__ import annotations

import hashlib
from urllib.parse import urlparse, urlunparse

import httpx

from backend.chunker import Chunker, RecursiveChunker
from backend.embedder import Embedder, FastEmbedEmbedder
from backend.resource_store import ResourceStore


def _normalize_url(url: str) -> str:
    parsed = urlparse(url)
    normalized = parsed._replace(
        scheme=parsed.scheme.lower(),
        netloc=parsed.netloc.lower(),
        fragment="",
    )
    return urlunparse(normalized)


class IngestionService:
    def __init__(
        self,
        store: ResourceStore,
        chunker: Chunker | None = None,
        embedder: Embedder | None = None,
    ) -> None:
        self._store = store
        self._chunker: Chunker = chunker or RecursiveChunker()
        self._embedder: Embedder = embedder or FastEmbedEmbedder()

    @property
    def embedder(self) -> Embedder:
        return self._embedder

    def accept_file(
        self,
        project_id: str,
        content: bytes,
        resource_type: str,
        citation_metadata: dict | None = None,
    ) -> dict:
        sha256 = hashlib.sha256(content).hexdigest()
        resource = self._store.get_or_create(sha256, resource_type, citation_metadata)

        # Save raw file for ingestion (idempotent)
        dest = self._store._sources_dir / sha256
        if not dest.exists():
            dest.write_bytes(content)

        self._store.attach(project_id, resource.id)
        return {"resource_id": resource.id, "indexing_status": resource.indexing_status}

    def accept_url(
        self,
        project_id: str,
        url: str,
        citation_metadata: dict | None = None,
    ) -> dict:
        key = _normalize_url(url)
        resource = self._store.get_or_create(key, "Webpage", citation_metadata)
        self._store.attach(project_id, resource.id)
        return {"resource_id": resource.id, "indexing_status": resource.indexing_status}

    def get_status(self, resource_id: str) -> dict | None:
        return self._store.get_status(resource_id)

    _EMBED_BATCH = 64

    def run_ingestion(
        self,
        resource_id: str,
        text: str,
        chunker: Chunker,
        embedder: Embedder,
    ) -> None:
        try:
            chunks = chunker.chunk(text)
            total = len(chunks)
            self._store.update_status(resource_id, "indexing", chunks_total=total)
            all_embeddings: list[list[float]] = []
            for i in range(0, total, self._EMBED_BATCH):
                batch = chunks[i : i + self._EMBED_BATCH]
                all_embeddings.extend(embedder.embed(batch))
                self._store.update_progress(resource_id, i + len(batch), total)
            self._store.store_chunks_and_embeddings(
                resource_id, chunks, all_embeddings, chunker.id, embedder.id
            )
        except Exception as exc:
            self._store.update_status(resource_id, "failed", error_message=str(exc))

    def run_file_pipeline(self, resource_id: str, filename: str) -> None:
        from backend.extractor import extract_file

        src = self._store._sources_dir / _content_hash_for(resource_id, self._store)
        if src is None or not src.exists():
            self._store.update_status(resource_id, "failed", error_message="source file not found")
            return
        text, citation = extract_file(src.read_bytes(), filename)
        if citation:
            _merge_citation(self._store, resource_id, citation)
        self.run_ingestion(resource_id, text, self._chunker, self._embedder)

    def run_url_pipeline(self, resource_id: str, url: str) -> None:
        from backend.extractor import extract_url

        try:
            resp = httpx.get(url, follow_redirects=True, timeout=30)
            resp.raise_for_status()
            text, citation = extract_url(resp.text)
        except Exception as exc:
            self._store.update_status(resource_id, "failed", error_message=str(exc))
            return
        if citation:
            _merge_citation(self._store, resource_id, citation)
        self.run_ingestion(resource_id, text, self._chunker, self._embedder)


def _content_hash_for(resource_id: str, store: ResourceStore) -> str | None:
    import sqlite3
    con = sqlite3.connect(store._db_path)
    row = con.execute("SELECT content_hash FROM resources WHERE id=?", (resource_id,)).fetchone()
    con.close()
    return row[0] if row else None


def _merge_citation(store: ResourceStore, resource_id: str, new_meta: dict) -> None:
    import sqlite3, json
    con = sqlite3.connect(store._db_path)
    row = con.execute("SELECT citation_metadata FROM resources WHERE id=?", (resource_id,)).fetchone()
    if row:
        existing = json.loads(row[0])
        merged = {**new_meta, **existing}  # user-supplied fields win
        con.execute(
            "UPDATE resources SET citation_metadata=? WHERE id=?",
            (json.dumps(merged), resource_id),
        )
        con.commit()
    con.close()
