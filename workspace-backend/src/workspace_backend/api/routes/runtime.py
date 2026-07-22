"""Widget runtime helper routes — proxy and web search.

These are called from inside sandboxed widget iframes via ``window.__agentHttpBase__``.
Intentionally NOT under ``/api/v1`` to preserve parity with the old backend paths.

    POST /proxy    — forward an HTTP request, resolving {{KEY}} credential placeholders
    GET  /search   — proxy a Google search via SerpAPI

Note: ``GET /shell`` is intentionally omitted for security reasons.
"""

from __future__ import annotations

import re
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from workspace_backend.api.deps import get_context
from workspace_backend.services.credential_service import CredentialService

router = APIRouter(tags=["Widget Runtime"])


# ── Proxy ──────────────────────────────────────────────────────────────────────


class ProxyBody(BaseModel):
    url: str
    method: str = "GET"
    headers: dict[str, str] = {}
    body: str | None = None


def _resolve_placeholders(text: str, creds: dict[str, str]) -> str:
    """Replace ``{{KEY}}`` patterns with stored credential values."""

    def _sub(m: re.Match[str]) -> str:
        return creds.get(m.group(1), m.group(0))

    return re.sub(r"\{\{([A-Z0-9_]+)\}\}", _sub, text)


@router.post(
    "/proxy",
    summary="Proxy an HTTP request",
    description=(
        "Forward an HTTP request to an arbitrary URL, resolving ``{{KEY}}`` credential "
        "placeholders in headers and body from stored widget secrets. Used by widgets to "
        "call external APIs without exposing credentials to the browser."
    ),
)
async def proxy(
    body: ProxyBody,
    ctx=Depends(get_context),
) -> Any:
    cred_svc: CredentialService = ctx.credential_service
    http: httpx.AsyncClient = ctx.http_client

    # Resolve credential placeholders
    raw_creds: dict[str, str] = {}
    secret_keys = (await cred_svc.list_secret_keys()) or []
    for key in secret_keys:
        val = await cred_svc.get_secret(key)
        if val:
            raw_creds[key] = val

    resolved_headers = {k: _resolve_placeholders(v, raw_creds) for k, v in body.headers.items()}
    resolved_body = _resolve_placeholders(body.body or "", raw_creds) if body.body else None

    try:
        resp = await http.request(
            method=body.method.upper(),
            url=body.url,
            headers=resolved_headers,
            content=resolved_body.encode() if resolved_body else None,
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        return resp.json()
    except Exception:
        return resp.text


# ── Search ─────────────────────────────────────────────────────────────────────


@router.get(
    "/search",
    summary="Web search via SerpAPI",
    description=(
        "Proxy a Google search query through SerpAPI. The caller must supply their own "
        "SerpAPI key; the result is passed through unchanged."
    ),
)
async def search(
    q: str = Query(..., description="Search query."),
    key: str = Query(..., description="SerpAPI API key."),
    num: int = Query(10, ge=1, le=100, description="Number of results."),
    ctx=Depends(get_context),
) -> Any:
    http: httpx.AsyncClient = ctx.http_client
    try:
        resp = await http.get(
            "https://serpapi.com/search.json",
            params={"q": q, "api_key": key, "num": str(num), "engine": "google"},
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    data = resp.json()
    results = [
        {
            "title": r.get("title", ""),
            "link": r.get("link", ""),
            "displayLink": r.get("displayed_link", ""),
            "snippet": r.get("snippet", ""),
            "position": r.get("position"),
        }
        for r in data.get("organic_results", [])
    ]
    return {"results": results, "meta": data.get("search_metadata", {})}
