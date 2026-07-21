"""On-disk path layout resolution.

Centralizes where things live under ``$BZ_HOME`` so the stores don't each hardcode
the bzcode directory structure. ``sessions`` is bzcode's own vocabulary (it resumes by
``--resume <sessionId>`` and writes ``sessions/{id}.jsonl``), so it survives here at
the storage boundary even though the public API calls these "agents".
"""

from __future__ import annotations

from pathlib import Path


class Paths:
    """Resolves BZ_HOME-relative paths for the filesystem stores."""

    def __init__(self, bz_home: Path, server_data: Path) -> None:
        self.bz_home = bz_home
        self.server_data = server_data

    @property
    def sessions_dir(self) -> Path:
        """Directory of session transcripts and per-session config dirs."""
        return self.bz_home / "sessions"

    def transcript(self, agent_id: str) -> Path:
        """The ``.jsonl`` conversation transcript for an agent."""
        return self.sessions_dir / f"{agent_id}.jsonl"

    def config_dir(self, agent_id: str) -> Path:
        """The per-agent config directory (IDENTITY.md, SOUL.md, meta.json, …)."""
        return self.sessions_dir / agent_id

    def meta(self, agent_id: str) -> Path:
        """Our own metadata file for an agent (sessionId, workingDir, mode, model)."""
        return self.config_dir(agent_id) / "meta.json"

    @property
    def api_keys_file(self) -> Path:
        """Stores the ``BZ_API_KEY`` login credential."""
        return self.bz_home / "api_keys.json"

    @property
    def titles_file(self) -> Path:
        """User-assigned session titles, keyed by agent id."""
        return self.bz_home / "session_titles.json"

    @property
    def defaults_file(self) -> Path:
        """Default agent id per working directory."""
        return self.bz_home / "session_defaults.json"

    @property
    def secrets_file(self) -> Path:
        """Widget secret placeholders (server_data/credentials.json)."""
        return self.server_data / "credentials.json"
