"""Document service — parse, edit, save, and download .docx/.pdf files.

Sidecar pattern: a parsed document is stored as ``<file>.docx.json`` (a block list)
so subsequent opens are instant and round-trip without re-running the parser.

Block schema (matches the old frontend's ``Block`` type):
    {type: "paragraph"|"heading", text: str, level?: int, style?: str, runs?: [...]}
    {type: "image", data: str}   — base64 data URL

In-memory cursor store: maps ``path → {selStart, selEnd}`` (transient UI state).
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
from pathlib import Path
from typing import Any

_MAX_BLOCKS = 2000  # safety cap on how many blocks we parse
_MAX_PDF_PAGES = 200
_CURSOR_STORE: dict[str, dict[str, int]] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _sidecar(path: Path) -> Path:
    return path.parent / f"{path.name}.json"


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


def _run_to_dict(run: Any) -> dict[str, Any]:
    """Convert a python-docx Run to a plain dict."""
    return {
        "text": run.text,
        "bold": bool(run.bold),
        "italic": bool(run.italic),
        "underline": bool(run.underline),
    }


def _para_to_block(para: Any) -> dict[str, Any] | None:
    """Convert a python-docx Paragraph to a block dict."""
    style_name: str = para.style.name if para.style else ""
    text = para.text
    if style_name.startswith("Heading"):
        try:
            level = int(style_name.split()[-1])
        except ValueError:
            level = 1
        return {"type": "heading", "level": level, "text": text, "style": style_name}
    return {"type": "paragraph", "text": text, "style": style_name}


def _parse_docx(path: Path) -> dict[str, Any]:
    from docx import Document  # type: ignore[import-untyped]
    from docx.oxml.ns import qn  # type: ignore[import-untyped]

    doc = Document(str(path))
    blocks: list[dict[str, Any]] = []
    word_count = 0
    font_name = ""

    # Detect default font
    try:
        default_font = doc.styles["Normal"].font
        font_name = default_font.name or ""
    except Exception:
        pass

    for para in doc.paragraphs:
        if len(blocks) >= _MAX_BLOCKS:
            break
        # Check for inline images in the paragraph XML
        for elem in para._element.iter(qn("a:blip")):  # type: ignore[attr-defined]
            r_id = elem.get(qn("r:embed"))
            if r_id:
                try:
                    part = doc.part.related_parts[r_id]
                    data = base64.b64encode(part.blob).decode()
                    ct = part.content_type
                    blocks.append({"type": "image", "data": f"data:{ct};base64,{data}"})
                except Exception:
                    pass
        block = _para_to_block(para)
        if block:
            blocks.append(block)
            word_count += len(para.text.split())

    truncated = len(blocks) >= _MAX_BLOCKS
    return {
        "filename": path.name,
        "type": "docx",
        "pages": None,
        "wordCount": word_count,
        "truncated": truncated,
        "blocks": blocks,
        "defaultFont": font_name,
    }


def _parse_pdf(path: Path) -> dict[str, Any]:
    from pypdf import PdfReader  # type: ignore[import-untyped]

    reader = PdfReader(str(path))
    pages = min(len(reader.pages), _MAX_PDF_PAGES)
    text_parts = []
    for page in reader.pages[:pages]:
        try:
            text_parts.append(page.extract_text() or "")
        except Exception:
            pass
    content = "\n\n".join(text_parts)
    word_count = len(content.split())
    truncated = len(reader.pages) > _MAX_PDF_PAGES
    return {
        "filename": path.name,
        "type": "pdf",
        "pages": len(reader.pages),
        "wordCount": word_count,
        "truncated": truncated,
        "content": content,
    }


def _blocks_to_docx(blocks: list[dict[str, Any]]) -> bytes:
    """Convert a block list back to a .docx binary."""
    from docx import Document  # type: ignore[import-untyped]
    from docx.shared import Pt  # type: ignore[import-untyped]

    doc = Document()
    for block in blocks:
        btype = block.get("type", "paragraph")
        text = str(block.get("text", ""))
        if btype == "heading":
            level = min(int(block.get("level", 1)), 9)
            doc.add_heading(text, level=level)
        elif btype == "image":
            data = str(block.get("data", ""))
            if data.startswith("data:"):
                try:
                    _, encoded = data.split(",", 1)
                    img_bytes = base64.b64decode(encoded)
                    doc.add_picture(io.BytesIO(img_bytes), width=Pt(400))
                except Exception:
                    pass
        else:
            doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ── Service ───────────────────────────────────────────────────────────────────


class DocService:
    """Parse DOCX/PDF files, persist the block representation, and regenerate DOCX."""

    async def parse(self, path: str, *, force: bool = False) -> dict[str, Any]:
        """Parse a document file. Returns the sidecar data (uses cache unless ``force``)."""
        p = Path(path)
        ext = p.suffix.lower()

        def _do_parse() -> dict[str, Any]:
            # Use sidecar cache for docx
            if ext in (".docx", ".doc") and not force:
                cached = _read_sidecar(p)
                if cached:
                    return cached
            if ext in (".docx", ".doc"):
                result = _parse_docx(p)
                _write_sidecar(p, result)
                return result
            if ext == ".pdf":
                return _parse_pdf(p)
            # Markdown / HTML / plain text
            try:
                content = p.read_text(encoding="utf-8", errors="replace")
            except OSError as exc:
                raise FileNotFoundError(path) from exc
            return {
                "filename": p.name,
                "type": ext.lstrip(".") or "text",
                "pages": None,
                "wordCount": len(content.split()),
                "truncated": False,
                "content": content,
            }

        return await asyncio.to_thread(_do_parse)

    async def parse_upload(self, data: bytes, filename: str) -> dict[str, Any]:
        """Parse an uploaded document (in-memory, no sidecar written)."""
        ext = Path(filename).suffix.lower()

        def _do() -> dict[str, Any]:
            tmp = Path(f"/tmp/{filename}")
            tmp.write_bytes(data)
            try:
                if ext in (".docx", ".doc"):
                    return _parse_docx(tmp)
                if ext == ".pdf":
                    return _parse_pdf(tmp)
                content = tmp.read_text(encoding="utf-8", errors="replace")
                return {
                    "filename": filename,
                    "type": ext.lstrip(".") or "text",
                    "wordCount": len(content.split()),
                    "content": content,
                }
            finally:
                tmp.unlink(missing_ok=True)

        return await asyncio.to_thread(_do)

    def set_cursor(self, path: str, sel_start: int, sel_end: int) -> None:
        _CURSOR_STORE[path] = {"selStart": sel_start, "selEnd": sel_end}

    def get_cursor(self, path: str) -> dict[str, int]:
        return _CURSOR_STORE.get(path, {"selStart": 0, "selEnd": 0})

    async def save(self, path: str, blocks: list[dict[str, Any]]) -> dict[str, Any]:
        """Persist blocks to sidecar and regenerate the .docx binary."""
        p = Path(path)

        def _do() -> dict[str, Any]:
            word_count = sum(len(b.get("text", "").split()) for b in blocks if b.get("text"))
            data: dict[str, Any] = {
                "filename": p.name,
                "type": "docx",
                "wordCount": word_count,
                "truncated": False,
                "blocks": blocks,
            }
            _write_sidecar(p, data)
            # Best-effort: regenerate the docx binary
            try:
                binary = _blocks_to_docx(blocks)
                p.write_bytes(binary)
            except Exception:
                pass
            return {"ok": True, "path": path, "wordCount": word_count}

        return await asyncio.to_thread(_do)

    async def download(self, path: str) -> bytes:
        """Build a DOCX binary from the sidecar for download."""
        p = Path(path)

        def _do() -> bytes:
            cached = _read_sidecar(p)
            if cached and cached.get("blocks"):
                return _blocks_to_docx(cached["blocks"])
            # Fall back to raw file if it exists
            if p.exists():
                return p.read_bytes()
            raise FileNotFoundError(path)

        return await asyncio.to_thread(_do)
