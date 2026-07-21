"""Integration test: ConfigWriter against the real filesystem AgentStore.

Verifies the full compile → copy assets → resolve {scripts_path} → write path,
including the config-dir purge of non-owned files and boltzbit/generic variant copy.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest_asyncio

from workspace_backend.infra.storage.filesystem.agents import FsAgentStore, FsTitleStore
from workspace_backend.infra.storage.filesystem.modes import FsModeConfigStore
from workspace_backend.infra.storage.filesystem.paths import Paths
from workspace_backend.services.config_writer import ConfigWriter
from workspace_backend.services.mode_service import ModeService

_MODES = {
    "default": "general",
    "modes": {
        "general": {
            "label": "General",
            "identity": "You are General.",
            "soul": "Be helpful.",
            "settings": {"mode": "yolo"},
            "agents_md": "Scripts live at {scripts_path}. Data at {server_data_path}.",
            "skills": {"new-doc": "Run {scripts_path}/create-doc.py"},
        }
    },
}


@pytest_asyncio.fixture
def writer(tmp_path: Path) -> ConfigWriter:
    bz_home = tmp_path / "bzhome"
    server_data = tmp_path / "server_data"
    server_data.mkdir(parents=True)
    paths = Paths(bz_home=bz_home, server_data=server_data)

    # Asset source tree with one script and one template.
    assets = tmp_path / "assets"
    (assets / "scripts").mkdir(parents=True)
    (assets / "scripts" / "create-doc.py").write_text("# script\n")
    (assets / "templates").mkdir(parents=True)
    (assets / "templates" / "report.md").write_text("# report\n")

    modes_file = tmp_path / "agent_modes.json"
    modes_file.write_text(json.dumps(_MODES))

    agent_store = FsAgentStore(paths, FsTitleStore(paths))
    mode_service = ModeService(FsModeConfigStore(modes_file))
    return ConfigWriter(
        mode_service,
        agent_store,
        assets_root=assets,
        server_data_dir=server_data,
        widget_table_provider=lambda: "TABLE",
    )


async def test_writes_config_files(writer: ConfigWriter, tmp_path: Path) -> None:
    await writer.write("bz-1", "general", working_dir="/ws")
    cfg = tmp_path / "bzhome" / "sessions" / "bz-1"
    assert (cfg / "IDENTITY.md").read_text() == "# Identity\n\nYou are General.\n"
    assert (cfg / "SOUL.md").read_text() == "Be helpful."
    assert json.loads((cfg / "settings.json").read_text())["mode"] == "yolo"
    meta = json.loads((cfg / "meta.json").read_text())
    assert meta["sessionId"] == "bz-1"
    assert meta["mode"] == "general"


async def test_resolves_scripts_path_to_copied_dir(writer: ConfigWriter, tmp_path: Path) -> None:
    await writer.write("bz-1", "general", working_dir="/ws")
    cfg = tmp_path / "bzhome" / "sessions" / "bz-1"
    agents_md = (cfg / "AGENTS.md").read_text()
    # {scripts_path} resolves to the session-local copied scripts dir.
    assert str(cfg / "scripts") in agents_md
    assert str(tmp_path / "server_data") in agents_md
    skill = (cfg / "skills" / "new-doc" / "SKILL.md").read_text()
    assert str(cfg / "scripts") in skill


async def test_copies_scripts_and_templates(writer: ConfigWriter, tmp_path: Path) -> None:
    await writer.write("bz-1", "general", working_dir="/ws")
    cfg = tmp_path / "bzhome" / "sessions" / "bz-1"
    assert (cfg / "scripts" / "create-doc.py").exists()
    assert (cfg / "templates" / "report.md").exists()


async def test_purges_non_owned_files_but_keeps_owned(writer: ConfigWriter, tmp_path: Path) -> None:
    cfg = tmp_path / "bzhome" / "sessions" / "bz-1"
    cfg.mkdir(parents=True)
    # A bzcode sub-agent leftover (not owned) + an owned canvas file.
    (cfg / "cozy-comet.jsonl").write_text("leftover")
    (cfg / ".bzcanvas.json").write_text("{}")
    await writer.write("bz-1", "general", working_dir="/ws")
    assert not (cfg / "cozy-comet.jsonl").exists()  # purged
    assert (cfg / ".bzcanvas.json").exists()  # owned → kept
