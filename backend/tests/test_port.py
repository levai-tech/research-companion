import socket
from backend.main import find_free_port


def test_find_free_port_returns_valid_range():
    port = find_free_port()
    assert 1024 <= port <= 65535


def test_find_free_port_is_bindable():
    port = find_free_port()
    # If the port is truly free, we can bind to it immediately
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", port))
