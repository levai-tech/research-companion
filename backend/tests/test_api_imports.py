"""Verify that the API process does not import heavy ingestion libs at startup.

fastembed, pymupdf (fitz), onnxruntime, and trafilatura must NOT be loaded
when the FastAPI app is created — they belong in the worker subprocess.
"""
import sys


def test_create_app_does_not_import_fastembed(tmp_path):
    _purge(["fastembed", "fitz", "pymupdf", "onnxruntime", "trafilatura"])

    from backend.main import create_app
    create_app(projects_dir=tmp_path)

    for lib in ("fastembed", "fitz", "pymupdf", "onnxruntime", "trafilatura"):
        loaded = [m for m in sys.modules if m == lib or m.startswith(lib + ".")]
        assert not loaded, f"{lib!r} was imported during create_app()"


def _purge(prefixes: list[str]) -> None:
    for key in list(sys.modules):
        if any(key == p or key.startswith(p + ".") for p in prefixes):
            del sys.modules[key]
