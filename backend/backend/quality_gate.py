from __future__ import annotations

import re


# Patterns that identify orphaned cross-references when the chunk consists
# almost entirely of the reference phrase and nothing else.
_CROSS_REF_PATTERNS = [
    re.compile(r"^\s*see\s+section\b", re.IGNORECASE),
    re.compile(r"^\s*ibid\b", re.IGNORECASE),
    re.compile(r"^\s*op\.?\s*cit\b", re.IGNORECASE),
]

# A cross-ref chunk is one whose first substantive content is a reference
# phrase AND the whole chunk is short (under _CROSS_REF_MAX_WORDS words).
_CROSS_REF_MAX_WORDS = 20

# A bare caption starts with "Figure N." or "Table N:" (with optional roman
# numerals / letters) and contains no sentence beyond the label line.
_BARE_CAPTION_RE = re.compile(
    r"^\s*(figure|fig\.?|table|tbl\.?)\s+[\dIVXivxA-Za-z]+[.:\-]",
    re.IGNORECASE,
)
_BARE_CAPTION_MAX_WORDS = 20


class ChunkQualityGate:
    def filter(self, chunks: list[str]) -> tuple[list[str], list[tuple[str, str]]]:
        """Return (accepted, rejected) where rejected = [(chunk_text, reason), ...]."""
        accepted: list[str] = []
        rejected: list[tuple[str, str]] = []
        for chunk in chunks:
            reason = self._reject_reason(chunk)
            if reason:
                rejected.append((chunk, reason))
            else:
                accepted.append(chunk)
        return accepted, rejected

    _MIN_WORDS = 30
    _MIN_PROSE_RATIO = 0.20  # alpha tokens ≥4 chars / total words

    def _reject_reason(self, chunk: str) -> str | None:
        # Specific reasons before generic too_short so the log is informative.
        if self._is_cross_ref(chunk):
            return "cross_ref"
        if self._is_bare_caption(chunk):
            return "bare_caption"
        words = chunk.split()
        if len(words) < self._MIN_WORDS:
            return "too_short"
        prose_words = sum(1 for w in words if w.isalpha() and len(w) >= 4)
        if prose_words / len(words) < self._MIN_PROSE_RATIO:
            return "no_prose"
        return None

    def _is_cross_ref(self, chunk: str) -> bool:
        if len(chunk.split()) > _CROSS_REF_MAX_WORDS:
            return False
        return any(p.search(chunk) for p in _CROSS_REF_PATTERNS)

    def _is_bare_caption(self, chunk: str) -> bool:
        if len(chunk.split()) > _BARE_CAPTION_MAX_WORDS:
            return False
        return bool(_BARE_CAPTION_RE.match(chunk))
