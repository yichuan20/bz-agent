"""Integration tests for the container-side dev-server preview proxy.

The ``preview_proxy_middleware`` reverse-proxies any request carrying an ``X-Target-Port``
header to ``localhost:{port}``; without the header it's a pass-through, so normal API/SPA
routing is unaffected.
"""

from __future__ import annotations

import socket
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, HTTPServer

import httpx
import pytest


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]  # type: ignore[no-any-return]


class _EchoHandler(BaseHTTPRequestHandler):
    """A tiny upstream that echoes the path and Host it received."""

    def do_GET(self) -> None:  # noqa: N802
        body = f"upstream-ok path={self.path} host={self.headers.get('host')}".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: object) -> None:  # silence test noise
        pass


@pytest.fixture
def upstream() -> Iterator[int]:
    """A background HTTP server standing in for a user's dev server."""
    port = _free_port()
    server = HTTPServer(("127.0.0.1", port), _EchoHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield port
    finally:
        server.shutdown()
        server.server_close()


async def test_proxies_to_target_port(client: httpx.AsyncClient, upstream: int) -> None:
    """With X-Target-Port set, the request is reverse-proxied to that local port."""
    resp = await client.get("/some/path", headers={"X-Target-Port": str(upstream)})
    assert resp.status_code == 200
    assert "upstream-ok" in resp.text
    assert "path=/some/path" in resp.text
    # Host is rewritten to localhost:{port} so dev-server host allow-listing accepts it.
    assert f"host=localhost:{upstream}" in resp.text


async def test_no_header_passes_through_to_api(client: httpx.AsyncClient) -> None:
    """Without the header, normal API routing is untouched."""
    assert (await client.get("/api/v1/version")).status_code == 200


async def test_unreachable_port_returns_502(client: httpx.AsyncClient) -> None:
    """A closed target port yields a 502, not a hang or a 500."""
    dead = _free_port()  # nothing listening here
    resp = await client.get("/", headers={"X-Target-Port": str(dead)})
    assert resp.status_code == 502


async def test_invalid_port_returns_400(client: httpx.AsyncClient) -> None:
    assert (await client.get("/", headers={"X-Target-Port": "not-a-number"})).status_code == 400
    assert (await client.get("/", headers={"X-Target-Port": "0"})).status_code == 400
    assert (await client.get("/", headers={"X-Target-Port": "99999"})).status_code == 400
