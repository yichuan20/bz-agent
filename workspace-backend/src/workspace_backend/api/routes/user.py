"""Current-user identity route (from BoltzHub, via the stored BZ_API_KEY)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from workspace_backend.api.deps import get_credential_service, get_user_service
from workspace_backend.api.schemas import UserResponse
from workspace_backend.services.credential_service import CredentialService
from workspace_backend.services.user_service import UserService

router = APIRouter(prefix="/api/v1", tags=["User"])


@router.get(
    "/user",
    response_model=UserResponse,
    summary="Current user",
    description=(
        "The signed-in user's identity, resolved from BoltzHub using the stored "
        "BZ_API_KEY. Best-effort: returns `present: false` with blank fields when no "
        "key is set or BoltzHub is unreachable — the app works regardless."
    ),
)
async def get_user(
    creds: CredentialService = Depends(get_credential_service),
    users: UserService = Depends(get_user_service),
) -> UserResponse:
    api_key = await creds.get_api_key() or ""
    user = await users.current_user(api_key)
    if user is None:
        return UserResponse()
    return UserResponse(
        display_name=user.display_name,
        email=user.email,
        username=user.username,
        present=bool(user.display_name or user.username),
    )
