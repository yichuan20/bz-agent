"""BoltzAgent workspace backend.

A FastAPI service that wraps the ``bzcode`` CLI agent so one server can create and
manage many agent sessions. See ``docs/08-refactor-plan-m1.md`` in the repo root for
the architecture and roadmap.
"""

from workspace_backend.config import Settings, get_settings

__all__ = ["Settings", "get_settings"]
