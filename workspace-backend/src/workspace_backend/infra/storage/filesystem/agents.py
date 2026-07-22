"""Filesystem AgentStore + TranscriptStore + TitleStore + DefaultsStore.

All four operate on the ``$BZ_HOME/sessions`` layout. They port the original
server's session parsing (``_read_session_file``), the config-dir purge in
``_write_session_config`` (the ``_OWNED_NAMES`` allowlist), and the mtime-based
asset copy. Small JSON reads run synchronously inside ``async def``; the one
potentially large read — a transcript — is offloaded to a thread.
"""

from __future__ import annotations

import asyncio
import json
import re
import shutil
from pathlib import Path
from typing import Any

from workspace_backend.domain.models import Agent
from workspace_backend.infra.storage.filesystem.paths import Paths
from workspace_backend.logging import get_logger

log = get_logger(__name__)

# Files/dirs the config dir owns; everything else (bzcode sub-agent leftovers) is
# purged on each config write so the dir reflects exactly the current mode.
_OWNED_NAMES = frozenset(
    {
        "meta.json",
        "IDENTITY.md",
        "SOUL.md",
        "AGENTS.md",
        "settings.json",
        "skills",
        "scripts",
        "templates",
        "custom_widgets",
        "widget_data",
        ".bzcanvas.json",
    }
)

# User messages that are noise, not a real title.
_SKIP_EXACT = frozenset({"Hi, hand shake, say yes", "[Request interrupted by user]"})
_SYSREM_RE = re.compile(r"<system-reminder>.*?</system-reminder>", re.DOTALL)


def _read_json(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError, json.JSONDecodeError:
        return None


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


class FsAgentStore:
    """AgentStore over ``$BZ_HOME/sessions``."""

    def __init__(self, paths: Paths, titles: FsTitleStore) -> None:
        self._paths = paths
        self._titles = titles

    def config_dir(self, agent_id: str) -> Path:
        """Return the agent's config directory ($BZ_HOME/sessions/{agent_id})."""
        return self._paths.config_dir(agent_id)

    async def get(self, agent_id: str) -> Agent | None:
        if not self._paths.meta(agent_id).exists():
            return None
        titles = await self._titles.get_all()
        return await asyncio.to_thread(self._parse_agent, agent_id, titles)

    async def list_all(self, cwd: str | None = None) -> list[Agent]:
        sessions_dir = self._paths.sessions_dir
        if not sessions_dir.exists():
            return []
        titles = await self._titles.get_all()

        def _scan() -> list[Agent]:
            agents = []
            # An agent exists once its config dir + meta.json is written (at create),
            # even before bzcode writes a transcript. Enumerate by meta.json.
            for meta_path in sessions_dir.glob("*/meta.json"):
                agent = self._parse_agent(meta_path.parent.name, titles)
                if agent is not None and (cwd is None or agent.working_dir == cwd):
                    agents.append(agent)
            agents.sort(key=lambda a: a.last_modified, reverse=True)
            return agents

        return await asyncio.to_thread(_scan)

    async def exists(self, agent_id: str) -> bool:
        return self._paths.meta(agent_id).exists()

    async def delete(self, agent_id: str) -> bool:
        """Delete the whole agent record: config dir + transcript. True if it existed."""
        cfg_dir = self._paths.config_dir(agent_id)
        transcript = self._paths.transcript(agent_id)
        existed = cfg_dir.exists() or transcript.exists()
        if cfg_dir.exists():
            shutil.rmtree(cfg_dir, ignore_errors=True)
        transcript.unlink(missing_ok=True)
        return existed

    async def read_meta(self, agent_id: str) -> dict[str, Any] | None:
        return _read_json(self._paths.meta(agent_id))

    async def write_config_files(self, agent_id: str, files: dict[str, str]) -> None:
        cfg_dir = self._paths.config_dir(agent_id)
        cfg_dir.mkdir(parents=True, exist_ok=True)
        self._purge_unowned(cfg_dir)
        # Remove owned single-files that aren't in this write (stale from a prior mode).
        for name in ("IDENTITY.md", "SOUL.md", "AGENTS.md", "settings.json"):
            if name not in files:
                (cfg_dir / name).unlink(missing_ok=True)
        # skills/ is fully rebuilt from the compiled set.
        skills_dir = cfg_dir / "skills"
        if skills_dir.exists():
            shutil.rmtree(skills_dir)
        for rel, content in files.items():
            dest = cfg_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(content, encoding="utf-8")

    async def copy_assets(self, agent_id: str, scripts_dir: str, templates_dir: str) -> str:
        # Copying can touch many files; offload the blocking I/O to a thread.
        return await asyncio.to_thread(self._copy_assets_sync, agent_id, scripts_dir, templates_dir)

    def _copy_assets_sync(self, agent_id: str, scripts_dir: str, templates_dir: str) -> str:
        cfg_dir = self._paths.config_dir(agent_id)
        dst_scripts = cfg_dir / "scripts"
        dst_scripts.mkdir(parents=True, exist_ok=True)
        src_scripts = Path(scripts_dir)
        if src_scripts.is_dir():
            for script in src_scripts.glob("*.py"):
                dest = dst_scripts / script.name
                if not dest.exists() or script.stat().st_mtime > dest.stat().st_mtime:
                    shutil.copy2(script, dest)
        else:
            log.warning("[storage] scripts dir not found: %s", src_scripts)

        src_templates = Path(templates_dir)
        if src_templates.is_dir():
            dst_templates = cfg_dir / "templates"
            if dst_templates.exists():
                shutil.rmtree(dst_templates)
            shutil.copytree(src_templates, dst_templates)
        else:
            log.warning("[storage] templates dir not found: %s", src_templates)
        return str(dst_scripts)

    # ── internals ────────────────────────────────────────────────────────────

    def _purge_unowned(self, cfg_dir: Path) -> None:
        for item in cfg_dir.iterdir():
            if item.name in _OWNED_NAMES:
                continue
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            else:
                item.unlink(missing_ok=True)

    def _parse_agent(self, agent_id: str, titles: dict[str, str]) -> Agent | None:
        """Build an :class:`Agent` from meta.json, merging transcript data if present.

        ``meta.json`` (written at create) is the durable record. The transcript
        (written by bzcode once a turn runs) is optional — when it exists we derive
        the title, message count, last message, and mtime from it. Returns ``None`` if
        no working dir can be determined.
        """
        meta = _read_json(self._paths.meta(agent_id)) or {}
        working_dir = meta.get("workingDir", "")

        title = ""
        last_preview = ""
        msg_count = 0
        created = ""
        last_modified = 0.0

        transcript = self._paths.transcript(agent_id)
        if transcript.exists():
            try:
                lines = [ln.strip() for ln in transcript.read_text(encoding="utf-8").splitlines() if ln.strip()]
            except OSError:
                lines = []
            msg_lines = lines
            if lines:
                # Old format: first line is a session header (workingDir/created).
                try:
                    first = json.loads(lines[0])
                except json.JSONDecodeError:
                    first = {}
                if first.get("type") == "session":
                    working_dir = working_dir or first.get("workingDir", "")
                    created = first.get("created", "")
                    msg_lines = lines[1:]
                title, last_preview, msg_count = self._extract_title(msg_lines)
            try:
                last_modified = transcript.stat().st_mtime
            except OSError:
                pass
        else:
            # No transcript yet — fall back to the config dir's mtime for ordering.
            try:
                last_modified = self._paths.config_dir(agent_id).stat().st_mtime
            except OSError:
                pass

        if not working_dir:
            return None

        return Agent(
            id=agent_id,
            working_dir=working_dir,
            mode=meta.get("mode", "general"),
            model=meta.get("model", ""),
            title=titles.get(agent_id) or title or "(empty)",
            message_count=msg_count,
            last_message=last_preview,
            created_at=created,
            last_modified=last_modified,
        )

    def _extract_title(self, msg_lines: list[str]) -> tuple[str, str, int]:
        title = ""
        last_preview = ""
        msg_count = 0
        for line in msg_lines:
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if msg.get("role") != "user":
                continue
            msg_count += 1
            content = msg.get("content", "")
            text = ""
            if isinstance(content, str):
                text = content
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text = block.get("text", "")
                        break
            clean = _SYSREM_RE.sub("", text).strip()
            if clean and clean not in _SKIP_EXACT:
                if not title:
                    title = clean[:60]
                last_preview = clean[:150]
        return title, last_preview, msg_count


class FsTranscriptStore:
    """TranscriptStore over ``$BZ_HOME/sessions``."""

    def __init__(self, paths: Paths) -> None:
        self._paths = paths

    async def load_transcript(self, agent_id: str) -> list[dict[str, Any]]:
        transcript = self._paths.transcript(agent_id)
        if not transcript.exists():
            return []
        return await asyncio.to_thread(self._read, transcript)

    def _read(self, transcript: Path) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        try:
            for line in transcript.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                entry.pop("timestamp", None)
                if entry.get("type") == "session":
                    continue
                messages.append(entry)
        except OSError:
            return []
        return messages


class FsTitleStore:
    """TitleStore backed by a single JSON file."""

    def __init__(self, paths: Paths) -> None:
        self._paths = paths

    async def get_all(self) -> dict[str, str]:
        return _read_json(self._paths.titles_file) or {}

    async def set(self, agent_id: str, title: str) -> None:
        titles = await self.get_all()
        titles[agent_id] = title
        _write_json(self._paths.titles_file, titles)


class FsDefaultsStore:
    """DefaultsStore backed by a single JSON file (cwd → agent id)."""

    def __init__(self, paths: Paths) -> None:
        self._paths = paths

    async def get_all(self) -> dict[str, str]:
        return _read_json(self._paths.defaults_file) or {}

    async def set(self, cwd: str, agent_id: str) -> None:
        defaults = await self.get_all()
        defaults[cwd] = agent_id
        _write_json(self._paths.defaults_file, defaults)

    async def clear(self, cwd: str) -> None:
        defaults = await self.get_all()
        if defaults.pop(cwd, None) is not None:
            _write_json(self._paths.defaults_file, defaults)
