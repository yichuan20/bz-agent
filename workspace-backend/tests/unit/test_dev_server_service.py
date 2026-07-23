"""Unit tests for DevServerService preview-URL construction.

The URL-branch logic is factored into ``_build_preview_url`` so it can be tested without
spawning a real dev-server subprocess.
"""

from __future__ import annotations

from workspace_backend.services.dev_server_service import _build_preview_url


def test_workspace_host_yields_public_url() -> None:
    """A workspace subdomain Host yields the public {wsid}-{port}.{suffix} URL."""
    url = _build_preview_url(3000, "ws_abc123.workspaces.boltzhub.com", "workspaces.boltzhub.com")
    assert url == "https://ws_abc123-3000.workspaces.boltzhub.com"


def test_custom_suffix() -> None:
    url = _build_preview_url(5173, "my-ws.ws.example.com", "ws.example.com")
    assert url == "https://my-ws-5173.ws.example.com"


def test_local_host_yields_localhost_url() -> None:
    """A non-workspace Host (local dev) falls back to a plain localhost URL."""
    assert _build_preview_url(4000, "localhost:18789", "workspaces.boltzhub.com") == "http://localhost:4000"


def test_empty_suffix_yields_localhost_url() -> None:
    """With no configured suffix, always fall back to localhost."""
    assert _build_preview_url(4000, "ws_abc.workspaces.boltzhub.com", "") == "http://localhost:4000"
