"""Application configuration.

All runtime configuration is read from environment variables (or a ``.env`` file)
via ``pydantic-settings``. The names mirror the original server's env vars so an
existing deployment can point at the new backend without relearning them.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Default bzcode home when BZ_HOME is unset — matches the original server and the
# deploy convention (DEPLOY.md).
_DEFAULT_BZ_HOME = Path("/usr/local/boltzbit")


class Settings(BaseSettings):
    """Runtime settings, populated from the environment.

    Field names are lower_snake_case; each maps to the historical UPPER_SNAKE env
    var via ``alias`` so ops keeps using the same variable names.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    # Default working directory for agent sessions (must be writable by the service
    # user). Passed as the bzcode subprocess ``cwd``, not as an env var to bzcode.
    bzcode_cwd: Path = Field(default_factory=Path.cwd, alias="BZCODE_CWD")

    # bzcode home — stores credentials, api keys, and session transcripts/config.
    bz_home: Path = Field(default=_DEFAULT_BZ_HOME, alias="BZ_HOME")

    # Path to (or name of) the bzcode binary. Resolved against PATH at spawn time.
    bzcode_path: str = Field(default="bzcode", alias="BZCODE_PATH")

    # Directory holding agent_modes.json, bzcode_assets/, and server_data/. Defaults
    # to the workspace-backend package root (where those assets are vendored); override
    # in deployment (e.g. /opt/boltzagent).
    data_root: Path = Field(
        default=Path(__file__).resolve().parents[2],
        alias="BZ_DATA_ROOT",
    )

    # Seconds an idle (no-client) agent runtime lives before the sweeper reaps it.
    agent_idle_timeout: float = Field(default=300.0, alias="AGENT_IDLE_TIMEOUT")

    # Logging level name (DEBUG/INFO/WARNING/ERROR).
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    @field_validator("bzcode_cwd", "bz_home", "data_root", mode="before")
    @classmethod
    def _expand(cls, v: object) -> object:
        """Expand ``~`` and env vars in path settings so ``BZ_HOME=~/x`` works."""
        if isinstance(v, str):
            return Path(os.path.expandvars(v)).expanduser()
        return v

    @property
    def sessions_dir(self) -> Path:
        """Directory holding bzcode session transcripts and per-session config."""
        return self.bz_home / "sessions"

    @property
    def api_keys_file(self) -> Path:
        """File storing ``BZ_API_KEY`` (the login credential)."""
        return self.bz_home / "api_keys.json"


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings singleton (cached)."""
    return Settings()
