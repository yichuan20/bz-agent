"""Credential service — BZ_API_KEY login + widget secret placeholders.

Two distinct concerns behind two ports:

* **Login** (``ApiKeyStore``): the ``BZ_API_KEY`` bzcode authenticates with. Auth in
  this backend is API-key only, so the validity check is simply "is a key present"
  (the original OAuth ``credentials.json`` flow is dropped in M1).
* **Widget secrets** (``SecretStore``): placeholders like ``OPENAI_API_KEY`` that get
  substituted into widget code — unrelated to bzcode login.
"""

from __future__ import annotations

from dataclasses import dataclass

from workspace_backend.domain.ports import ApiKeyStore, SecretStore


@dataclass(frozen=True, slots=True)
class Validity:
    """Result of a credential check."""

    ok: bool
    reason: str = ""


class CredentialService:
    """Manages the BZ_API_KEY login and the widget-secret store."""

    def __init__(self, api_keys: ApiKeyStore, secrets: SecretStore) -> None:
        self._api_keys = api_keys
        self._secrets = secrets

    # ── login (BZ_API_KEY) ───────────────────────────────────────────────────

    async def get_api_key(self) -> str | None:
        return await self._api_keys.get_api_key()

    async def set_api_key(self, value: str) -> None:
        await self._api_keys.set_api_key(value)

    async def delete_api_key(self) -> bool:
        return await self._api_keys.delete_api_key()

    async def api_key_present(self) -> bool:
        return await self._api_keys.get_api_key() is not None

    async def validity(self) -> Validity:
        """Whether the backend can spawn bzcode (i.e. a BZ_API_KEY is configured)."""
        if await self.api_key_present():
            return Validity(ok=True)
        return Validity(ok=False, reason="no BZ_API_KEY configured")

    # ── widget secrets ───────────────────────────────────────────────────────

    async def list_secret_keys(self) -> list[str]:
        return await self._secrets.list_keys()

    async def set_secret(self, key: str, value: str) -> None:
        await self._secrets.set_secret(key, value)

    async def delete_secret(self, key: str) -> bool:
        return await self._secrets.delete_secret(key)
