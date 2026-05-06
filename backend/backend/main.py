import argparse
import socket
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.settings import Settings


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def create_app(settings_path: Path | None = None) -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    settings = Settings(path=settings_path)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/settings")
    async def get_settings():
        return settings.get()

    @app.put("/settings")
    async def put_settings(patch: dict):
        settings.update(patch)
        return settings.get()

    @app.get("/settings/keys")
    async def get_keys():
        return settings.keys_mask()

    @app.put("/settings/keys")
    async def put_keys(body: dict):
        for name, value in body.items():
            if isinstance(value, str):
                settings.save_key(name, value)
        return {"ok": True}

    return app


def run(port: int) -> None:
    uvicorn.run(create_app(), host="127.0.0.1", port=port)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=find_free_port())
    args = parser.parse_args()
    run(args.port)
