# Document Reading in Worker Mode

Worker mode supports reading and analysing **PDF, Word (DOCX), Excel (XLSX) and PowerPoint (PPTX)** files. All parsing runs locally via Python libraries — no external APIs or cloud services are required.

---

## Architecture

```
User attaches / references a document
        │
        ▼
Frontend (Layer 4)
  • Accepts .pdf .docx .xlsx .pptx via the paperclip button
  • Uploads to POST /api/doc/parse
        │
        ▼
Server parser (Layer 1)
  • Detects format, extracts text + structure
  • Returns JSON: filename, type, pages, wordCount, content
        │
        ▼
Agent context (Layer 4 path)         OR    Agent script (Layer 2 path)
  • Injected into user message              • python3 bzcode/scripts/read-doc.py
  • Agent answers immediately                 --path /abs/path/to/file
                                            • Agent runs via Bash tool when user
                                              references a file path in chat
        │
        ▼
Worker agent reasoning (Layer 3)
  • Summarises structure before answering
  • Quotes sections, compares tables, etc.
```

---

## Layer 1 — Server Parse Endpoint

### Endpoint

```
POST /api/doc/parse
```

Two accepted request formats:

**A — File path on disk (JSON body):**
```json
{ "path": "/Users/me/docs/report.pdf" }
```

**B — Direct file upload (multipart/form-data):**
```
file=<binary>
```

### Response

```json
{
  "filename": "report.pdf",
  "type": "pdf",
  "pages": 12,
  "wordCount": 4823,
  "truncated": false,
  "content": "# Page 1\n\nExecutive Summary...\n\n# Page 2\n\n..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `filename` | string | Original file name |
| `type` | `pdf` \| `docx` \| `xlsx` \| `pptx` | Detected format |
| `pages` | number | Page / sheet / slide count |
| `wordCount` | number | Approximate word count in extracted text |
| `truncated` | boolean | `true` if content was cut to the 80 000-char budget |
| `content` | string | Extracted text in markdown-flavoured plain text |

### Format-specific extraction

| Format | Library | Output structure |
|--------|---------|-----------------|
| PDF | `pypdf` | `# Page N` headings, paragraph text |
| DOCX | `python-docx` | Headings preserved as `#`/`##`/`###`, tables as markdown |
| XLSX | `openpyxl` | `## Sheet: SheetName` then markdown table per sheet |
| PPTX | `python-pptx` | `## Slide N: Title` then bullet points |

### Token budget

Documents are truncated to **80 000 characters** (≈ 20 000 tokens at average compression). For very large Excel files only the first 1 000 rows per sheet are included; the response sets `"truncated": true`.

### Dependencies

```
pypdf>=4.0
python-docx>=1.1
openpyxl>=3.1
python-pptx>=0.6
```

Install with: `pip install pypdf python-docx openpyxl python-pptx`

---

## Layer 2 — Agent Script

`bzcode/scripts/read-doc.py` lets the agent parse files that are already on disk without needing a file upload.

### Usage

```bash
# Basic
python3 bzcode/scripts/read-doc.py --path /abs/path/to/report.pdf

# Excel — specific sheet only
python3 bzcode/scripts/read-doc.py --path budget.xlsx --sheet "Q2 2026"

# Raise character limit (default 80 000)
python3 bzcode/scripts/read-doc.py --path big.pdf --max-chars 200000
```

### Output

Prints a JSON object to stdout (same shape as the parse endpoint response), which the agent reads and reasons over.

---

## Layer 3 — Worker Agent Configuration

The worker mode `AGENTS.md` instructs the agent to:

1. **Detect document references** — any `.pdf`, `.docx`, `.xlsx`, or `.pptx` path mentioned by the user
2. **Always parse first** — run `read-doc.py` via Bash before attempting to answer
3. **Summarise structure** — report filename, type, page/sheet count, and a one-line description before diving into content
4. **Quote precisely** — reference specific page numbers or sheet names when citing information

A `read-doc` skill is registered in the session config so the agent can invoke it with `/read-doc`.

---

## Layer 4 — Frontend (Worker Mode)

### File attachment

The **paperclip button** in worker mode accepts document formats in addition to images:

```
image/*  .pdf  .docx  .xlsx  .pptx
```

### Flow

1. User clicks 📎 or drags a document onto the chat input
2. Frontend uploads the file to `POST /api/doc/parse`
3. A loading chip appears: `📄 Parsing report.pdf…`
4. On success the chip updates: `📄 report.pdf · 12 pages · 4.8k words ✕`
5. The extracted text is sent as a `document` content block alongside the user message
6. The agent receives the full text in context and answers immediately

### Document chip

```
┌─────────────────────────────────┐
│ 📄 report.pdf  12 pages · 4.8k words  ✕ │
└─────────────────────────────────┘
```

A `truncated` indicator (`… truncated`) is shown when the document exceeded the 80 000-char budget.

---

## Scope & Limitations

| In scope | Out of scope |
|----------|-------------|
| Text and table extraction | OCR for scanned / image-only PDFs |
| Files on local disk | Cloud storage (Drive, SharePoint) |
| Files attached in chat | Real-time document editing |
| Single-file analysis | Cross-document comparison |
| Structured tables (XLSX) | Formula evaluation in spreadsheets |

---

## Error handling

| Condition | Behaviour |
|-----------|-----------|
| Unsupported file type | HTTP 400 `{ "error": "unsupported format: .xyz" }` |
| File not found (path mode) | HTTP 404 `{ "error": "file not found" }` |
| Corrupted / password-protected file | HTTP 422 `{ "error": "could not parse: <reason>" }` |
| File too large (> 50 MB) | HTTP 413 `{ "error": "file too large (max 50 MB)" }` |
