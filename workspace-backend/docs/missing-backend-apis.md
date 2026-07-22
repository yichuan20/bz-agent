# Missing Backend APIs

Endpoints the **copied frontend** calls that the new `workspace-backend` does not
implement yet (returns 404). Grouped by milestone. Wire the backend first, then the
frontend picks them up automatically — the shim layer in `src/lib/api.ts` already
forwards `HTTP_BASE` to every file.

---

## M3 — Canvas / Widgets

| Method | Old path | Notes |
|--------|----------|-------|
| GET/POST | `/canvas` | Load/save the widget canvas for a session |
| GET/PUT/DELETE | `/custom-widgets/{canvasId}` | Per-session custom widget CRUD |
| GET/POST | `/widgets` | List / create built-in widget instances |
| POST | `/widgets/seed` | Seed default widgets for a session |
| DELETE | `/widgets/{id}` | Delete a widget instance |

These are called by `agent.tsx`'s `CanvasPanel` (the right-hand canvas pane). The
UI renders nothing and logs 404s until the backend adds these routes.

---

## M3 — Widget runtime helpers (called from inside iframes)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/proxy` | Generic HTTP proxy (widgets use this to bypass CORS / inject stored credentials) |
| GET | `/shell?cmd=` | Run a shell command on the server |
| GET | `/search?q=` | SerpAPI-style web search proxy |
| POST | `/sql` | Run an SQL query against the agent's DB |
| GET/POST/PUT/DELETE | `/db/widget/{id}/rows` | Widget per-row data store |
| GET | `/db/widget/{id}/schema` | Widget DB schema |
| POST | `/db/widget/{id}/exec` | Exec SQL for a widget |

These run inside `IframeWidget`-sandboxed widgets via `window.__agentHttpBase__`.

---

## M4 — Document workbench

| Method | Old path | Notes |
|--------|----------|-------|
| POST | `/api/doc/parse` | Parse a `.docx`/`.pdf` into the editor model |
| PUT | `/api/doc/cursor` | Persist cursor/selection for co-editing |
| PUT | `/api/doc/save` | Save the document editor model back to disk |
| GET | `/api/doc/download?path=` | Download the document |
| GET | `/api/excel/load?path=` | Load an `.xlsx` workbook |
| POST | `/api/excel/patch` | Patch cells in an open workbook |
| POST | `/api/excel/grid` | Retrieve grid data |
| POST | `/api/excel/merge` | Merge cells |
| POST | `/api/excel/renamesheet` | Rename a sheet tab |
| POST | `/api/excel/addsheet` | Add a new sheet |
| GET | `/api/ppt/load?path=` | Load a `.pptx` presentation |
| POST | `/api/ppt/save` | Save a presentation |
| GET | `/api/ppt/status?path=` | Slide-render status |
| POST | `/api/dev-server/start` | Start a preview dev server (coder mode) |
| POST | `/api/dev-server/stop` | Stop the preview dev server |

These are called by `EditorPanel.tsx`, `excel/index.tsx`, and `ppt/index.tsx`.

---

## M4 — File extras

| Method | Old path | Notes |
|--------|----------|-------|
| POST | `/api/file/upload` | Upload a file to the workspace |
| POST | `/api/file/rename` | Rename/move a file |
| POST | `/api/file/duplicate` | Duplicate a file |
| GET | `/api/file/download?path=` | Download a file (anchor href) |
| GET | `/api/file/view?path=` | Preview a file in an iframe |

Called by `EditorPanel.tsx` file-tree context menus.

---

## M5 — BoltzHub integration

| Method | Old path | Notes |
|--------|----------|-------|
| GET | `/boltzhub/check?cwd=` | Check if a cwd is linked to a BoltzHub app |
| GET | `/boltzhub/apps` | List user's BoltzHub apps |
| POST | `/boltzhub/create-app` | Create a new BoltzHub app |
| POST | `/boltzhub/push` (SSE) | Build → zip → upload → deploy pipeline |
| POST | `/boltzhub/sync` (SSE) | Sync app from BoltzHub to workspace |
| POST | `/boltzhub/publish` | Publish a version |
| GET | `/boltzhub/versions?appId=` | List published versions |
| GET | `/boltzhub/token-usage?period=` | Token usage statistics |

---

## Misc / Settings extras (TBD)

| Method | Old path | Notes |
|--------|----------|-------|
| GET | `/settings/resources` | Disk / session usage stats |
| POST | `/settings/sessions/clear?olderThanDays=` | Prune old sessions |
| GET | `/api/server/log?lines=` | Tail the server log |
| GET | `/api/home` | Home/dashboard data (appears unused in practice) |

---

## Dropped (not coming back)

| Old path | Reason |
|----------|--------|
| `WS /ws` | The old WebSocket hook (`useBzcodeChat.ts`) is dead code — `agent.tsx` uses fetch-based SSE. Not needed. |
| `POST /auth`, `POST /auth/logout`, `GET /auth/status` | OAuth flow dropped; auth is BZ_API_KEY only. `logout` maps to `DELETE /api/v1/auth/api-key` in the shim. |
| `GET /api/apikey-verify` | Boltzbit cloud verification — not in scope for self-hosted backend. TopBar handles the 404 gracefully (`unverified` status). |
| `GET /api/version` → `bzcode`/`bzcode_latest` | New `/api/v1/version` returns only `{backend}`. The bzcode version fields are undefined in the response; the UI ignores them. |
