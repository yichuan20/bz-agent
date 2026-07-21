"""Mode service — load agent modes and compile a mode into session config.

Splits the original 170-line ``_write_session_config`` into a **pure** compile step
(here) and an **I/O** write step (``config_writer``). :meth:`compile_config` takes a
mode name + model and returns a :class:`CompiledConfig`: the exact files to write into
the agent's config dir (IDENTITY.md, SOUL.md, AGENTS.md, settings.json, skills), plus
the asset source dirs to copy and the template tokens still needing path resolution.

Being pure, it's unit-testable without touching disk. The boltzbit-vs-generic variant
selection (based on the model name) and template-token substitution both live here.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from workspace_backend.domain.models import SessionMode
from workspace_backend.domain.ports import ModeConfigStore

_DEFAULT_MODE = "general"


@dataclass(slots=True)
class CompiledConfig:
    """The concrete config for one agent session, ready to write to disk.

    ``files`` maps config-dir-relative paths to contents (with template tokens already
    substituted). ``meta`` is our own metadata (written as ``meta.json``).
    ``session_mode`` is the bzcode runtime mode to apply via setMode.
    """

    files: dict[str, str] = field(default_factory=dict)
    meta: dict[str, Any] = field(default_factory=dict)
    session_mode: SessionMode = SessionMode.DEFAULT


class ModeService:
    """Loads mode config and compiles a mode into a :class:`CompiledConfig`."""

    def __init__(self, store: ModeConfigStore) -> None:
        self._store = store

    async def load_config(self) -> dict[str, Any]:
        """Return the raw mode config (``{"default", "modes"}``)."""
        return await self._store.load()

    async def default_mode(self) -> str:
        cfg = await self._store.load()
        return str(cfg.get("default", _DEFAULT_MODE))

    async def resolve_entry(self, mode: str) -> dict[str, Any]:
        """Return the mode entry, following ``baseMode`` and falling back to default."""
        cfg = await self._store.load()
        modes = cfg.get("modes", {})
        entry = modes.get(mode) or modes.get(cfg.get("default", _DEFAULT_MODE), {}) or {}
        # A professional profile layers identity/soul over a base mode's settings/skills.
        base = entry.get("baseMode")
        if base and base in modes:
            merged = dict(modes[base])
            merged.update(entry)  # profile's identity/soul/label win over the base
            return merged
        return entry

    async def compile_config(
        self,
        agent_id: str,
        mode: str,
        *,
        working_dir: str,
        model_name: str = "",
        tokens: dict[str, str] | None = None,
    ) -> CompiledConfig:
        """Compile ``mode`` into the files to write for ``agent_id``.

        ``model_name`` selects boltzbit vs generic asset variants (empty = boltzbit).
        ``tokens`` supplies template substitutions the service can't know
        (``scripts_path``, ``server_data_path``, ``widget_template_table``); the
        caller/config_writer fills any it can and re-resolves ``scripts_path`` after
        the real scripts dir is known.
        """
        entry = await self.resolve_entry(mode)
        is_boltzbit = not model_name or model_name.lower().startswith("boltzbit")
        subs = dict(tokens or {})
        subs.setdefault("session_dir", "")
        subs.setdefault("working_dir", working_dir)

        def resolve(text: str) -> str:
            for key, value in subs.items():
                text = text.replace("{" + key + "}", value)
            return text

        files: dict[str, str] = {}

        identity = entry.get("identity", "")
        if identity:
            files["IDENTITY.md"] = f"# Identity\n\n{identity}\n"

        soul = entry.get("soul", "")
        if soul:
            files["SOUL.md"] = soul

        agents_md = self._variant(entry, "agents_md", is_boltzbit)
        if agents_md:
            files["AGENTS.md"] = resolve(agents_md)

        settings = self._variant(entry, "settings", is_boltzbit)
        if settings:
            files["settings.json"] = json.dumps(settings, indent=2)

        skills = self._variant(entry, "skills", is_boltzbit) or {}
        for skill_name, skill_content in skills.items():
            files[f"skills/{skill_name}/SKILL.md"] = resolve(skill_content)

        meta = {"sessionId": agent_id, "workingDir": working_dir, "mode": mode, "model": model_name}
        files["meta.json"] = json.dumps(meta, indent=2)

        session_mode = self._session_mode(settings)
        return CompiledConfig(files=files, meta=meta, session_mode=session_mode)

    @staticmethod
    def _variant(entry: dict[str, Any], key: str, is_boltzbit: bool) -> Any:
        """Pick the boltzbit or ``{key}_generic`` variant, falling back to the base."""
        if is_boltzbit:
            return entry.get(key)
        return entry.get(f"{key}_generic") or entry.get(key)

    @staticmethod
    def _session_mode(settings: Any) -> SessionMode:
        if isinstance(settings, dict):
            raw = settings.get("mode", "")
            try:
                return SessionMode(raw)
            except ValueError:
                return SessionMode.DEFAULT
        return SessionMode.DEFAULT
