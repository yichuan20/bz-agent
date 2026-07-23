#!/usr/bin/env python3
"""
create-widget.py — deploy a canvas widget onto the canvas.

Canvas layout (.bzcanvas.json) and custom widget code live in the SESSION directory,
not the working directory or bz-agent root. Built-in templates are fetched from the
running server API (GET /api/v1/widgets/template?name=<n>).

Two modes:

  # Built-in template (fetched from server):
  python3 create-widget.py --title "Clock" --template clock \\
      --session-dir ~/.boltzbit/sessions/{id} --cwd /path/to/project

  # Custom code (.pending.js written by agent first into session custom_widgets/):
  python3 create-widget.py --title "My Widget" \\
      --session-dir ~/.boltzbit/sessions/{id} --cwd /path/to/project

The script:
  - For templates: fetches JS from GET /api/v1/widgets/template?name=<template>
  - For custom:    reads {session_dir}/custom_widgets/.pending.js
  - Writes JS to   {session_dir}/custom_widgets/{canvasId}.js
  - Seeds empty    {session_dir}/widget_data/{canvasId}.json
  - Appends entry to {session_dir}/.bzcanvas.json
  - Prints JSON: {"canvasId": "...", "x": 0, "y": 0, "w": 380, "h": 280}
"""

import argparse
import json
import os
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


SERVER_BASE = os.environ.get("BZ_AGENT_URL", "http://localhost:18789")


def _fetch_template(name: str) -> str:
    """Fetch built-in template JS from the server API."""
    url = f"{SERVER_BASE}/api/v1/widgets/template?name={urllib.parse.quote(name)}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"ERROR: Server returned {e.code} for template '{name}': {body}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Could not reach server at {SERVER_BASE}: {e}", file=sys.stderr)
        print("Make sure the bz-agent server is running.", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy a canvas widget")
    parser.add_argument("--title", required=True, help="Widget display title")
    parser.add_argument("--template", default=None, help="Built-in template name (e.g. clock, bar, pie).")
    parser.add_argument("--w", type=int, default=380, help="Width in pixels")
    parser.add_argument("--h", type=int, default=280, help="Height in pixels")
    parser.add_argument("--cwd", default=None, help="Project working directory (legacy; canvas now in session dir).")
    parser.add_argument("--session-dir", default=None, help="Session directory (~/.boltzbit/sessions/{id}).")
    args = parser.parse_args()

    # Session dir is the canonical location for canvas + custom widget code
    session_dir = Path(args.session_dir).resolve() if args.session_dir else None

    # Canvas file lives in session dir; fall back to cwd for backward compat
    if session_dir:
        canvas_file = session_dir / ".bzcanvas.json"
        custom_dir = session_dir / "custom_widgets"
        data_dir = session_dir / "widget_data"
        pending_file = custom_dir / ".pending.js"
    else:
        # Legacy fallback: use cwd + bz-agent server_data
        cwd = Path(args.cwd).resolve() if args.cwd else Path.cwd()
        canvas_file = cwd / ".bzcanvas.json"
        # Find server_data by walking up (must have both server_data/widgets and bzcode)
        candidate = Path(__file__).resolve().parent
        agent_root = candidate
        for _ in range(8):
            if (candidate / "server_data" / "widgets").is_dir() and (candidate / "bzcode").is_dir():
                agent_root = candidate
                break
            candidate = candidate.parent
        custom_dir = agent_root / "server_data" / "custom_widgets"
        data_dir = agent_root / "server_data" / "widget_data"
        pending_file = custom_dir / ".pending.js"

    # Resolve JS code
    if args.template:
        code = _fetch_template(args.template)
    else:
        if not pending_file.exists():
            print(
                f"ERROR: No pending widget at {pending_file}\n"
                "Either pass --template <name> to use a built-in, "
                "or write the widget JS to that path first.",
                file=sys.stderr,
            )
            sys.exit(1)
        code = pending_file.read_text(encoding="utf-8")
        pending_file.unlink()

    canvas_id = "cw-" + secrets.token_hex(6)
    custom_dir.mkdir(parents=True, exist_ok=True)
    (custom_dir / f"{canvas_id}.js").write_text(code, encoding="utf-8")

    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / f"{canvas_id}.json").write_text(json.dumps({"_next_id": 1, "records": []}), encoding="utf-8")

    # Append to canvas layout
    pad = 24
    canvas_data: dict = {"version": 1, "widgets": []}
    if canvas_file.exists():
        try:
            canvas_data = json.loads(canvas_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    existing = canvas_data.get("widgets", [])
    if existing:
        max_bottom = max(e.get("y", 0) + e.get("h", 0) for e in existing if isinstance(e, dict))
        x, y = pad, max_bottom + pad
    else:
        x, y = pad, pad

    existing.append(
        {
            "canvasId": canvas_id,
            "widgetId": canvas_id,
            "kind": "custom",
            "title": args.title,
            "x": x,
            "y": y,
            "w": args.w,
            "h": args.h,
        }
    )
    canvas_data["widgets"] = existing
    canvas_file.parent.mkdir(parents=True, exist_ok=True)
    canvas_file.write_text(json.dumps(canvas_data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps({"canvasId": canvas_id, "x": x, "y": y, "w": args.w, "h": args.h}))


if __name__ == "__main__":
    main()
