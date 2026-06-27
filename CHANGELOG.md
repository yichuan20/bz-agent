# Changelog

All notable changes to the bz-agent server are documented here.

---

## [0.1.0] - 2026-06-27

### Changed
- **`app.py` is now the sole HTTP entry point.** All ~67 routes previously split between `server.py` (aiohttp) and `app.py` (FastAPI) are now consolidated in `app.py`. `server.py` is a pure utility/business-logic module with no runnable HTTP layer — it cannot be launched as a server.
- All routes are grouped into named `APIRouter` instances (`ws`, `auth`, `files`, `sessions`, `canvas`, `db`, `boltzhub`, `batch`, `whatsapp`, `misc`) visible in the `/docs` OpenAPI UI.

### Fixed
- **`BZ_PYTHON` missing from bzcode environment** — new sessions spawned via `app.py` were missing the `BZ_PYTHON` env var, causing agent scripts (e.g. `create-doc.py`, `create-widget.py`) to fail with "Permission denied" when the model tried to run them. Fixed by passing `BZ_PYTHON: sys.executable` in the subprocess env, matching `server.py` behaviour.
- **`GET /widgets/template` shadowed by `GET /widgets/{widget_id}`** — route registration order caused `/widgets/template?name=clock` to match the parameterized handler (returning "widget not found") instead of the template handler. Moved the static route before the parameterized one.
- **Canvas not persisted / wrong widget shown after page refresh** — `GET /canvas` and `POST /canvas` ignored the `sessionId` query parameter and always read/wrote `{cwd}/.bzcanvas.json`. The agent scripts write to `~/.boltzbit/sessions/{id}/.bzcanvas.json`, so the canvas was never found on reload. Both endpoints now use `_canvas_file(sessionId, cwd)` consistent with all other session-scoped storage.
- **"Open file" chat chip opening blank screen** — relative paths extracted from agent messages (e.g. `poem.docx`) were sent to the server as-is. The server could not resolve them without cwd context. Chips now resolve relative paths against `activeCwd` before dispatching the `open-file` event or calling `/api/doc/parse`.

---

## [0.0.3] - 2026-06-26

### Fixed
- `POST /auth` now preserves an existing `refreshToken` in `credentials.json` when the caller does not supply one, preventing mobile short-lived tokens from evicting a valid refresh token written by a prior login.
- `POST /auth` automatically parses `expiresAt` from the JWT `exp` claim and stores it in milliseconds (as bzcode requires), even when the caller omits the field.
- Removed credential write from the WebSocket `?token=` query parameter. `POST /auth` is now the sole writer of `~/.boltzbit/credentials.json`, ensuring both `accessToken` and `refreshToken` are always present when bzcode spawns.

---

## [0.0.2] - 2026-06-26

### Added
- `_write_bzcode_credentials()` helper extracts credential-writing logic into a single reusable function called by both `POST /auth` and (formerly) the WebSocket handler.
- WebSocket handler reads `?token=` from the upgrade URL and writes bzcode credentials synchronously before spawning the bzcode process, eliminating a race condition where bzcode started before credentials were on disk.
- `POST /auth` and `POST /auth/logout` endpoints for mobile and frontend clients to push / clear BoltzHub credentials.
- `GET /api/version` endpoint returns `{"backend": "<version>"}` for version display in the frontend sidebar.

### Changed
- `BACKEND_VERSION` introduced as a single source of truth for the server version string.

---

## [0.0.1] - 2026-06-24

### Added
- Initial production Python server (`server.py`) with aiohttp WebSocket bridge to bzcode.
- Session management: `GET /sessions`, session config directory written before bzcode spawn.
- File API: `GET /files`, `GET /api/file`, `PUT /api/file`, `POST /files/mkdir`.
- Document parsing: `POST /api/doc/parse` (PDF, DOCX, PPTX, XLSX).
- Widget system: `GET/POST /widgets`, canvas persistence.
- WhatsApp webhook integration.
- BoltzHub app creator endpoints (`/boltzhub/*`).
- Static frontend serving from `dist/`.
