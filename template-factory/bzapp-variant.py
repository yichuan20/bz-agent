#!/usr/bin/env python3
"""
bzapp-variant — Apply vertical + design token transformation to a packed base template.

What it does:
  1. Copies the base template to a new destination
  2. Applies design token CSS override (appended to main stylesheet)
  3. Applies vertical text replacements (display labels, mock data strings)
  4. Updates .bzhub/app_config.json with the variant name/description/tags

Usage:
  python3 bzapp-variant.py \
    --source /tmp/hubspot-base \
    --dest /tmp/hubspot-healthcare-warm \
    --vertical verticals/mgmt-hubspot-healthcare.json \
    --token tokens/warm.css \
    --boltzhub-name "Healthcare Practice CRM" \
    --boltzhub-desc "CRM for healthcare practices" \
    --boltzhub-tags "healthcare,crm,management"
"""

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path

OVERRIDEABLE_EXTENSIONS = {".tsx", ".ts", ".jsx", ".js", ".css", ".html", ".md"}
SKIP_DIRS = {"node_modules", ".git", "dist", ".bzhub"}

# Files where token CSS is injected — try each in order until one exists
MAIN_CSS_CANDIDATES = [
    "src/styles/main.css",
    "src/styles/app.css",
    "src/index.css",
    "src/main.css",
    "src/App.css",
]


def _find_main_css(dest: Path) -> Path | None:
    for candidate in MAIN_CSS_CANDIDATES:
        p = dest / candidate
        if p.exists():
            return p
    return None


def _apply_token_override(dest: Path, token_css: Path) -> None:
    """Append the design token override CSS to the main stylesheet."""
    main_css = _find_main_css(dest)
    if main_css is None:
        print("  [warn] No main CSS file found — token override not applied")
        return

    override_content = token_css.read_text()
    current = main_css.read_text()

    # Guard: don't double-inject
    if "/* bzapp-token-override */" in current:
        print("  [skip] Token override already in main CSS")
        return

    main_css.write_text(current + "\n\n" + override_content)
    print(f"  [ok] Appended token override from {token_css.name} to {main_css.relative_to(dest)}")


def _apply_text_replacements(dest: Path, replacements: list[dict]) -> int:
    """
    Apply string replacements across all source files.
    Replacements are ordered (most specific first) and only applied to
    string literals and JSX text — not TypeScript identifiers.
    """
    count = 0
    for root, dirs, files in os.walk(dest):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fname in files:
            fpath = Path(root) / fname
            if fpath.suffix not in OVERRIDEABLE_EXTENSIONS:
                continue
            try:
                text = fpath.read_text(encoding="utf-8")
            except Exception:
                continue

            original = text
            for rep in replacements:
                frm = rep["from"]
                to = rep["to"]
                # Replace in string literals (single/double quoted) and JSX text nodes
                # Avoids replacing TypeScript identifiers mid-word
                text = re.sub(
                    r'(?<=["\'>])\s*' + re.escape(frm) + r'\s*(?=["\\'<])',
                    to,
                    text
                )
                # Also replace standalone in JSX text (between > and <)
                text = text.replace(f">{frm}<", f">{to}<")
                text = text.replace(f">{frm} <", f">{to} <")
                # Replace in quoted strings
                text = text.replace(f'"{frm}"', f'"{to}"')
                text = text.replace(f"'{frm}'", f"'{to}'")
                text = text.replace(f"`{frm}`", f"`{to}`")

            if text != original:
                fpath.write_text(text, encoding="utf-8")
                count += 1

    return count


def _update_bzhub_config(dest: Path, name: str, description: str, tags: list[str]) -> None:
    config_path = dest / ".bzhub" / "app_config.json"
    if not config_path.exists():
        print("  [warn] No .bzhub/app_config.json — skipping metadata update")
        return
    config = json.loads(config_path.read_text())
    if name:
        config["name"] = name
    if description:
        config["description"] = description
    if tags:
        config["tags"] = tags
    config_path.write_text(json.dumps(config, indent=2) + "\n")
    print(f"  [ok] Updated .bzhub/app_config.json: name={name!r}")


def variant(
    source: Path,
    dest: Path,
    vertical_path: Path | None,
    token_path: Path | None,
    bz_name: str,
    bz_desc: str,
    bz_tags: list[str],
) -> bool:
    if dest.exists():
        print(f"[warn] Destination {dest} already exists — removing")
        shutil.rmtree(dest)

    print(f"[variant] Copying {source.name} → {dest.name}")
    shutil.copytree(source, dest, ignore=shutil.ignore_patterns("node_modules", "dist"))

    if token_path and token_path.exists():
        _apply_token_override(dest, token_path)
    elif token_path:
        print(f"  [warn] Token file not found: {token_path}")

    if vertical_path and vertical_path.exists():
        vertical = json.loads(vertical_path.read_text())
        replacements = vertical.get("text_replacements", [])
        if replacements:
            changed = _apply_text_replacements(dest, replacements)
            print(f"  [ok] Applied {len(replacements)} text replacements across {changed} files")
        if not bz_name:
            bz_name = vertical.get("name", "")
        if not bz_desc:
            bz_desc = vertical.get("description", "")
        if not bz_tags:
            bz_tags = vertical.get("tags", [])
    elif vertical_path:
        print(f"  [warn] Vertical file not found: {vertical_path}")

    _update_bzhub_config(dest, bz_name, bz_desc, bz_tags)
    print(f"[variant] Done → {dest}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Apply vertical + design token transform to a base template")
    parser.add_argument("--source", required=True)
    parser.add_argument("--dest", required=True)
    parser.add_argument("--vertical", default=None, help="Path to vertical JSON definition")
    parser.add_argument("--token", default=None, help="Path to design token CSS override file")
    parser.add_argument("--boltzhub-name", default="", dest="bz_name")
    parser.add_argument("--boltzhub-desc", default="", dest="bz_desc")
    parser.add_argument("--boltzhub-tags", default="", dest="bz_tags", help="Comma-separated tags")
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    dest = Path(args.dest).expanduser().resolve()
    vertical_path = Path(args.vertical).resolve() if args.vertical else None
    token_path = Path(args.token).resolve() if args.token else None
    tags = [t.strip() for t in args.bz_tags.split(",") if t.strip()] if args.bz_tags else []

    if not source.exists():
        print(f"[error] Source not found: {source}", file=sys.stderr)
        sys.exit(1)

    ok = variant(source, dest, vertical_path, token_path, args.bz_name, args.bz_desc, tags)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
