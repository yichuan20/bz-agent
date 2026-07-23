"""Container-side reverse proxy for dev-server previews.

flowinfra's subdomain proxy forwards ``https://{wsid}-{port}.{suffix}/…`` requests to
this backend (port 18789) with an ``X-Target-Port`` header naming the in-container port
of a user's ``pnpm dev`` server. This middleware honours that header by reverse-proxying
the request to ``http://127.0.0.1:{port}`` and relaying the response.

Scope: **HTTP only**. WebSocket/HMR is intentionally not proxied — dev-server previews
use manual refresh (the frontend's ``↺ Reload`` button). When the header is absent this
middleware is a no-op pass-through, so local backend dev and normal API/SPA routing are
unaffected.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
from starlette.requests import Request
from starlette.responses import Response

from workspace_backend.logging import get_logger

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

log = get_logger(__name__)

_TARGET_PORT_HEADER = "x-target-port"

# Read timeout is generous: the first request to a just-started dev server can block
# while it compiles.
_PROXY_TIMEOUT = httpx.Timeout(60.0, connect=5.0)

# Hop-by-hop headers must not be forwarded (RFC 7230 §6.1); Host is rewritten separately.
_HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    }
)

# Response headers that httpx/Starlette recompute — relaying them corrupts the body length
# or encoding (httpx already decodes the payload).
_STRIP_RESPONSE_HEADERS = frozenset({"content-encoding", "content-length", "transfer-encoding", "connection"})


async def preview_proxy_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Reverse-proxy to ``localhost:{X-Target-Port}`` when that header is present."""
    raw_port = request.headers.get(_TARGET_PORT_HEADER)
    if raw_port is None:
        return await call_next(request)

    try:
        port = int(raw_port)
    except ValueError:
        return Response(f"invalid X-Target-Port: {raw_port!r}", status_code=400)
    if not (1 <= port <= 65535):
        return Response(f"X-Target-Port out of range: {port}", status_code=400)

    target_url = httpx.URL(
        f"http://127.0.0.1:{port}{request.url.path}",
        query=request.url.query.encode("ascii"),
    )

    # Forward request headers minus the routing header and hop-by-hop headers; rewrite Host
    # to localhost so dev servers (e.g. Vite) with host allow-listing accept the request.
    fwd_headers = [
        (k, v)
        for k, v in request.headers.raw
        if k.decode("latin-1").lower() not in _HOP_BY_HOP
        and k.decode("latin-1").lower() != _TARGET_PORT_HEADER
        and k.decode("latin-1").lower() != "host"
    ]
    fwd_headers.append((b"host", f"localhost:{port}".encode()))

    client: httpx.AsyncClient = request.app.state.ctx.http_client
    body = await request.body()

    try:
        upstream = await client.request(
            method=request.method,
            url=target_url,
            headers=fwd_headers,
            content=body,
            timeout=_PROXY_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        log.warning("preview proxy to port %d failed: %s", port, exc)
        return Response(
            f"dev server on port {port} not reachable: {exc}",
            status_code=502,
        )

    resp_headers = [
        (k, v) for k, v in upstream.headers.raw if k.decode("latin-1").lower() not in _STRIP_RESPONSE_HEADERS
    ]
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=dict((k.decode("latin-1"), v.decode("latin-1")) for k, v in resp_headers),
    )
