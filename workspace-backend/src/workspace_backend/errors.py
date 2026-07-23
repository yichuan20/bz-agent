"""Domain exceptions.

Business logic raises these instead of ``fastapi.HTTPException`` so services stay
framework-agnostic. The API layer maps each to an HTTP status in one place
(``app.py`` exception handlers).
"""

from __future__ import annotations


class WorkspaceBackendError(Exception):
    """Base class for all domain errors."""


class AgentNotFound(WorkspaceBackendError):
    """No durable agent record exists for the given id."""


class AgentRuntimeNotLive(WorkspaceBackendError):
    """The agent exists but has no live runtime (never connected, or reaped)."""


class AgentDead(WorkspaceBackendError):
    """The agent's bzcode process has exited and cannot serve requests."""


class ProbeSessionRejected(WorkspaceBackendError):
    """A ``bz-probe-*`` id was passed where a real agent is required.

    Probe sessions are health-check throwaways and must never enter the pool.
    """


class CredentialsMissing(WorkspaceBackendError):
    """No ``BZ_API_KEY`` is configured, so bzcode cannot be spawned."""


class BzcodeNotFound(WorkspaceBackendError):
    """The bzcode binary is not on PATH / not executable."""


class InvalidPath(WorkspaceBackendError):
    """A file/path argument failed validation (traversal, missing, wrong type)."""
