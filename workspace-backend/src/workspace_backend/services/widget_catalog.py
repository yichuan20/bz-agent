"""Widget catalog — the built-in widget library metadata.

Ports ``_build_widget_template_table`` from the old server: reads
``server_data/widgets/index.json`` and renders a markdown table that the widget
mode's session config embeds via the ``{widget_template_table}`` token, so the agent
knows which built-in widget templates exist.

This is the only widget-related code needed at M1 (config compilation). The full
widget/canvas subsystem — serving the ``*.js`` library, the data store, deploy —
arrives in M3.
"""

from __future__ import annotations

import json
from pathlib import Path

from workspace_backend.logging import get_logger

log = get_logger(__name__)

_UNAVAILABLE = "(template index unavailable)"


class WidgetCatalog:
    """Reads the built-in widget index and builds the template table."""

    def __init__(self, widgets_index: Path) -> None:
        self._index = widgets_index

    def template_table(self) -> str:
        """Return a markdown table of non-archived built-in widget templates."""
        try:
            data = json.loads(self._index.read_text(encoding="utf-8"))
            widgets = [w for w in data.get("widgets", []) if not w.get("archived")]
        except OSError, json.JSONDecodeError:
            log.warning("[widgets] index unavailable at %s", self._index)
            return _UNAVAILABLE

        lines = ["| Template | Matches requests like… | Default size |", "|---|---|---|"]
        for w in widgets:
            name = w.get("id", "")
            label = w.get("label", name)
            keywords = ", ".join(w.get("keywords", [])[:6])
            dw, dh = w.get("defaultW", 380), w.get("defaultH", 280)
            lines.append(f"| `{name}` | {label}: {keywords} | {dw}×{dh} |")
        return "\n".join(lines)
