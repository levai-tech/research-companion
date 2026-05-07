from __future__ import annotations

import re
from typing import Protocol, runtime_checkable


@runtime_checkable
class Chunker(Protocol):
    id: str

    def chunk(self, text: str) -> list[str]: ...


_SEPARATORS = ["\n\n", "\n", r"(?<=\. ) ", r"(?<=\! ) ", r"(?<=\? ) ", " "]


class RecursiveChunker:
    id = "recursive-v1"

    def __init__(self, chunk_size: int = 2000, overlap: int = 200) -> None:
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk(self, text: str) -> list[str]:
        if not text.strip():
            return []
        if len(text) <= self.chunk_size:
            return [text]

        chunks: list[str] = []
        pos = 0
        while pos < len(text):
            end = min(pos + self.chunk_size, len(text))
            if end == len(text):
                chunks.append(text[pos:])
                break

            # Try natural split point working backwards from end
            split_at = end
            for sep in ["\n\n", "\n", ". ", "! ", "? ", " "]:
                idx = text.rfind(sep, pos + 1, end)
                if idx != -1:
                    split_at = idx + len(sep)
                    break

            chunks.append(text[pos:split_at])
            pos = max(pos + 1, split_at - self.overlap)

        return chunks
