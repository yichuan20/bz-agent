"""Auth + secrets routes.

- ``/api/v1/auth/api-key`` — the BZ_API_KEY login credential (get status / set / delete).
  Setting it flushes the pool so live agents restart with the new key.
- ``/api/v1/secrets`` — widget secret placeholders (e.g. ``OPENAI_API_KEY``), a
  separate store from the login key, substituted into widget code in a later milestone.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from workspace_backend.api.deps import get_credential_service, get_pool
from workspace_backend.api.schemas import (
    ApiKeyStatusResponse,
    OkResponse,
    SecretKeysResponse,
    SetApiKeyRequest,
    SetSecretRequest,
)
from workspace_backend.services.agent_pool.pool import AgentPool
from workspace_backend.services.credential_service import CredentialService

router = APIRouter(prefix="/api/v1", tags=["Auth"])


@router.get(
    "/auth/api-key",
    response_model=ApiKeyStatusResponse,
    summary="API key status",
    description="Return whether a BZ_API_KEY login credential is configured.",
)
async def api_key_status(creds: CredentialService = Depends(get_credential_service)) -> ApiKeyStatusResponse:
    return ApiKeyStatusResponse(present=await creds.api_key_present())


@router.put(
    "/auth/api-key",
    response_model=OkResponse,
    summary="Set API key",
    description=(
        "Store the BZ_API_KEY used to authenticate bzcode. This is the login. Setting a "
        "new key flushes all live agent runtimes so they restart with it."
    ),
)
async def set_api_key(
    body: SetApiKeyRequest,
    creds: CredentialService = Depends(get_credential_service),
    pool: AgentPool = Depends(get_pool),
) -> OkResponse:
    await creds.set_api_key(body.value)
    await pool.flush_all(reason="api_key_reset")
    return OkResponse()


@router.delete(
    "/auth/api-key",
    response_model=OkResponse,
    summary="Delete API key",
    description="Remove the stored BZ_API_KEY (logout) and flush live runtimes.",
)
async def delete_api_key(
    creds: CredentialService = Depends(get_credential_service),
    pool: AgentPool = Depends(get_pool),
) -> OkResponse:
    await creds.delete_api_key()
    await pool.flush_all(reason="api_key_cleared")
    return OkResponse()


@router.get(
    "/secrets",
    response_model=SecretKeysResponse,
    summary="List widget secrets",
    description="Return the names of stored widget secret placeholders (never the values).",
)
async def list_secrets(creds: CredentialService = Depends(get_credential_service)) -> SecretKeysResponse:
    return SecretKeysResponse(keys=await creds.list_secret_keys())


@router.put(
    "/secrets",
    response_model=OkResponse,
    summary="Set a widget secret",
    description="Store or update a widget secret placeholder value (referenced as {{KEY}} in widgets).",
)
async def set_secret(
    body: SetSecretRequest,
    creds: CredentialService = Depends(get_credential_service),
) -> OkResponse:
    await creds.set_secret(body.key, body.value)
    return OkResponse()


@router.get(
    "/secrets/{key}",
    summary="Get a widget secret value",
    description=(
        "Return the stored value for a widget secret. Used by bzcode_assets scripts "
        "(bzapp-anksy, bzapp-dynas, bzapp-dpyes) to retrieve third-party API keys at runtime."
    ),
)
async def get_secret(
    key: str,
    creds: CredentialService = Depends(get_credential_service),
) -> dict[str, str | None]:
    value = await creds.get_secret(key)
    if value is None:
        from fastapi import HTTPException  # noqa: PLC0415

        raise HTTPException(status_code=404, detail=f"Secret '{key}' not found.")
    return {"key": key, "value": value}


@router.delete(
    "/secrets/{key}",
    response_model=OkResponse,
    summary="Delete a widget secret",
    description="Remove a stored widget secret placeholder.",
)
async def delete_secret(
    key: str,
    creds: CredentialService = Depends(get_credential_service),
) -> OkResponse:
    await creds.delete_secret(key)
    return OkResponse()
