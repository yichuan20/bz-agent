"""Tests for CredentialService (API key login + widget secrets)."""

from __future__ import annotations

from tests.fakes.in_memory_stores import InMemoryApiKeyStore, InMemorySecretStore
from workspace_backend.services.credential_service import CredentialService


def _service() -> CredentialService:
    return CredentialService(InMemoryApiKeyStore(), InMemorySecretStore())


async def test_api_key_absent_is_invalid() -> None:
    svc = _service()
    assert await svc.api_key_present() is False
    v = await svc.validity()
    assert v.ok is False
    assert "BZ_API_KEY" in v.reason


async def test_set_get_delete_api_key() -> None:
    svc = _service()
    await svc.set_api_key("bz_secret")
    assert await svc.get_api_key() == "bz_secret"
    assert await svc.api_key_present() is True
    assert (await svc.validity()).ok is True
    assert await svc.delete_api_key() is True
    assert await svc.get_api_key() is None
    assert await svc.delete_api_key() is False


async def test_widget_secrets_crud() -> None:
    svc = _service()
    await svc.set_secret("OPENAI_API_KEY", "sk-1")
    await svc.set_secret("WEATHER_KEY", "w-1")
    assert set(await svc.list_secret_keys()) == {"OPENAI_API_KEY", "WEATHER_KEY"}
    assert await svc.delete_secret("OPENAI_API_KEY") is True
    assert await svc.list_secret_keys() == ["WEATHER_KEY"]
    assert await svc.delete_secret("MISSING") is False


async def test_secrets_and_api_key_are_separate_stores() -> None:
    """A widget secret named BZ_API_KEY must not become the login key."""
    svc = _service()
    await svc.set_secret("BZ_API_KEY", "not-the-login")
    assert await svc.get_api_key() is None
