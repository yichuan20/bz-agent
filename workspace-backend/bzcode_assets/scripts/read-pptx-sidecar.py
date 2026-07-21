#!/usr/bin/env python3
from __future__ import annotations

"""
read-pptx-sidecar.py — read a PPTX sidecar JSON and output a model-friendly
summary of each slide's visual structure, so the agent can make informed
layout decisions when creating a new deck from the template.

The sidecar JSON lives alongside the .pptx as .<filename>.pptx.json.
This script prints a compact JSON summary — no imageData, no decorative shapes
that carry no editable text — so the model sees what it needs to fill in.

Usage:
  python3 read-pptx-sidecar.py --pptx /path/to/template.pptx
  python3 read-pptx-sidecar.py --sidecar /path/to/.template.pptx.json

Output JSON schema:
  {
    "sidecar_path": "...",
    "slide_count": 8,
    "slides": [
      {
        "index": 0,
        "bg_color": "#cec4b6",
        "layout_hint": "Title slide — large title + subtitle + date",
        "editable_boxes": [
          {
            "id": "abc123",
            "placeholder_text": "Presentation title goes here",
            "role": "title",
            "font_size": 48,
            "x": 44, "y": 120, "w": 500, "h": 80
          },
          ...
        ]
      }
    ],
    "usage_note": "To create a new deck: pick a slide index for each content slide,
                   then pass text_updates mapping box ids to new text."
  }
"""

import argparse
import json
import sys
from pathlib import Path

# Heuristics to identify a box's semantic role from its placeholder text + size
_ROLE_HINTS = [
    (["presentation title", "title goes here", "slide title", "a clear, single"], "title"),
    (["subtitle", "supporting line", "tagline", "short supporting"], "subtitle"),
    (["section name", "section header"], "section_title"),
    (["topic", "date", "yyyy", "brand template", "month"], "label"),
    (["open with", "body", "lead with", "frame the", "one thing to remember", "give one", "close with"], "body"),
    (["bullet", "point 1", "point 2"], "bullets"),
    (["speaker", "notes"], "notes"),
]

_SECTION_NUMBER_HINTS = ["01", "02", "03", "04", "05", "06", "07", "section"]


def _guess_role(text: str, font_size: float) -> str:
    lower = text.lower().strip()
    if not lower:
        return "decorative"
    for keywords, role in _ROLE_HINTS:
        if any(k in lower for k in keywords):
            return role
    # Fall back on size
    if font_size >= 36:
        return "title"
    if font_size >= 20:
        return "body"
    if font_size >= 14:
        return "label"
    return "label"


def _layout_hint(slide: dict, editable: list[dict]) -> str:
    roles = [b["role"] for b in editable]
    bg = slide.get("bgColor", "")
    dark = bg.lower() in ("#5e5a55", "#1a1a1a", "#000", "#000000") or (
        bg.startswith("#") and all(int(bg[i : i + 2], 16) < 100 for i in (1, 3, 5) if len(bg) >= i + 2)
    )
    if "section_title" in roles or any(b["placeholder_text"][:2].isdigit() for b in editable):
        return "Section divider slide — section number + section title"
    if "title" in roles and "subtitle" in roles:
        return "Title / cover slide — main title + subtitle + date label"
    if "two_col" in roles or roles.count("body") >= 2:
        return "Two-column content slide — title + two body columns"
    if "title" in roles and "body" in roles:
        base = "Dark content slide" if dark else "Content slide"
        return f"{base} — title + body text"
    if "title" in roles:
        return "Title-only slide"
    if len(editable) == 0:
        return "Visual / decorative slide (no editable text)"
    return "Generic slide"


def _first_font_size(box: dict) -> float:
    for para in box.get("paragraphs", []):
        for run in para.get("runs", []):
            fs = run.get("fontSize")
            if fs:
                return float(fs)
    return 0.0


def _box_text(box: dict) -> str:
    """Return the display text of a box (paragraphs > text field)."""
    paras = box.get("paragraphs", [])
    if paras:
        return " ".join(p.get("text", "") for p in paras).strip()
    return box.get("text", "").strip()


def summarise_sidecar(sidecar: dict, sidecar_path: str) -> dict:
    slides_raw = sidecar.get("slides", [])
    slides_out = []

    for idx, slide in enumerate(slides_raw):
        editable = []
        for box in slide.get("boxes", []):
            text = _box_text(box)
            if not text:
                continue  # decorative / image-only
            fs = _first_font_size(box)
            role = _guess_role(text, fs)
            if role == "decorative":
                continue
            editable.append(
                {
                    "id": box.get("id", ""),
                    "placeholder_text": text[:120],
                    "role": role,
                    "font_size": fs,
                    "x": box.get("x", 0),
                    "y": box.get("y", 0),
                    "w": box.get("w", 0),
                    "h": box.get("h", 0),
                }
            )

        slides_out.append(
            {
                "index": idx,
                "bg_color": slide.get("bgColor", ""),
                "layout_hint": _layout_hint(slide, editable),
                "editable_boxes": editable,
            }
        )

    return {
        "sidecar_path": sidecar_path,
        "slide_count": len(slides_raw),
        "slides": slides_out,
        "usage_note": (
            "Pick a template slide index for each content slide. "
            "Pass box ids + new text in create-pptx-sidecar.py content spec."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarise a PPTX sidecar JSON for the agent.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--pptx", help="Path to .pptx — sidecar is .<name>.pptx.json in same dir.")
    group.add_argument("--sidecar", help="Path directly to the sidecar .json file.")
    args = parser.parse_args()

    if args.pptx:
        p = Path(args.pptx)
        sidecar_path = p.parent / f".{p.name}.json"
    else:
        sidecar_path = Path(args.sidecar)

    if not sidecar_path.exists():
        print(json.dumps({"error": f"sidecar not found: {sidecar_path}"}))
        sys.exit(1)

    try:
        sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(json.dumps({"error": f"could not read sidecar: {e}"}))
        sys.exit(1)

    result = summarise_sidecar(sidecar, str(sidecar_path))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
