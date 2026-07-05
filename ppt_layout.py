"""
Backend text layout engine for PPTX rendering.

Computes line breaks, segment positions, and overflow detection using
Pillow font metrics — identical logic to the frontend's buildParaLines
but running on the server for deterministic, browser-independent results.

All coordinates stored in canvas pixels (CANVAS_WIDTH = 896, no SF factor).
The frontend multiplies by SF (= 4) when painting to the high-res canvas.
"""
import os
import re
import platform
from functools import lru_cache
from typing import Dict, List, Optional, Tuple

CANVAS_WIDTH = 896   # must match Slide.jsx constant
CANVAS_HEIGHT = 504
SF = 4               # frontend super-resolution factor (not used here, docs only)

# ── Font discovery ─────────────────────────────────────────────────────────────

_FONT_DIRS: Dict[str, List[str]] = {
    'Darwin': [
        os.path.expanduser('~/Library/Fonts'),
        '/Library/Fonts',
        '/System/Library/Fonts/Supplemental',
        '/System/Library/Fonts',
    ],
    'Linux': [
        os.path.expanduser('~/.local/share/fonts'),
        os.path.expanduser('~/.fonts'),
        '/usr/local/share/fonts',
        '/usr/share/fonts/truetype',
        '/usr/share/fonts',
    ],
    'Windows': [
        os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts'),
    ],
}

# Fonts absent on macOS but common in PPTX → closest available equivalent
_FAMILY_ALIASES: Dict[str, str] = {
    'arial unicode ms': 'arial',
    'calibri':         'arial',
    'calibri light':   'arial',
    'cambria':         'times new roman',
    'cambria math':    'times new roman',
    'tahoma':          'arial',
    'trebuchet ms':    'arial',
    'century gothic':  'arial',
    'gill sans mt':    'arial',
    'gill sans':       'arial',
    'palatino linotype': 'times new roman',
    'book antiqua':    'times new roman',
    'garamond':        'times new roman',
    'optima':          'helvetica',
    'futura':          'arial',
    'franklin gothic medium': 'arial',
}

# Pattern (stem without extension, lowercased) → (canonical_family, bold, italic)
_STEM_PATTERNS: List[Tuple[str, str, bool, bool]] = [
    # Arial variants — check specific before generic
    (r'arial[- ]black',                     'arial black',   False, False),
    (r'arial[- ]narrow[- ]bold[- ]italic',  'arial narrow',  True,  True),
    (r'arial[- ]narrow[- ]bold',            'arial narrow',  True,  False),
    (r'arial[- ]narrow[- ]italic',          'arial narrow',  False, True),
    (r'arial[- ]narrow',                    'arial narrow',  False, False),
    (r'arial[- ]rounded[- ]bold',           'arial rounded', True,  False),
    (r'arial[- ]bold[- ]italic',            'arial',         True,  True),
    (r'arial[- ]bolditalic',                'arial',         True,  True),
    (r'arial[- ]bold',                      'arial',         True,  False),
    (r'arial[- ]italic',                    'arial',         False, True),
    (r'^arial unicode',                     'arial unicode', False, False),
    (r'^arial$',                            'arial',         False, False),
    # Georgia
    (r'georgia[- ]bold[- ]italic',          'georgia',       True,  True),
    (r'georgia[- ]bold',                    'georgia',       True,  False),
    (r'georgia[- ]italic',                  'georgia',       False, True),
    (r'^georgia$',                          'georgia',       False, False),
    # Times New Roman
    (r'times new roman[- ]bold[- ]italic',  'times new roman', True, True),
    (r'times new roman[- ]bold',            'times new roman', True, False),
    (r'times new roman[- ]italic',          'times new roman', False, True),
    (r'times new roman',                    'times new roman', False, False),
    # Verdana
    (r'verdana[- ]bold[- ]italic',          'verdana',       True,  True),
    (r'verdana[- ]bold',                    'verdana',       True,  False),
    (r'verdana[- ]italic',                  'verdana',       False, True),
    (r'^verdana$',                          'verdana',       False, False),
    # Helvetica
    (r'helveticaneue',                      'helvetica neue', False, False),
    (r'helvetica',                          'helvetica',     False, False),
    # Courier New
    (r'courier new[- ]bold[- ]italic',      'courier new',   True,  True),
    (r'courier new[- ]bold',                'courier new',   True,  False),
    (r'courier new[- ]italic',              'courier new',   False, True),
    (r'courier new',                        'courier new',   False, False),
    # Comic Sans
    (r'comic sans ms[- ]bold',              'comic sans ms', True,  False),
    (r'comic sans ms',                      'comic sans ms', False, False),
    # Impact / Trebuchet
    (r'^impact$',                           'impact',        False, False),
    (r'trebuchet ms[- ]bold[- ]italic',     'trebuchet ms',  True,  True),
    (r'trebuchet ms[- ]bold',               'trebuchet ms',  True,  False),
    (r'trebuchet ms[- ]italic',             'trebuchet ms',  False, True),
    (r'trebuchet ms',                       'trebuchet ms',  False, False),
    # Montserrat (may be bundled with the app)
    (r'montserrat[- ]bold[- ]italic',       'montserrat',    True,  True),
    (r'montserrat[- ]bold',                 'montserrat',    True,  False),
    (r'montserrat[- ]italic',               'montserrat',    False, True),
    (r'montserrat',                         'montserrat',    False, False),
]

_font_index: Optional[dict] = None


def _build_font_index() -> dict:
    system = platform.system()
    dirs = _FONT_DIRS.get(system, [])
    index: Dict[tuple, str] = {}
    for d in dirs:
        if not os.path.isdir(d):
            continue
        for fname in os.listdir(d):
            ext = os.path.splitext(fname)[1].lower()
            if ext not in ('.ttf', '.otf'):
                continue
            stem = os.path.splitext(fname)[0].lower()
            for pattern, family, bold, italic in _STEM_PATTERNS:
                if re.search(pattern, stem):
                    key = (family, bold, italic)
                    if key not in index:  # earlier (user) dirs win
                        index[key] = os.path.join(d, fname)
                    break
    return index


def _get_index() -> dict:
    global _font_index
    if _font_index is None:
        _font_index = _build_font_index()
    return _font_index


def find_font_path(family: str, bold: bool = False, italic: bool = False) -> Optional[str]:
    """Return the best matching TTF/OTF path, or None."""
    idx = _get_index()
    fam = (family or 'arial').lower().strip()
    fam = _FAMILY_ALIASES.get(fam, fam)

    # Preference order: exact → drop italic → drop bold → plain
    for b in ([bold, False] if bold else [False]):
        for i in ([italic, False] if italic else [False]):
            p = idx.get((fam, b, i))
            if p:
                return p

    # Ultimate fallback: any Arial variant
    for b in (True, False):
        for i in (False, True):
            p = idx.get(('arial', b, i))
            if p:
                return p
    return None


# ── Pillow measurement ─────────────────────────────────────────────────────────

@lru_cache(maxsize=512)
def _pil_font(path: str, size_px: int):
    from PIL import ImageFont
    try:
        return ImageFont.truetype(path, size=max(4, size_px))
    except Exception:
        return ImageFont.load_default()


def _pil_measure(text: str, font_path: Optional[str], size_px: int) -> float:
    """Raw character width in pixels (no letter spacing)."""
    if not text or not font_path:
        # Rough fallback: ~0.55× font size per char
        return size_px * 0.55 * len(text)
    font = _pil_font(font_path, size_px)
    try:
        return float(font.getlength(text))
    except Exception:
        return size_px * 0.55 * len(text)


# ── Per-run width helper ───────────────────────────────────────────────────────

def run_width(text: str, font_path: Optional[str], size_px: int,
              letter_spacing_px: float) -> float:
    """
    Width in canvas pixels including PPTX between-character spacing
    (n-1 gaps for n characters, matching PowerPoint semantics).

    Measure at 4× resolution (SF=4) then divide for sub-pixel accuracy.
    """
    if not text:
        return 0.0
    hi_px = max(4, round(size_px * SF))
    w = _pil_measure(text, font_path, hi_px) / SF
    # PPTX spc: spacing between each pair of adjacent chars
    w += letter_spacing_px * max(0, len(text) - 1)
    return w


# ── Layout engine ──────────────────────────────────────────────────────────────

def compute_box_layout(box: dict, slide_width_pt: float) -> dict:
    """
    Compute pre-broken line layout for one PPTX text box.

    Returns:
        layoutLines  – list of line dicts (see below)
        textHeight   – total rendered text height in canvas px
        boxHeight    – box h in canvas px
        overflows    – True if textHeight > boxHeight (with 1px tolerance)

    Each line dict:
        y        – top of line relative to box, canvas px
        height   – line height, canvas px
        segs     – list of segment dicts
            x, w         – horizontal position & width, canvas px
            text         – string to draw
            fontFamily   – family name (as stored in sidecar)
            fontSize     – size in pt (frontend scales via ptScale * SF)
            bold, italic – bool
            color        – hex string
            letterSpacing – pt (frontend converts to canvas px)
    """
    pt_scale = CANVAS_WIDTH / max(1.0, slide_width_pt)

    bs = box.get('boxStyle') or {}
    pad_l = float(bs.get('padL', 7.2))
    pad_r = float(bs.get('padR', 7.2))
    pad_t = float(bs.get('padT', 3.6))
    pad_b = float(bs.get('padB', 3.6))
    box_w = float(box.get('w', CANVAS_WIDTH))
    box_h = float(box.get('h', 100))
    max_w = max(1.0, box_w - pad_l - pad_r)
    norm_autofit = bool(bs.get('normAutofit', False))
    text_anchor  = bs.get('textAnchor', 't') or 't'

    def_family  = bs.get('fontFamily', 'Arial') or 'Arial'
    def_size_pt = float(bs.get('fontSize', 16) or 16)
    def_bold    = bs.get('fontWeight') == 'bold'
    def_color   = bs.get('color', '#000000') or '#000000'
    def_align   = bs.get('textAlign', 'left') or 'left'

    # normAutofit boxes were sized by PowerPoint to fit their content.
    # Add a small tolerance to absorb Pillow vs GDI font-metric differences.
    wrap_tol = (def_size_pt * pt_scale * 0.3) if norm_autofit else 0.0

    paragraphs = box.get('paragraphs') or []
    if not paragraphs:
        return {'layoutLines': [], 'textHeight': 0.0,
                'boxHeight': box_h, 'overflows': False}

    # ── Pass 1: build lines (no x assignment yet) ──────────────────────────────
    # Each entry: {y, height, align, segs: [{text, w, fontFamily, ...}]}
    lines: List[dict] = []
    ry = pad_t  # current y cursor (canvas px)

    for para in paragraphs:
        space_before_px = float(para.get('spaceBefore', 0) or 0) * pt_scale
        ry += space_before_px
        para_align = para.get('align', def_align) or def_align
        runs = para.get('runs') or []

        if not runs:
            # Empty paragraph — half-line vertical gap
            gap = def_size_pt * pt_scale * 0.6
            lines.append({'y': ry, 'height': gap, 'align': para_align, 'segs': []})
            ry += gap
            continue

        # -- Collect lines for this paragraph --
        segs_cur: List[dict] = []
        line_w  = 0.0
        line_h  = def_size_pt * pt_scale * 1.2
        line_y  = ry

        def _flush(new_lh: float):
            nonlocal segs_cur, line_w, line_h, line_y, ry
            lines.append({'y': line_y, 'height': line_h,
                          'align': para_align, 'segs': segs_cur})
            ry += line_h
            segs_cur = []
            line_w   = 0.0
            line_h   = new_lh
            line_y   = ry

        for run in runs:
            rt = run.get('text') or ''
            if not rt:
                continue

            r_size_pt  = float(run.get('fontSize') or def_size_pt)
            r_family   = run.get('fontFamily') or def_family
            r_bold     = bool(run.get('bold') or def_bold)
            r_italic   = bool(run.get('italic', False))
            r_color    = run.get('color') or def_color
            r_ls_pt    = float(run.get('letterSpacing', 0) or 0)

            r_size_px  = r_size_pt * pt_scale
            r_ls_px    = r_ls_pt   * pt_scale
            r_lh       = r_size_px * 1.2
            line_h     = max(line_h, r_lh)

            fpath = find_font_path(r_family, r_bold, r_italic)

            all_caps = bool(run.get('allCaps') or bs.get('allCaps'))
            text_str = rt.upper() if all_caps else rt

            def mw(s: str) -> float:
                return run_width(s, fpath, round(r_size_px), r_ls_px)

            parts = text_str.split('\n')
            for pi, part in enumerate(parts):
                if pi > 0:
                    _flush(max(r_lh, def_size_pt * pt_scale * 1.2))

                words = part.split(' ')
                pending = ''
                for wi, word in enumerate(words):
                    sep  = ' ' if wi < len(words) - 1 else ''
                    cand = pending + word + sep
                    cw   = mw(cand)
                    if line_w + cw > max_w + wrap_tol and (segs_cur or pending):
                        if pending:
                            pw = mw(pending)
                            segs_cur.append({
                                'text': pending, 'w': round(pw, 3),
                                'fontFamily': r_family, 'fontSize': r_size_pt,
                                'bold': r_bold, 'italic': r_italic,
                                'color': r_color, 'letterSpacing': r_ls_pt,
                            })
                            line_w += pw
                        _flush(max(r_lh, def_size_pt * pt_scale * 1.2))
                        pending = word + sep
                    else:
                        pending = cand

                if pending:
                    pw = mw(pending)
                    segs_cur.append({
                        'text': pending, 'w': round(pw, 3),
                        'fontFamily': r_family, 'fontSize': r_size_pt,
                        'bold': r_bold, 'italic': r_italic,
                        'color': r_color, 'letterSpacing': r_ls_pt,
                    })
                    line_w += pw

        if segs_cur:
            _flush(def_size_pt * pt_scale * 1.2)
        elif lines and not lines[-1]['segs']:
            pass  # already have an empty line from earlier
        else:
            # Empty tail line (e.g. trailing newline)
            lines.append({'y': line_y, 'height': def_size_pt * pt_scale * 0.5,
                          'align': para_align, 'segs': []})
            ry += def_size_pt * pt_scale * 0.5

    # ── Pass 2: vertical offset for textAnchor ─────────────────────────────────
    total_h = sum(ln['height'] for ln in lines) if lines else 0.0
    if text_anchor == 'b':
        v_offset = box_h - pad_b - total_h - pad_t
    elif text_anchor == 'ctr':
        v_offset = (box_h - pad_t - pad_b - total_h) / 2.0
    else:
        v_offset = 0.0

    # ── Pass 3: assign x positions per line ───────────────────────────────────
    for ln in lines:
        ln['y'] = round(ln['y'] + v_offset, 3)
        ln['height'] = round(ln['height'], 3)
        lw = sum(s['w'] for s in ln['segs'])
        align = ln.pop('align')   # consumed here; not needed by frontend
        if align == 'center':
            lx = pad_l + (max_w - lw) / 2.0
        elif align == 'right':
            lx = box_w - pad_r - lw
        else:
            lx = pad_l
        cx = lx
        for seg in ln['segs']:
            seg['x'] = round(cx, 3)
            cx += seg['w']

    text_height = round(pad_t + total_h + pad_b, 3)

    return {
        'layoutLines': lines,
        'textHeight':  text_height,
        'boxHeight':   box_h,
        'overflows':   text_height > box_h + 1.0,  # 1px tolerance
    }


def compute_slide_layouts(boxes: List[dict], slide_width_pt: float) -> None:
    """Mutates each box in-place: adds layoutLines / textHeight / overflows."""
    for box in boxes:
        if not box.get('paragraphs'):
            continue
        try:
            result = compute_box_layout(box, slide_width_pt)
            box['layoutLines'] = result['layoutLines']
            box['textHeight']  = result['textHeight']
            box['overflows']   = result['overflows']
        except Exception as e:
            # Non-fatal: frontend falls back to JS buildParaLines
            import sys
            print(f'[ppt_layout] compute_box_layout failed: {e}', file=sys.stderr)


# ── checkfit API helper ────────────────────────────────────────────────────────

def checkfit(box_template: dict, new_text: str, slide_width_pt: float) -> dict:
    """
    Check whether `new_text` fits inside a box with the same style/metrics.
    `box_template` should be a sidecar box dict (has boxStyle, w, h, paragraphs).
    `new_text` may contain explicit newlines; each line becomes a paragraph.

    Returns:
        fits         – bool
        lines        – number of rendered lines
        textHeight   – rendered text height in canvas px
        boxHeight    – box height in canvas px
        overflowBy   – canvas px overflow (0 if fits)
        layoutLines  – pre-computed layout (can be used for preview)
    """
    import copy

    # Build a synthetic box with the same style but new text.
    # Inherit run-level attributes (font, letter spacing) from the first run
    # of the first paragraph in the template, so metrics match the real box.
    synthetic = copy.deepcopy(box_template)
    bs = synthetic.get('boxStyle') or {}
    existing_runs = (synthetic.get('paragraphs') or [{}])[0].get('runs') or [{}]
    first_run = existing_runs[0] if existing_runs else {}
    def_family  = first_run.get('fontFamily') or bs.get('fontFamily', 'Arial')
    def_size_pt = float(first_run.get('fontSize') or bs.get('fontSize', 16) or 16)
    def_bold    = bool(first_run.get('bold') or (bs.get('fontWeight') == 'bold'))
    def_color   = first_run.get('color') or bs.get('color', '#000000') or '#000000'
    def_ls      = float(first_run.get('letterSpacing', 0) or 0)

    paragraphs = []
    for raw_para in new_text.split('\n'):
        paragraphs.append({
            'text': raw_para,
            'align': bs.get('textAlign', 'left'),
            'spaceBefore': 0,
            'runs': [{'text': raw_para, 'fontFamily': def_family,
                      'fontSize': def_size_pt, 'bold': def_bold,
                      'color': def_color, 'letterSpacing': def_ls}],
        })
    synthetic['paragraphs'] = paragraphs

    result = compute_box_layout(synthetic, slide_width_pt)
    n_lines = sum(1 for ln in result['layoutLines'] if ln['segs'])
    overflow_by = max(0.0, result['textHeight'] - result['boxHeight'])

    return {
        'fits':        result['textHeight'] <= result['boxHeight'] + 1.0,
        'lines':       n_lines,
        'textHeight':  result['textHeight'],
        'boxHeight':   result['boxHeight'],
        'overflowBy':  round(overflow_by, 2),
        'layoutLines': result['layoutLines'],
    }
