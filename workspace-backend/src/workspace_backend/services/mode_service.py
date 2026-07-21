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

import httpx

from workspace_backend.domain.models import SessionMode
from workspace_backend.domain.ports import ModeConfigStore
from workspace_backend.logging import get_logger

log = get_logger(__name__)

_DEFAULT_MODE = "general"

# The four base modes the classifier routes into.
_CLASSIFY_MODES = ("general", "widget", "worker", "coder")
_CLASSIFY_URL = "https://flow.boltzbit.com/bz-api/v1/ai/messages"
_CLASSIFY_MODEL = "anthropic-claude-4.5-sonnet"
_CLASSIFY_SYSTEM = """\
You are a routing classifier for an AI agent. Given the user request, output the \
single best mode id.

Modes — pick the most specific match, use "general" only as a last resort:

widget  → building something visual and interactive: a clock, timer, calculator,
          to-do list, game, chart, form, canvas mini-app, or any self-contained UI
worker  → file or document tasks: create/edit Excel, CSV, PDF, Word; extract,
          compare, or summarise document content; data processing or automation
coder   → software development on an existing project: write, debug, refactor code;
          build APIs, backends, CLIs, services, or deploy applications
general → everything else: open-ended questions, explanations, research, writing

Reply with ONLY one word: widget, worker, coder, or general.\
"""


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

    def __init__(self, store: ModeConfigStore, http_client: httpx.AsyncClient | None = None) -> None:
        self._store = store
        self._http = http_client

    async def load_config(self) -> dict[str, Any]:
        """Return the raw mode config (``{"default", "modes"}``)."""
        return await self._store.load()

    async def default_mode(self) -> str:
        cfg = await self._store.load()
        return str(cfg.get("default", _DEFAULT_MODE))

    async def session_mode_for(self, mode: str) -> SessionMode:
        """Return the bzcode runtime mode (yolo/plan/default) a mode's settings imply."""
        entry = await self.resolve_entry(mode)
        return self._session_mode(entry.get("settings"))

    async def classify(self, message: str, api_key: str) -> str:
        """Classify a free-text request into one of the four base modes.

        Falls back to ``"general"`` on empty input, no key, or any API failure —
        classification is a convenience, never a hard dependency.
        """
        message = message.strip()
        if not message or not api_key or self._http is None:
            return _DEFAULT_MODE
        payload = {
            "model": _CLASSIFY_MODEL,
            "messages": [{"role": "user", "content": message}],
            "stream": False,
            "system": _CLASSIFY_SYSTEM,
            "genOptions": {"maxTokens": 10, "temperature": 0},
        }
        try:
            resp = await self._http.post(
                _CLASSIFY_URL,
                headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
                json=payload,
                timeout=10.0,
            )
        except httpx.HTTPError as exc:
            log.warning("[classify] request failed: %s", exc)
            return _DEFAULT_MODE
        if resp.status_code != 200:
            return _DEFAULT_MODE
        text = ""
        for block in resp.json().get("content", []):
            if block.get("type") == "text":
                text = block.get("text", "").strip().lower()
                break
        return text if text in _CLASSIFY_MODES else _DEFAULT_MODE

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
