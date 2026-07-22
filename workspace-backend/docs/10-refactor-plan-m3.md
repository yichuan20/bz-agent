# M3 — Missing Backend APIs

## Context

The frontend (copied verbatim) calls ~50 endpoints the new `workspace-backend` currently
404s on. This plan ports them following the **existing M1 conventions**:
- Services in `services/` hold all logic; routes in `api/routes/` are thin
- Schemas stay in `api/schemas.py`
- New Python libs added via `uv add`
- Hexagonal ports where justified by complexity; plain services where simple
- `asyncio.to_thread` for blocking I/O; `asyncio.create_subprocess_*` for subprocesses

Most existing patterns to follow:
- `FileService` (traversal guard, path resolution) — extend this, not duplicate it
- `httpx.AsyncClient` from `AppContext` — for all external HTTP calls
- `sse_stream` / `StreamingResponse` — for SSE push endpoints

---

## Implementation groups (in priority order)

---

### Group 1 — File extras (extend existing files route)
**Scope:** 5 endpoints, all pure filesystem, zero new deps.

**New methods on `FileService`:**
- `rename(path, new_name)` → moves `path.parent/new_name`; 409 on collision
- `duplicate(path)` → `shutil.copy2` with auto-incremented `"copy N"` name
- `upload(data, filename, dest_dir)` → writes bytes, auto-increments on collision; if `.pptx`, schedules background sidecar pre-parse
- `download(path)` → returns `FileResponse` with attachment disposition
- `view(path)` → returns `FileResponse` with inline disposition

**New routes in `api/routes/files.py`** (extend the existing router):
```
POST /api/v1/files/rename       {path, newName}   → {ok, path}
POST /api/v1/files/duplicate    {path}             → {ok, path}
POST /api/v1/files/upload       form: file, dir?  → {ok, path, name}
GET  /api/v1/files/download?path=                  → FileResponse (attachment)
GET  /api/v1/files/view?path=                      → FileResponse (inline)
```

**Frontend shim update (`api.ts`):** add `renameFile`, `duplicateFile`, `uploadFile` shims that map old `/api/file/rename|duplicate|upload` → new paths. `download` and `view` are anchor hrefs — update the `HTTP_BASE` prefix in `EditorPanel.tsx` where they're used.

---

### Group 2 — Settings extras (new settings route)
**Scope:** 3 endpoints, pure filesystem.

**New `api/routes/settings.py`** with its own `APIRouter(prefix="/api/v1", tags=["Settings"])`:
```
GET    /api/v1/settings/resources             → {sessions:{count,bytes}, serverData:{bytes}, disk:{total,used,free}}
DELETE /api/v1/settings/sessions/clear?olderThanDays=  → {deleted: int}
GET    /api/v1/settings/log?lines=            → {bzHome, logFile, lines:[]}
```

**Logic:**
- `resources` — `asyncio.to_thread` around `os.walk` of `sessions_dir` + `shutil.disk_usage`
- `clear` — deletes `sessions/<id>/` dirs (not just `.jsonl`) older than cutoff; skips live agents via pool check
- `log` — reads last N lines of `$BZ_HOME/server.log` (created at startup if structured logging writes there)

**Frontend shim:** map old `/settings/resources` → `/api/v1/settings/resources`; old `/settings/sessions/clear` → `DELETE /api/v1/settings/sessions/clear`; old `/api/server/log` → `/api/v1/settings/log`.

---

### Group 3 — Canvas & Widgets (new canvas/widget services)
**Scope:** 12 endpoints; pure JSON-file storage; no new Python deps.

**New services:**
- `CanvasService` — read/write `.bzcanvas.json` inside `sessions/<id>/` or fallback to `<cwd>/`
- `WidgetService` — CRUD over `server_data/widgets/index.json` + individual `{id}.js` code files
- `CustomWidgetService` — CRUD over session-scoped `custom_widgets/<canvasId>.js` files
- `WidgetDbService` — per-widget JSON row-store at `server_data/widget_data/<canvasId>.json`; asyncio.Lock per canvas

**New `api/routes/canvas.py`** with router prefix `/api/v1`:
```
GET  /api/v1/canvas?cwd=&sessionId=       → stored canvas JSON
POST /api/v1/canvas?cwd=&sessionId=       → {ok, file}  (body = canvas state)
GET  /api/v1/custom-widgets/{id}?sessionId=   → {canvasId, code}
PUT  /api/v1/custom-widgets/{id}?sessionId=   → {ok, canvasId}
DELETE /api/v1/custom-widgets/{id}?sessionId= → {ok}
GET  /api/v1/widgets                      → [{id, label, ...}]
POST /api/v1/widgets                      → {ok, id}
POST /api/v1/widgets/seed                 → {seeded: int}
DELETE /api/v1/widgets/{id}              → {ok}
GET  /api/v1/db/widget/{id}/schema        → {columns, rowCount}
GET  /api/v1/db/widget/{id}/rows          → {rows, total, ...}
POST /api/v1/db/widget/{id}/rows          → {inserted:[...]}
PUT  /api/v1/db/widget/{id}/rows/{row_id} → {updated: row}
DELETE /api/v1/db/widget/{id}/rows/{row_id} → {deleted: row_id}
POST /api/v1/db/widget/{id}/exec          → {result: any}
```

**Frontend shim:** add canvas/widget shims mapping old paths (`/canvas`, `/widgets`, `/custom-widgets`, `/db/widget`) → new `/api/v1/*` paths.

---

### Group 4 — Widget runtime helpers (new runtime route)
**Scope:** 3 endpoints. Security-sensitive but simple. No new deps (use existing `httpx` client).

**New `api/routes/runtime.py`**:
```
POST /api/v1/runtime/proxy    {url, method, headers, body?} → upstream response
GET  /api/v1/runtime/shell?cmd=&cwd=                        → {output, returncode}
GET  /api/v1/runtime/search?q=&key=&num=                    → {results, meta}
```

**Logic:**
- `proxy` — use the shared `httpx.AsyncClient`; resolve `{{KEY}}` placeholders from `CredentialService`; forward upstream status
- `shell` — `asyncio.create_subprocess_shell` in `cwd` (validated by FileService traversal guard); 30s timeout; return combined stdout+stderr and returncode
- `search` — `httpx` GET to `https://serpapi.com/search.json` with caller-supplied `key`

**Frontend shim:** `IframeWidget.tsx` injects `window.__agentHttpBase__` which is used by widget source strings. No shim needed in `api.ts` — the widget iframe code uses the raw URL. The route just needs to exist at the right path. Widgetregistry.ts references `/proxy`, `/shell`, `/search` — these will be picked up automatically once the routes exist under the proxy.

**Note:** `/sql` does not exist in the old backend either; skip.

---

### Group 5 — Document workbench (new doc/excel/ppt services)
**Scope:** 15 endpoints; needs new heavy Python deps.

**New deps (add via `uv add`):**
- `python-docx` — Word parse + generate
- `pypdf` — PDF text extraction
- `openpyxl` — Excel read/write (no subprocess; implement formula recalc in-process)
- `python-pptx` — PowerPoint parse + generate

**New services:**
- `DocService` — parse/save/download `.docx`/`.pdf` via python-docx/pypdf; sidecar `<file>.docx.json`
- `ExcelService` — load/patch/grid/merge/rename-sheet/add-sheet via openpyxl; sidecar `.<file>.excel.json`
- `PptService` — load/save via python-pptx; sidecar `.<file>.json`
- `DevServerService` — spawn/stop `pnpm|npm|yarn dev` subprocesses (dict keyed by cwd)

**New routes:**
```
# api/routes/docs.py
POST /api/v1/doc/parse       {path} or form:file → {filename, type, pages, wordCount, truncated, blocks?, content?}
PUT  /api/v1/doc/cursor      {path, selStart, selEnd}  → {ok}
PUT  /api/v1/doc/save        {path, blocks}             → {ok, path, wordCount}
GET  /api/v1/doc/download?path=                         → FileResponse (docx)

# api/routes/excel.py
GET  /api/v1/excel/load?path=                           → {id, name, sheets:[...]}
PUT  /api/v1/excel/patch      {path, sheet?, cells}     → full sheet response
PUT  /api/v1/excel/grid       {path, sheet?, col/rowWidths} → {ok}
PUT  /api/v1/excel/merge      {path, sheet?, mergedCells}   → full sheet response
PUT  /api/v1/excel/renamesheet {path, oldName, newName}     → {ok, name}
POST /api/v1/excel/addsheet   {path, sheetName?}            → {ok, sheetName}

# api/routes/ppt.py
GET  /api/v1/ppt/load?path=                             → {slides:[...]}
PUT  /api/v1/ppt/save        {path, slides}             → {ok, path}
GET  /api/v1/ppt/status?path=                           → {ready, hasSidecar}

# api/routes/devserver.py
POST /api/v1/dev-server/start {cwd?}   → {url, pid}
POST /api/v1/dev-server/stop  {cwd?}   → {ok}
```

**Notes on method changes:** Old backend used GET/PUT inconsistently; new backend uses:
- `POST /parse` (creates a parsed representation)
- `PUT /save`, `PUT /cursor`, `PUT /patch`, `PUT /grid`, `PUT /merge`, `PUT /renamesheet` (idempotent updates)
- `POST /addsheet` (creates a new sheet)
- `PUT /ppt/save` (idempotent update)

**Doc cursor** — in-process in-memory dict is fine (no persistence needed; cursor position is UI state).

**Excel recalc** — port `excel-worker.py` logic inline (avoid subprocess). Recalculate formula cells in-process with openpyxl's data_only mode + a simple formula cache.

**Frontend shim:** add doc/excel/ppt shims in `api.ts` mapping old paths to new `/api/v1/doc`, `/api/v1/excel`, `/api/v1/ppt` paths. Also update HTTP method where old FE used GET for what is now PUT (excel patch/grid/merge/renamesheet — the old FE actually sent PUT, matching the new routes).

---

### Group 6 — BoltzHub (new boltzhub service)
**Scope:** 8 endpoints; calls external `boltzhub.com/bz-appstore-api`; 2 are SSE pipelines.

**New `BoltzHubService`** wrapping the shared `httpx.AsyncClient`:
- `boltzhub_token()` — reads `BZ_API_KEY` from `CredentialService`; falls back to empty
- All external calls authenticated via `X-API-Key` header

**New `api/routes/boltzhub.py`** with router prefix `/boltzhub` (keep old path — no `/api/v1` prefix here since the frontend hardcodes these paths in `agent.tsx` and they're not yet shimmed):
```
GET  /boltzhub/check?cwd=           → {isLoggedIn, hasAppConfig, appConfig, ...}
GET  /boltzhub/apps                 → BoltzHub app list
GET  /boltzhub/versions?appId=      → {versions:[...], suggestedNext}
GET  /boltzhub/token-usage?period=  → BoltzHub usage stats
POST /boltzhub/create-app           → {ok, appConfig}
POST /boltzhub/publish              → BoltzHub response
POST /boltzhub/push   (SSE)         → step events: build|archive|upload|deploy|publish|done|error
POST /boltzhub/sync   (SSE)         → step events: download|extract|install|done|error
```

**Keep the old path prefix** (`/boltzhub/…`) rather than renaming to `/api/v1/boltzhub` because:
- These paths are called directly from `agent.tsx` (not shimmed in `api.ts`)
- Changing them would require shimming agent.tsx's complex BoltzHub modal code
- They're naturally self-contained and not part of the agent resource model

**SSE pattern:** mirror the existing `sse_stream` / `StreamingResponse` approach from agents.py, using an async generator that yields `data: {json}\n\n` frames.

---

## Files to create / modify

```
src/workspace_backend/
  services/
    canvas_service.py      NEW — canvas + custom-widget JSON files
    widget_service.py      NEW — widget registry (index.json + .js files)
    widget_db_service.py   NEW — per-widget row store
    doc_service.py         NEW — docx/pdf parse+save (python-docx, pypdf)
    excel_service.py       NEW — xlsx load/patch/grid (openpyxl)
    ppt_service.py         NEW — pptx load/save (python-pptx)
    dev_server_service.py  NEW — spawn/stop pnpm/npm dev servers
    boltzhub_service.py    NEW — BoltzHub API proxy + SSE pipelines
  api/
    routes/
      files.py             EXTEND — add rename/duplicate/upload/download/view
      settings.py          NEW — resources/clear/log
      canvas.py            NEW — canvas + widgets + widget-db
      runtime.py           NEW — proxy/shell/search
      docs.py              NEW — doc parse/cursor/save/download
      excel.py             NEW — excel load/patch/grid/merge/rename/addsheet
      ppt.py               NEW — ppt load/save/status
      dev_server.py        NEW — dev-server start/stop
      boltzhub.py          NEW — all /boltzhub/* routes
    schemas.py             EXTEND — add new request/response models
    context.py             EXTEND — add new services to AppContext
    deps.py                EXTEND — add get_* accessors for new services
  app.py                   EXTEND — include_router for each new router
```

---

## Dependency additions

```bash
uv add python-docx pypdf openpyxl python-pptx
```

All four are pure-Python, no system deps beyond what's already installed.

---

## Implementation order (each is independently testable)

1. **File extras + Settings** — trivial, no new deps, immediate value for EditorPanel
2. **Canvas + Widgets + Widget DB** — pure JSON files, enables widget canvas pane
3. **Widget runtime (proxy/shell/search)** — enables interactive widgets
4. **Documents (doc/excel/ppt)** — needs new deps; split into doc first, then excel, then ppt
5. **Dev server** — subprocess management, needed for coder-mode preview
6. **BoltzHub** — external service; implement read-only (check/apps/versions/token-usage) first, then create-app/publish, then the two SSE pipelines (push/sync) last

---

## Verification

- `uv run pytest -q` — all existing 114 tests must stay green after each group
- New tests alongside each service (same pattern as existing unit tests in `tests/unit/`)
- Smoke-test via the running frontend: EditorPanel file-tree operations (Group 1), settings page (Group 2), widget canvas (Group 3), document open/save (Group 5)
