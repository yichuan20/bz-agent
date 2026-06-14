#!/usr/bin/env python3
"""
create-widget.py — deploy a canvas widget onto the canvas.

The project root is derived from this script's own location:
  {project}/bzcode/scripts/create-widget.py  →  project root = ../..

Two modes:

  # Built-in template (no code writing needed):
  python3 bzcode/scripts/create-widget.py --title "Clock" --template clock

  # Custom code (.pending.js written by agent first):
  python3 bzcode/scripts/create-widget.py --title "My Widget"

The script:
  - Resolves the JS source (built-in template or .pending.js)
  - Generates a unique canvas ID
  - Copies/moves the JS to server_data/custom_widgets/{canvasId}.js
  - Seeds an empty data file at server_data/widget_data/{canvasId}.json
  - Appends the widget entry to .bzcanvas.json (auto-placed below existing widgets)
  - Prints JSON: {"canvasId": "...", "x": 0, "y": 0, "w": 380, "h": 280}
"""
import argparse
import json
import secrets
import shutil
import sys
from pathlib import Path

# Script lives at {bz-agent}/bzcode/scripts/create-widget.py
_SCRIPT_ROOT = Path(__file__).resolve().parent.parent.parent  # bz-agent dir (widgets templates live here)


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy a canvas widget")
    parser.add_argument("--title",    required=True,  help="Widget display title")
    parser.add_argument("--template", default=None,   help="Built-in template name (e.g. clock, bar, pie).")
    parser.add_argument("--w",        type=int, default=380, help="Width in pixels")
    parser.add_argument("--h",        type=int, default=280, help="Height in pixels")
    parser.add_argument("--cwd",      default=None,
                        help="Project working directory. Defaults to bz-agent root (for backwards compat).")
    args = parser.parse_args()

    # Canvas layout lives in the project dir (per-project).
    # Widget code/data always live in bz-agent server_data (where the HTTP server reads them).
    PROJECT_ROOT = Path(args.cwd).resolve() if args.cwd else _SCRIPT_ROOT
    CANVAS_FILE  = PROJECT_ROOT / ".bzcanvas.json"

    # Widget assets — always bz-agent's server_data, never the project dir
    WIDGETS_DIR  = _SCRIPT_ROOT / "server_data" / "widgets"
    CUSTOM_DIR   = _SCRIPT_ROOT / "server_data" / "custom_widgets"
    DATA_DIR     = _SCRIPT_ROOT / "server_data" / "widget_data"
    PENDING_FILE = CUSTOM_DIR / ".pending.js"

    # Resolve JS source
    if args.template:
        name = args.template if args.template.endswith(".js") else f"{args.template}.js"
        source = WIDGETS_DIR / name
        if not source.exists():
            print(f"ERROR: Template not found: {source}", file=sys.stderr)
            sys.exit(1)
    else:
        source = PENDING_FILE
        if not source.exists():
            print(
                f"ERROR: No pending widget at {source}\n"
                "Either pass --template <name> to use a built-in, "
                "or write the widget JS to that path first.",
                file=sys.stderr,
            )
            sys.exit(1)

    canvas_id = "cw-" + secrets.token_hex(6)
    CUSTOM_DIR.mkdir(parents=True, exist_ok=True)
    code_dest = CUSTOM_DIR / f"{canvas_id}.js"

    if args.template:
        shutil.copy2(source, code_dest)
    else:
        source.rename(code_dest)

    # Seed empty widget data store
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / f"{canvas_id}.json").write_text(json.dumps([]), encoding="utf-8")

    # Append to canvas layout, placed below existing widgets
    pad = 24
    canvas_data: dict = {"version": 1, "widgets": []}
    if CANVAS_FILE.exists():
        try:
            canvas_data = json.loads(CANVAS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass

    existing = canvas_data.get("widgets", [])
    if existing:
        max_bottom = max(e.get("y", 0) + e.get("h", 0) for e in existing if isinstance(e, dict))
        x, y = pad, max_bottom + pad
    else:
        x, y = pad, pad

    existing.append({
        "canvasId": canvas_id,
        "widgetId": canvas_id,  # custom instance — points to custom_widgets/{id}.js
        "kind":     "custom",
        "title":    args.title,
        "x": x, "y": y, "w": args.w, "h": args.h,
    })
    canvas_data["widgets"] = existing
    CANVAS_FILE.write_text(json.dumps(canvas_data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps({"canvasId": canvas_id, "x": x, "y": y, "w": args.w, "h": args.h}))


if __name__ == "__main__":
    main()
