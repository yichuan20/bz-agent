# Sidecar JSON Formats — Word, Excel, PowerPoint

Office files (`.docx`, `.xlsx`, `.pptx`) each maintain a companion JSON "sidecar" file that the
backend parses from the binary format and that the frontend reads and writes instead of touching
the binary file directly.  This document is the authoritative reference for all three formats.

---

## File naming conventions

| Binary file | Sidecar path | Hidden? |
|---|---|---|
| `<dir>/report.docx` | `<dir>/report.docx.json` | No |
| `<dir>/data.xlsx` | `<dir>/.data.xlsx.excel.json` | Yes (dot-prefix) |
| `<dir>/deck.pptx` | `<dir>/.deck.pptx.json` | Yes (dot-prefix) |

`FileService` suppresses sidecar names from directory listings: `.docx.json` et al. are stripped
via `_SIDECAR_SUFFIXES`; `.xlsx.excel.json` and `.pptx.json` are hidden because they are dot-files.

---

## 1. Word (`.docx`) — `<name>.docx.json`

**Source of truth:** `workspace-backend/src/workspace_backend/services/doc_service.py` →
`_docx_to_blocks()` / `_blocks_to_docx()`  
**TypeScript types:** `src/components/BzDocEditor.tsx` — `Block`, `StyleRange`

### Top-level envelope

```json
{
  "blocks": [ /* Block[] — see below */ ],
  "images": {
    "<imageId>": { "url": "data:image/png;base64,...", "width": 400, "height": 300 }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `blocks` | `Block[]` | Ordered list of paragraphs and table cells (see below) |
| `images` | `{ [id]: ImageEntry }` | Map of image IDs referenced inside `StyleRange.imageId` |

### `Block` object

```json
{
  "text": "Hello world",
  "styles": [ /* StyleRange[] */ ],
  "indent": 1,
  "prefix": "•",
  "alignment": "center",
  "headingLevel": 2,
  "isTableCell": false
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `text` | `string` | — | Plain text of the paragraph (never `null`) |
| `styles` | `StyleRange[]` | `[]` | Inline formatting runs (may be empty) |
| `indent` | `number` | `0` | 0–8 indentation level |
| `prefix` | `string` | `""` | `"•"` for bullets; `"1."`, `"2."`, … for numbered lists |
| `alignment` | `string` | `""` | `"center"` / `"right"` / `"justify"` (empty = left) |
| `headingLevel` | `number \| null` | `null` | 1–4; `null` for body text |
| `isTableCell` | `boolean` | `false` | `true` if this block is a table cell |
| `tableId` | `string` | — | Stable ID shared by all cells of the same table |
| `rowIndex` | `number` | — | 0-based row within the table |
| `columnIndex` | `number` | — | 0-based column within the table |
| `numberOfRows` | `number` | — | Total rows in the table |
| `numberOfColumns` | `number` | — | Total columns in the table |

Table cells are interleaved in `blocks` in reading order (row-major).  All cells of the same table
share the same `tableId`.  Callers identify a table by collecting consecutive blocks with
`isTableCell === true` and the same `tableId`.

### `StyleRange` object

```json
{
  "start": 0,
  "end": 5,
  "isBold": true,
  "isItalic": false,
  "isUnderlined": false,
  "isStrikethrough": false,
  "fontSize": 14,
  "fontFamily": "Calibri",
  "textColor": "#365F91",
  "bgColor": "#FFFF00",
  "url": "https://example.com",
  "imageUrl": "data:image/png;base64,...",
  "imageWidth": 200,
  "imageHeight": 150,
  "imageId": "img_abc123"
}
```

| Field | Type | Description |
|---|---|---|
| `start` | `number` | Inclusive character offset within `Block.text` |
| `end` | `number` | Exclusive character offset within `Block.text` |
| `isBold` | `boolean?` | — |
| `isItalic` | `boolean?` | — |
| `isUnderlined` | `boolean?` | — |
| `isStrikethrough` | `boolean?` | — |
| `fontSize` | `number?` | Point size |
| `fontFamily` | `string?` | Font name |
| `textColor` | `string?` | `#RRGGBB` |
| `bgColor` | `string?` | `#RRGGBB` character highlight |
| `url` | `string?` | Hyperlink URL |
| `imageUrl` | `string?` | Inline image as data URL or HTTP URL |
| `imageWidth` | `number?` | Rendered image width in pixels |
| `imageHeight` | `number?` | Rendered image height in pixels |
| `imageId` | `string?` | Key into the top-level `images` map |

Ranges within a block may overlap; the renderer merges them.  A block that is purely an image
has `text: ""` and a single `StyleRange` covering `[0, 0]` with `imageUrl` set.

### Full example

```json
{
  "blocks": [
    {
      "text": "Quarterly Report",
      "styles": [{ "start": 0, "end": 16, "fontSize": 18, "isBold": true, "fontFamily": "Calibri" }],
      "headingLevel": 1
    },
    {
      "text": "Revenue grew by 12% year-on-year.",
      "styles": [
        { "start": 0, "end": 7, "isBold": true },
        { "start": 19, "end": 22, "textColor": "#1473DF" }
      ]
    },
    {
      "text": "Q1",
      "styles": [],
      "isTableCell": true,
      "tableId": "tbl_a1b2",
      "rowIndex": 0, "columnIndex": 0,
      "numberOfRows": 2, "numberOfColumns": 2
    },
    {
      "text": "$1.2M",
      "styles": [],
      "isTableCell": true,
      "tableId": "tbl_a1b2",
      "rowIndex": 0, "columnIndex": 1,
      "numberOfRows": 2, "numberOfColumns": 2
    }
  ],
  "images": {}
}
```

---

## 2. Excel (`.xlsx`) — `.<name>.xlsx.excel.json`

**Source of truth:** `workspace-backend/src/workspace_backend/services/excel_service.py` and
`bzcode_assets/scripts/excel-worker.py`

### Top-level envelope

```json
{
  "version": 1,
  "xlsx_path": "/absolute/path/to/file.xlsx",
  "sheets": [ /* Sheet[] — see below */ ]
}
```

| Field | Type | Description |
|---|---|---|
| `version` | `number` | Always `1` |
| `xlsx_path` | `string` | Absolute path of the `.xlsx` file on disk |
| `sheets` | `Sheet[]` | One entry per worksheet, in tab order |

### `Sheet` object

```json
{
  "name": "Sheet1",
  "col_widths": [20, 15, 10],
  "cells": { /* cell-address → CellDescriptor */ },
  "mergedCells": ["A1:B1", "C3:D4"],
  "grid": {
    "columnIndexToWidth": { "0": 120, "2": 80 },
    "rowIndexToHeight": { "3": 40 }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Sheet tab name |
| `col_widths` | `number[]` | Character-unit column widths (Excel native units), index-aligned |
| `cells` | `{ [addr]: CellDescriptor }` | Sparse map; only non-empty cells are present |
| `mergedCells` | `string[]` | Excel-range strings for merged regions, e.g. `"A1:C2"` |
| `grid.columnIndexToWidth` | `{ [colIdx]: number }` | Override column widths in pixels (0-based index as string key) |
| `grid.rowIndexToHeight` | `{ [rowIdx]: number }` | Override row heights in pixels (0-based index as string key) |

### `CellDescriptor` object

Cell addresses are A1-notation strings (`"B4"`, `"AA12"`, etc.).

```json
{
  "v": 42.5,
  "f": "=SUM(B2:B10)",
  "s": {
    "bold": true,
    "italic": false,
    "bg": "#1473DF",
    "fg": "#FFFFFF",
    "align": "center",
    "format": "#,##0.00",
    "wrap": true,
    "fontSize": 11
  }
}
```

| Field | Type | Description |
|---|---|---|
| `v` | `string \| number \| boolean` | Computed (display) value |
| `f` | `string?` | Formula string including the leading `=`, e.g. `"=SUM(A2:A21)"` |
| `s` | `CellStyle?` | Formatting; omit the whole key if the cell has no styling |

`v` and `f` may both be present (formula cells cache their computed value).
If only `f` is present the frontend recomputes `v` client-side.

### `CellStyle` object

| Field | Type | Description |
|---|---|---|
| `bold` | `boolean?` | Bold font |
| `italic` | `boolean?` | Italic font |
| `bg` | `string?` | Background colour `#RRGGBB` |
| `fg` | `string?` | Font colour `#RRGGBB` |
| `align` | `string?` | `"left"` / `"center"` / `"right"` (horizontal); compound `"CENTER;BOTTOM"` for vertical too |
| `format` | `string?` | Excel number format code, e.g. `"#,##0.00"` or `"yyyy-mm-dd"` |
| `wrap` | `boolean?` | Text wrap within cell |
| `fontSize` | `number?` | Point size |

### API (wire) format

`ExcelService._sidecar_to_api()` projects the sidecar into a slightly different shape that the
frontend `ExcelViewSheetArea` component receives via `GET /api/excel/load`:

```json
{
  "id": "filename-without-extension",
  "name": "filename-without-extension",
  "sheets": [
    {
      "sheetName": "Sheet1",
      "cells": {
        "A1": {
          "value": "Revenue",
          "formula": null,
          "fontBold": true,
          "bgColor": "FF1473DF",
          "fontColor": "FFFFFFFF",
          "align": "center"
        }
      },
      "columnIndexToWidth": { "0": 120 },
      "rowIndexToHeight": {},
      "mergedCellRanges": ["A1:B1"],
      "images": []
    }
  ],
  "sources": []
}
```

Colour values in the API layer are **AARRGGBB** hex strings (e.g. `"FF1473DF"`), whereas the
sidecar uses `#RRGGBB`.

### Input JSON for `excel-worker.py` (create / seed)

When using the `excel-worker.py` script with `--data`, pass this input shape:

```json
{
  "sheets": [
    {
      "name": "Sheet1",
      "headers": ["Product", "Revenue", "Units"],
      "rows": [
        ["Widget A", 12000, 400],
        ["Widget B", 8500, 280],
        ["Total", null, null]
      ],
      "formulas": {
        "B4": "=SUM(B2:B3)",
        "C4": "=SUM(C2:C3)"
      },
      "col_widths": [20, 15, 10],
      "styles": {
        "A1": { "bold": true, "bg": "#1473DF", "fg": "#FFFFFF" },
        "B4": { "bold": true, "align": "right" }
      }
    }
  ]
}
```

`headers` are written as the first data row with bold+blue styling by default.
`rows` elements that are `null` are left empty (formula cells typically).

### Patch format

To update cells without rewriting the whole file, use the patch shape (accepted by
`ExcelService.patch()` and `excel-worker.py --patch`):

```json
{
  "sheet": "Sheet1",
  "cells": {
    "B5": { "f": "=B4*1.1" },
    "A3": { "v": "Updated label", "s": { "italic": true } }
  }
}
```

### Full sidecar example

```json
{
  "version": 1,
  "xlsx_path": "/workspace/data.xlsx",
  "sheets": [
    {
      "name": "Sales",
      "col_widths": [20, 15],
      "cells": {
        "A1": { "v": "Product", "s": { "bold": true, "bg": "#1473DF", "fg": "#FFFFFF" } },
        "B1": { "v": "Revenue", "s": { "bold": true, "bg": "#1473DF", "fg": "#FFFFFF" } },
        "A2": { "v": "Widget A" },
        "B2": { "v": 12000, "s": { "format": "#,##0" } },
        "A3": { "v": "Widget B" },
        "B3": { "v": 8500,  "s": { "format": "#,##0" } },
        "A4": { "v": "Total", "s": { "bold": true } },
        "B4": { "f": "=SUM(B2:B3)", "v": 20500, "s": { "bold": true, "format": "#,##0" } }
      },
      "mergedCells": [],
      "grid": { "columnIndexToWidth": {}, "rowIndexToHeight": {} }
    }
  ]
}
```

---

## 3. PowerPoint (`.pptx`) — `.<name>.pptx.json`

**Source of truth:** `workspace-backend/src/workspace_backend/services/ppt_service.py` →
`_pptx_to_slides()` / `_slides_to_pptx()`  
**Frontend renderer:** `src/ppt/components/Slide.jsx` → `drawConfig()`  
**Agent scripts:** `bzcode_assets/scripts/create-pptx-sidecar.py`, `read-pptx-sidecar.py`

### Top-level envelope

```json
{
  "slides": [ /* Slide[] — see below */ ]
}
```

### `Slide` object

```json
{
  "bgColor": "#FFFFFF",
  "bgGradient": {
    "angle": 135.0,
    "stops": [
      { "pos": 0.0, "color": "#CEC4B6" },
      { "pos": 1.0, "color": "#A89880" }
    ]
  },
  "slideWidthPt": 720,
  "boxes": [ /* Box[] — see below */ ]
}
```

| Field | Type | Description |
|---|---|---|
| `bgColor` | `string?` | Slide background colour `#RRGGBB`; used when no gradient |
| `bgGradient` | `Gradient?` | Linear gradient (see below); takes precedence over `bgColor` when present |
| `slideWidthPt` | `number` | Original slide width in PowerPoint points (usually `720`); used to derive the pixel scale factor |
| `boxes` | `Box[]` | Ordered list of shapes/text boxes/images |

#### Coordinate system

All box positions (`x`, `y`, `w`, `h`) are in **canvas pixels** on a virtual 896 × 504 canvas.

```
ptScale  = slideWidthPt ? 896 / slideWidthPt : 896 / 720  (≈ 1.244 for standard 16:9)
EMU_SCALE = prs.slide_width / 896                          (used server-side only)
```

The frontend canvas is rendered at `SF = 4× super-resolution` (3584 × 2016 px) but box
coordinates are stored at 1× and scaled up inside the draw code.

### `Box` object

```json
{
  "id": "a1b2c3d4",
  "x": 44,
  "y": 120,
  "w": 500,
  "h": 80,
  "rotation": 0.0,
  "shapeType": "rect",
  "cornerRadius": 0,
  "fill": { "type": "solid", "color": "#1473DF", "opacity": 0.9 },
  "text": "Slide title",
  "paragraphs": [ /* Paragraph[] — see below */ ],
  "styles": [],
  "boxStyle": { /* BoxStyle — see below */ },
  "imageData": null
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Random hex identifier (8 chars), stable across saves |
| `x` | `number` | Left edge, canvas px |
| `y` | `number` | Top edge, canvas px |
| `w` | `number` | Width, canvas px |
| `h` | `number` | Height, canvas px |
| `rotation` | `number` | Clockwise rotation in degrees |
| `shapeType` | `string` | Shape name (see Shape types below) |
| `cornerRadius` | `number` | For `roundRect`: 0–100 (% of half the shorter dimension) |
| `fill` | `Fill?` | Box fill (see Fill object below); `null` for image boxes |
| `text` | `string` | All paragraphs joined by `\n`; convenience field |
| `paragraphs` | `Paragraph[]` | Primary text content; overrides `text` for rendering |
| `styles` | `StyleRange[]` | Legacy flat style ranges used by selection UI (usually `[]`) |
| `boxStyle` | `BoxStyle` | Box-level rendering defaults |
| `imageData` | `string?` | Base64 data URL (`data:image/png;base64,...`) for image boxes; mutually exclusive with `paragraphs` |

#### Shape types

`"rect"`, `"roundRect"`, `"ellipse"`, `"triangle"`, `"rtTriangle"`, `"diamond"`,
`"parallelogram"`, `"trapezoid"`, `"pentagon"`, `"hexagon"`, `"plus"`,
`"rightArrow"`, `"leftArrow"`, `"upArrow"`, `"downArrow"`, `"chevron"`,
`"star4"`, `"star5"`, `"snip1Rect"`, `"can"`, `"cube"`

### `Fill` object

```json
{ "type": "solid", "color": "#1473DF", "opacity": 1.0 }
```

```json
{ "type": "gradient", "gradient": { "angle": 90, "stops": [{ "pos": 0.0, "color": "#FFFFFF" }, { "pos": 1.0, "color": "#CCCCCC" }] } }
```

```json
{ "type": "none" }
```

| Field | Type | Description |
|---|---|---|
| `type` | `"solid" \| "gradient" \| "none"` | Fill mode |
| `color` | `string?` | `#RRGGBB`; only for `solid` |
| `opacity` | `number?` | 0.0–1.0; only for `solid` |
| `gradient` | `Gradient?` | Only for `gradient` |

### `Gradient` object

```json
{ "angle": 45.0, "stops": [{ "pos": 0.0, "color": "#FFFFFF" }, { "pos": 1.0, "color": "#000000" }] }
```

| Field | Type | Description |
|---|---|---|
| `angle` | `number` | Direction in degrees (0 = left→right, 90 = top→bottom) |
| `stops` | `{ pos: number, color: string }[]` | Gradient stops; `pos` is 0.0–1.0, `color` is `#RRGGBB` |

### `Paragraph` object

```json
{
  "text": "Welcome to our Q4 results",
  "align": "center",
  "spaceBefore": 6.0,
  "runs": [
    {
      "text": "Welcome to ",
      "fontSize": 36,
      "fontFamily": "Montserrat",
      "bold": false,
      "italic": false,
      "underline": false,
      "color": "#FFFFFF",
      "letterSpacing": 0
    },
    {
      "text": "our Q4 results",
      "fontSize": 36,
      "fontFamily": "Montserrat",
      "bold": true,
      "italic": false,
      "underline": false,
      "color": "#FFD700",
      "letterSpacing": 1.5
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `text` | `string` | Full paragraph text (all runs concatenated) |
| `align` | `string` | `"left"` / `"center"` / `"right"` |
| `spaceBefore` | `number` | Space before this paragraph in points |
| `runs` | `Run[]` | Inline text runs with per-run formatting |

### `Run` object

| Field | Type | Description |
|---|---|---|
| `text` | `string` | Run text |
| `fontSize` | `number` | Point size |
| `fontFamily` | `string` | Font name |
| `bold` | `boolean` | — |
| `italic` | `boolean` | — |
| `underline` | `boolean` | — |
| `color` | `string` | `#RRGGBB` |
| `letterSpacing` | `number` | Extra letter spacing in points (0 = default) |

### `BoxStyle` object

Box-level defaults applied when a run or paragraph does not override a field.

```json
{
  "bgColor": "#1473DF",
  "bgGradient": null,
  "fontSize": 24,
  "fontWeight": "bold",
  "fontStyle": "normal",
  "fontFamily": "Montserrat",
  "color": "#FFFFFF",
  "textAlign": "left",
  "textAnchor": "t",
  "padL": 7.2,
  "padR": 7.2,
  "padT": 3.6,
  "padB": 3.6,
  "normAutofit": false,
  "borderColor": null,
  "borderWidth": 0,
  "allCaps": false
}
```

| Field | Type | Description |
|---|---|---|
| `bgColor` | `string?` | Box background `#RRGGBB` |
| `bgGradient` | `Gradient?` | Box background gradient (overrides `bgColor`) |
| `fontSize` | `number?` | Default font size in points |
| `fontWeight` | `string?` | `"bold"` / `"normal"` |
| `fontStyle` | `string?` | `"italic"` / `"normal"` |
| `fontFamily` | `string?` | Default font family |
| `color` | `string?` | Default text colour `#RRGGBB` |
| `textAlign` | `string?` | `"left"` / `"center"` / `"right"` |
| `textAnchor` | `string?` | Vertical anchor: `"t"` (top) / `"ctr"` (middle) / `"b"` (bottom) |
| `padL/R/T/B` | `number?` | Inner padding in points |
| `normAutofit` | `boolean?` | Shrink text to fit the box |
| `borderColor` | `string?` | Shape outline colour `#RRGGBB` |
| `borderWidth` | `number?` | Shape outline width in points |
| `allCaps` | `boolean?` | Force all-caps rendering |

### `create-pptx-sidecar.py` content-spec format

When generating a new presentation from a template, pass this schema to `--content`:

```json
{
  "slides": [
    {
      "template_slide_index": 0,
      "text_updates": {
        "<boxId>": "Replacement text",
        "<boxId2>": "Line 1\nLine 2\nLine 3"
      }
    },
    {
      "template_slide_index": 1,
      "text_updates": {
        "<boxId>": "Another replacement"
      }
    }
  ]
}
```

The script clones the indicated template slide (by 0-based index) and replaces text in the
specified boxes while preserving all styling.  The output is a full sidecar in the format above.

### Full sidecar example

```json
{
  "slides": [
    {
      "bgColor": "#1A1A2E",
      "slideWidthPt": 720,
      "boxes": [
        {
          "id": "a1b2c3d4",
          "x": 48, "y": 180, "w": 800, "h": 100,
          "rotation": 0.0,
          "shapeType": "rect",
          "cornerRadius": 0,
          "fill": { "type": "none" },
          "text": "Annual Review 2024",
          "paragraphs": [
            {
              "text": "Annual Review 2024",
              "align": "center",
              "spaceBefore": 0,
              "runs": [
                {
                  "text": "Annual Review 2024",
                  "fontSize": 48,
                  "fontFamily": "Calibri",
                  "bold": true,
                  "italic": false,
                  "underline": false,
                  "color": "#FFFFFF",
                  "letterSpacing": 0
                }
              ]
            }
          ],
          "styles": [],
          "boxStyle": {
            "fontSize": 48, "fontWeight": "bold", "fontFamily": "Calibri",
            "color": "#FFFFFF", "textAlign": "center", "textAnchor": "ctr",
            "padL": 7.2, "padR": 7.2, "padT": 3.6, "padB": 3.6,
            "normAutofit": false, "borderWidth": 0, "allCaps": false
          },
          "imageData": null
        }
      ]
    }
  ]
}
```

---

## Cross-format notes

- **Immutability contract:** The frontend never edits the `.docx`/`.xlsx`/`.pptx` binary
  directly.  It sends the mutated sidecar to `POST /api/{doc,excel,ppt}/save`, and the
  backend reconstructs the binary from the sidecar.

- **Round-trip fidelity:** Some PowerPoint features (animations, SmartArt, embedded OLE objects,
  complex themes) are dropped on parse and cannot be reconstructed.  Word features that are
  preserved: runs, paragraphs, headings 1–4, bold/italic/underline/strikethrough, font
  family/size/colour, highlights, hyperlinks, bullets, numbered lists, indent levels, text
  alignment, tables, and inline images.  Excel preserves values, formulas, basic cell styles,
  column widths, row heights, and merged regions.

- **Images in Word:** Embedded DOCX images are extracted to `data:` URLs stored in `StyleRange`
  and referenced by ID in the top-level `images` map.  On save the backend re-embeds them.

- **Colour encoding:** Sidecar always uses CSS `#RRGGBB`.  The Excel API response layer converts
  to AARRGGBB (e.g. `"FF1473DF"`); that is an API-only detail, not present in the sidecar file.
