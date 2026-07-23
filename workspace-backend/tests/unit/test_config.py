"""Tests for configuration loading."""

from __future__ import annotations

from pathlib import Path

from workspace_backend.config import Settings


def test_defaults(monkeypatch) -> None:
    """With no env vars, settings fall back to documented defaults."""
    for var in ("BZCODE_CWD", "BZ_HOME", "BZCODE_PATH", "AGENT_IDLE_TIMEOUT", "LOG_LEVEL"):
        monkeypatch.delenv(var, raising=False)
    s = Settings(_env_file=None)
    assert s.bz_home == Path("/usr/local/boltzbit")
    assert s.bzcode_path == "bzcode"
    assert s.agent_idle_timeout == 300.0
    assert s.log_level == "INFO"


def test_reads_env(monkeypatch, tmp_path: Path) -> None:
    """Env vars override defaults, using the historical UPPER_SNAKE names."""
    home = tmp_path / "home"
    cwd = tmp_path / "ws"
    monkeypatch.setenv("BZ_HOME", str(home))
    monkeypatch.setenv("BZCODE_CWD", str(cwd))
    monkeypatch.setenv("AGENT_IDLE_TIMEOUT", "42")
    s = Settings(_env_file=None)
    assert s.bz_home == home
    assert s.bzcode_cwd == cwd
    assert s.agent_idle_timeout == 42.0


def test_subdomain_suffix(monkeypatch) -> None:
    """workspace_subdomain_suffix defaults and reads WORKSPACE_SUBDOMAIN_SUFFIX."""
    monkeypatch.delenv("WORKSPACE_SUBDOMAIN_SUFFIX", raising=False)
    assert Settings(_env_file=None).workspace_subdomain_suffix == "workspaces.boltzhub.com"
    monkeypatch.setenv("WORKSPACE_SUBDOMAIN_SUFFIX", "ws.example.com")
    assert Settings(_env_file=None).workspace_subdomain_suffix == "ws.example.com"


def test_derived_paths(tmp_path: Path) -> None:
    """sessions_dir and api_keys_file are derived from bz_home."""
    s = Settings(BZ_HOME=str(tmp_path), _env_file=None)
    assert s.sessions_dir == tmp_path / "sessions"
    assert s.api_keys_file == tmp_path / "api_keys.json"


def test_tilde_expansion(monkeypatch) -> None:
    """A ~-prefixed BZ_HOME is expanded to an absolute path."""
    s = Settings(BZ_HOME="~/bzhome", _env_file=None)
    assert s.bz_home.is_absolute()
    assert "~" not in str(s.bz_home)
