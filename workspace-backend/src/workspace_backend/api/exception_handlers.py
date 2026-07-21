"""Map domain exceptions to HTTP responses.

Services raise framework-free exceptions from ``workspace_backend.errors``; this is
the one place they become HTTP status codes, so routes and services never construct
``HTTPException`` themselves. Registered on the app in ``app.py``.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from workspace_backend.errors import (
    AgentDead,
    AgentNotFound,
    AgentRuntimeNotLive,
    BzcodeNotFound,
    CredentialsMissing,
    InvalidPath,
    ProbeSessionRejected,
    WorkspaceBackendError,
)

# Each domain error → (HTTP status, stable error code for clients).
_STATUS: dict[type[WorkspaceBackendError], tuple[int, str]] = {
    AgentNotFound: (404, "agent_not_found"),
    AgentRuntimeNotLive: (409, "agent_not_live"),
    AgentDead: (410, "agent_dead"),
    ProbeSessionRejected: (400, "probe_rejected"),
    CredentialsMissing: (401, "credentials_missing"),
    BzcodeNotFound: (500, "bzcode_not_found"),
    InvalidPath: (400, "invalid_path"),
}


def register_exception_handlers(app: FastAPI) -> None:
    """Attach a handler that renders domain errors as ``{error, detail}`` JSON."""

    @app.exception_handler(WorkspaceBackendError)
    async def _handle(_request: Request, exc: WorkspaceBackendError) -> JSONResponse:
        status, code = _STATUS.get(type(exc), (500, "internal_error"))
        return JSONResponse(status_code=status, content={"error": code, "detail": str(exc)})
