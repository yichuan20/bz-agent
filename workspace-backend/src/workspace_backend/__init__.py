"""BoltzAgent workspace backend.

A FastAPI service that wraps the ``bzcode`` CLI agent so one server can create and
manage many agent sessions. See ``docs/08-refactor-plan-m1.md`` in the repo root for
the architecture and roadmap.
"""

# Single source of truth for the product version. Keep in sync with
# ``pyproject.toml`` and ``frontend/src/version.ts`` via ``scripts/set-version.sh``.
__version__ = "0.6.4"

from workspace_backend.config import Settings, get_settings

__all__ = ["Settings", "__version__", "get_settings"]
