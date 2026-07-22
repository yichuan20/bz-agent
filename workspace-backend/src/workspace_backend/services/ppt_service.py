"""PPT service — load and save .pptx presentations via python-pptx.

Sidecar pattern: ``.<filename>.json`` holds the parsed slide data so the FE can
render slides without re-parsing the binary.  ``PUT /ppt/save`` writes both the
sidecar and regenerates the .pptx binary.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
from pathlib import Path
from typing import Any


def _sidecar(path: Path) -> Path:
    return path.parent / f".{path.name}.json"


def _read_sidecar(path: Path) -> dict[str, Any] | None:
    sc = _sidecar(path)
    if not sc.exists():
        return None
    try:
        return json.loads(sc.read_text(encoding="utf-8"))
    except OSError, json.JSONDecodeError:
        return None


def _write_sidecar(path: Path, data: dict[str, Any]) -> None:
    sc = _sidecar(path)
    sc.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _color_str(color: Any) -> str | None:
    """Convert a python-pptx color to a hex string."""
    try:
        from pptx.util import Pt  # type: ignore[import-untyped]  # noqa: F401

        if color and color.type is not None:
            return f"#{color.rgb}"
    except Exception:
        pass
    return None


def _pptx_to_slides(path: Path) -> list[dict[str, Any]]:
    """Parse a .pptx file into a list of slide dicts."""
    from pptx import Presentation  # type: ignore[import-untyped]
    from pptx.enum.shapes import MSO_SHAPE_TYPE  # type: ignore[import-untyped]

    prs = Presentation(str(path))
    slide_width_pt = prs.slide_width.pt if prs.slide_width else 720.0
    slides = []
    for slide in prs.slides:
        boxes: list[dict[str, Any]] = []
        for shape in slide.shapes:
            box: dict[str, Any] = {
                "left": shape.left.pt if shape.left is not None else 0,
                "top": shape.top.pt if shape.top is not None else 0,
                "width": shape.width.pt if shape.width is not None else 0,
                "height": shape.height.pt if shape.height is not None else 0,
                "name": shape.name,
                "shapeType": str(shape.shape_type),
            }
            # Text frames
            if shape.has_text_frame:
                paragraphs = []
                for para in shape.text_frame.paragraphs:
                    runs = [
                        {
                            "text": r.text,
                            "bold": bool(r.font.bold),
                            "italic": bool(r.font.italic),
                            "size": r.font.size.pt if r.font.size else None,
                        }
                        for r in para.runs
                    ]
                    paragraphs.append(
                        {"text": para.text, "runs": runs, "alignment": str(para.alignment) if para.alignment else None}
                    )
                box["paragraphs"] = paragraphs
                box["text"] = shape.text_frame.text
            # Images
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                try:
                    img = shape.image
                    data = base64.b64encode(img.blob).decode()
                    box["imageData"] = f"data:{img.content_type};base64,{data}"
                except Exception:
                    pass
            boxes.append(box)
        slides.append({"boxes": boxes, "slideWidthPt": slide_width_pt})
    return slides


def _slides_to_pptx(slides: list[dict[str, Any]]) -> bytes:
    """Convert slide dicts back to a .pptx binary (best-effort round-trip)."""
    from pptx import Presentation  # type: ignore[import-untyped]
    from pptx.util import Pt  # type: ignore[import-untyped]

    prs = Presentation()
    blank_layout = prs.slide_layouts[6]  # blank layout
    for slide_data in slides:
        slide = prs.slides.add_slide(blank_layout)
        for box in slide_data.get("boxes", []):
            left = Pt(float(box.get("left", 0)))
            top = Pt(float(box.get("top", 0)))
            width = Pt(float(box.get("width", 100)))
            height = Pt(float(box.get("height", 50)))
            if box.get("paragraphs") or box.get("text"):
                txBox = slide.shapes.add_textbox(left, top, width, height)
                tf = txBox.text_frame
                text = box.get("text", "")
                if text:
                    tf.text = text
            elif box.get("imageData"):
                try:
                    data_url = str(box["imageData"])
                    _, encoded = data_url.split(",", 1)
                    img_bytes = base64.b64decode(encoded)
                    slide.shapes.add_picture(io.BytesIO(img_bytes), left, top, width, height)
                except Exception:
                    pass
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


class PptService:
    async def load(self, path: str) -> list[dict[str, Any]]:
        p = Path(path)

        def _do() -> list[dict[str, Any]]:
            sc = _read_sidecar(p)
            if sc is not None:
                return sc.get("slides", [])
            slides = _pptx_to_slides(p)
            _write_sidecar(p, {"slides": slides})
            return slides

        return await asyncio.to_thread(_do)

    async def save(self, path: str, slides: list[dict[str, Any]]) -> None:
        p = Path(path)

        def _do() -> None:
            _write_sidecar(p, {"slides": slides})
            try:
                binary = _slides_to_pptx(slides)
                p.write_bytes(binary)
            except Exception:
                pass

        await asyncio.to_thread(_do)

    def has_sidecar(self, path: str) -> bool:
        return _sidecar(Path(path)).exists()
