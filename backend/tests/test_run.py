import subprocess
import sys
import time
import httpx
from backend.main import find_free_port


def test_backend_serves_on_given_port():
    port = find_free_port()
    proc = subprocess.Popen(
        [sys.executable, "-m", "backend.main", "--port", str(port)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                r = httpx.get(f"http://127.0.0.1:{port}/health", timeout=0.5)
                assert r.status_code == 200
                assert r.json() == {"status": "ok"}
                return
            except httpx.TransportError:
                time.sleep(0.1)
        raise TimeoutError(f"Backend did not start on port {port} within 5 seconds")
    finally:
        proc.terminate()
        proc.wait(timeout=5)
