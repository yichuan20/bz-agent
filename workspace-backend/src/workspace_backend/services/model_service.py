"""Model service — the list of available models, cached.

Fetches the model catalog from the BoltzBit API (via the shared httpx client) and
caches it with a short TTL. Ported from the original ``/api/models`` handler. The
"current model for an agent" comes from the agent's ``meta.json`` (read via the
AgentStore), not from here.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import httpx

from workspace_backend.logging import get_logger

log = get_logger(__name__)

_MODELS_URL = "https://flow.boltzbit.com/bz-api/v1/ai/models"
_CACHE_TTL = 300.0  # seconds
_TIMEOUT = 8.0


@dataclass(frozen=True, slots=True)
class Model:
    """An available model."""

    id: str
    display_name: str


class ModelService:
    """Fetches and caches the available-model list."""

    def __init__(self, client: httpx.AsyncClient, *, now: Callable[[], float]) -> None:
        self._client = client
        self._now = now
        self._cache: list[Model] = []
        self._cache_ts: float = 0.0

    async def list_models(self, api_key: str) -> list[Model]:
        """Return the model catalog, using the cache when fresh. Empty if no key."""
        if not api_key:
            return []
        now = self._now()
        if self._cache and (now - self._cache_ts) < _CACHE_TTL:
            return self._cache
        try:
            resp = await self._client.get(_MODELS_URL, headers={"x-api-key": api_key}, timeout=_TIMEOUT)
        except httpx.HTTPError as exc:
            log.warning("[models] fetch failed: %s", exc)
            return self._cache
        if resp.status_code != 200:
            log.warning("[models] fetch returned %s", resp.status_code)
            return self._cache
        data = resp.json()
        self._cache = [
            Model(id=m["codename"], display_name=m["displayName"])
            for m in data
            if m.get("codename") and m.get("displayName")
        ]
        self._cache_ts = now
        return self._cache
