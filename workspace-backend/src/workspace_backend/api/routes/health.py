"""Health probe.

``GET /healthz`` — liveness: the process is up and serving. Cheap, no dependencies.
Kept unprefixed (not under ``/api/v1``) by convention so supervisors/proxies can
probe a stable path independent of the API version.
"""

from __future__ import annotations

from fastapi import APIRouter

from workspace_backend.api.schemas import HealthResponse

router = APIRouter(tags=["System"])


@router.get(
    "/healthz",
    response_model=HealthResponse,
    summary="Liveness probe",
    description="Return 200 if the process is running. Does not check dependencies.",
)
async def healthz() -> HealthResponse:
    return HealthResponse()
