"""Tests for ModeService.compile_config (pure) and mode resolution."""

from __future__ import annotations

import json

import pytest

from tests.fakes.in_memory_stores import InMemoryModeConfigStore
from workspace_backend.domain.models import SessionMode
from workspace_backend.services.mode_service import ModeService

_CONFIG = {
    "default": "general",
    "modes": {
        "general": {
            "label": "General",
            "identity": "You are General.",
            "soul": "Be helpful.",
            "settings": {"mode": "yolo", "tools": {"include": ["FileRead"]}},
            "agents_md": "Base agents. scripts at {scripts_path}.",
            "skills": {"new-doc": "Use {scripts_path}/create-doc.py in {working_dir}."},
        },
        "coder": {
            "label": "Coder",
            "identity": "You are Coder.",
            "settings": {"mode": "yolo"},
            "settings_generic": {"mode": "plan"},
            "agents_md": "Boltzbit coder.",
            "agents_md_generic": "Generic coder.",
        },
        "software_engineer": {
            "label": "Software Engineer",
            "baseMode": "coder",
            "identity": "You are a Software Engineer.",
        },
    },
}


def _service() -> ModeService:
    return ModeService(InMemoryModeConfigStore(_CONFIG))


async def test_compiles_identity_soul_settings_meta() -> None:
    compiled = await _service().compile_config("bz-1", "general", working_dir="/ws")
    assert compiled.files["IDENTITY.md"] == "# Identity\n\nYou are General.\n"
    assert compiled.files["SOUL.md"] == "Be helpful."
    settings = json.loads(compiled.files["settings.json"])
    assert settings["mode"] == "yolo"
    meta = json.loads(compiled.files["meta.json"])
    assert meta == {"sessionId": "bz-1", "workingDir": "/ws", "mode": "general", "model": ""}
    assert compiled.session_mode == SessionMode.YOLO


async def test_token_substitution_in_agents_md_and_skills() -> None:
    tokens = {"scripts_path": "/s/scripts"}
    compiled = await _service().compile_config("bz-1", "general", working_dir="/ws", tokens=tokens)
    assert "scripts at /s/scripts." in compiled.files["AGENTS.md"]
    skill = compiled.files["skills/new-doc/SKILL.md"]
    assert skill == "Use /s/scripts/create-doc.py in /ws."


async def test_boltzbit_variant_selected_by_default() -> None:
    compiled = await _service().compile_config("bz-1", "coder", working_dir="/ws")
    assert compiled.files["AGENTS.md"] == "Boltzbit coder."
    assert json.loads(compiled.files["settings.json"])["mode"] == "yolo"
    assert compiled.session_mode == SessionMode.YOLO


async def test_generic_variant_selected_for_non_boltzbit_model() -> None:
    compiled = await _service().compile_config("bz-1", "coder", working_dir="/ws", model_name="gpt-4o")
    assert compiled.files["AGENTS.md"] == "Generic coder."
    assert json.loads(compiled.files["settings.json"])["mode"] == "plan"
    assert compiled.session_mode == SessionMode.PLAN


async def test_profile_inherits_base_mode_settings() -> None:
    """A professional profile layers its identity over the base mode's settings/skills."""
    entry = await _service().resolve_entry("software_engineer")
    assert entry["identity"] == "You are a Software Engineer."  # profile wins
    assert entry["settings"] == {"mode": "yolo"}  # inherited from coder base


async def test_unknown_mode_falls_back_to_default() -> None:
    entry = await _service().resolve_entry("does-not-exist")
    assert entry["label"] == "General"


@pytest.mark.parametrize("model", ["", "boltzbit-1", "BOLTZBIT-X"])
async def test_boltzbit_prefix_detection(model: str) -> None:
    compiled = await _service().compile_config("bz-1", "coder", working_dir="/ws", model_name=model)
    assert compiled.files["AGENTS.md"] == "Boltzbit coder."
