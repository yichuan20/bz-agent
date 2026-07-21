"""API request/response schemas (pydantic v2 DTOs).

Every route body — request and response — is a model here, so the generated OpenAPI
schema fully describes the wire format for FE clients and LLMs. Phase 1 covers the
system/health endpoints; agent, auth, modes, and file schemas arrive in Phase 4.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Liveness probe result — the process is up and serving."""

    status: str = Field(
        default="ok",
        description="Always 'ok' when the server is running.",
        examples=["ok"],
    )


class VersionResponse(BaseModel):
    """Backend version information."""

    backend: str = Field(description="workspace-backend version.", examples=["0.1.0"])
