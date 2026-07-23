"""User service — the current user's identity, from BoltzHub.

Ports the original ``/api/user/me`` handler: fetch the signed-in user's display
name/email from BoltzHub using the stored ``BZ_API_KEY``. Best-effort and cached
with a short TTL — the sidebar shows the name/avatar, but the app works without it.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import httpx

from workspace_backend.logging import get_logger

log = get_logger(__name__)

_ME_URL = "https://boltzhub.com/bz-appstore-api/v1/users/me"
_CACHE_TTL = 300.0  # seconds
_TIMEOUT = 8.0


@dataclass(frozen=True, slots=True)
class User:
    """The current user's identity (empty fields when unknown)."""

    display_name: str
    email: str
    username: str


class UserService:
    """Fetches and caches the current user's identity from BoltzHub."""

    def __init__(self, client: httpx.AsyncClient, *, now: Callable[[], float]) -> None:
        self._client = client
        self._now = now
        self._cache: User | None = None
        self._cache_ts: float = 0.0

    async def current_user(self, api_key: str) -> User | None:
        """Return the current user, or None if there's no key / it can't be fetched."""
        if not api_key:
            return None
        now = self._now()
        if self._cache and (now - self._cache_ts) < _CACHE_TTL:
            return self._cache
        try:
            resp = await self._client.get(_ME_URL, headers={"X-API-Key": api_key}, timeout=_TIMEOUT)
        except httpx.HTTPError as exc:
            log.warning("[user] fetch failed: %s", exc)
            return self._cache
        if resp.status_code != 200:
            log.warning("[user] fetch returned %s", resp.status_code)
            return self._cache
        body = resp.json()
        user = User(
            display_name=body.get("displayName") or body.get("username") or "",
            email=body.get("email") or "",
            username=body.get("username") or "",
        )
        self._cache = user
        self._cache_ts = now
        return user
