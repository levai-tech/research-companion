import argparse
import socket

import uvicorn
from fastapi import FastAPI


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def create_app() -> FastAPI:
    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


def run(port: int) -> None:
    uvicorn.run(create_app(), host="127.0.0.1", port=port)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=find_free_port())
    args = parser.parse_args()
    run(args.port)
