"""Tests for WidgetCatalog (built-in widget template table)."""

from __future__ import annotations

import json
from pathlib import Path

from workspace_backend.services.widget_catalog import WidgetCatalog


def test_builds_markdown_table(tmp_path: Path) -> None:
    index = tmp_path / "index.json"
    index.write_text(
        json.dumps(
            {
                "widgets": [
                    {"id": "clock", "label": "Clock", "keywords": ["time", "clock"], "defaultW": 200, "defaultH": 200},
                    {"id": "old", "label": "Old", "archived": True},
                ]
            }
        )
    )
    table = WidgetCatalog(index).template_table()
    assert "| Template |" in table  # header
    assert "`clock`" in table
    assert "time, clock" in table
    assert "200×200" in table
    assert "`old`" not in table  # archived excluded


def test_missing_index_is_graceful(tmp_path: Path) -> None:
    table = WidgetCatalog(tmp_path / "nope.json").template_table()
    assert table == "(template index unavailable)"


def test_real_vendored_index_loads() -> None:
    """The vendored server_data/widgets/index.json produces a non-empty table."""
    from workspace_backend.config import Settings

    index = Settings(_env_file=None).data_root / "server_data" / "widgets" / "index.json"
    if not index.exists():  # pragma: no cover - depends on vendored assets
        return
    table = WidgetCatalog(index).template_table()
    assert table != "(template index unavailable)"
    assert "`clock`" in table
