# Changelog

All notable changes to the bz-agent server are documented here.

---

## [0.1.7] - 2026-06-30

### Added
- **Widget working indicator** — when the agent is running in float-prompt mode (chat panel hidden), a pill with animated bouncing dots and a "Working…" label appears above the floating input bar, giving clear visual feedback that the agent is active.
- **`POST /db/widget/{id}/schema`** — new endpoint so agent-written widgets can call `db.ensure(columns)` to declare their schema before inserting rows. Previously returned 405. Additive/non-destructive: new columns are merged into the stored schema, existing data is untouched. Added matching `GET /db/widget/{id}/schema` for inspection.
- **bzcode crash notification** — when the bzcode subprocess exits with a non-zero code, the server sends a `system` message to the client ("⚠ bzcode process exited unexpectedly (code N). Reconnecting…") before closing the WebSocket, replacing the previous silent disconnect.
- **`drain_bzcode_stderr` wired with queue in app.py** — auth-error keywords detected in bzcode stderr (e.g. "401", "invalid_token") are now forwarded to the client in `app.py` as well as `server.py`.

### Fixed
- **WebSocket stability — exponential backoff** — reconnect delays are now 2 s → 4 s → 8 s → 16 s → 30 s (capped), preventing rapid hammering of the server/proxy on repeated failures. Previously always retried after a flat 2 s.
- **WebSocket stability — dead connection detector** — if no pong is received for 35 s (more than two ping intervals), the client force-closes the socket so `onclose` fires and the auto-reconnect kicks in. Handles the case where a proxy silently drops the TCP connection without sending a close frame.
- **WebSocket stability — pong handler** — server pong messages (`{"type":"pong"}`) are now consumed and used to update the liveness timestamp; previously they were passed to the rest of the message handler and logged as unknown types.
- **WebSocket stability — session ID drift** — on reconnect, if the server assigned a different session ID than the one requested (e.g. the session file was not found and a fresh ID was generated), `activeSessionId` is updated before the next connection attempt so subsequent reconnects use the correct ID instead of an invalid stale one.
- **WebSocket stability — no state wipe on same-session reconnect** — `setItems([])` and session title/index reset are only called when switching to a genuinely new session URL. Pure reconnects (same URL, `wsKey` bump) preserve the displayed history so the user doesn't see a blank screen during the brief reconnect window.
- **WebSocket stability — reconnect timer cleanup** — the pending reconnect `setTimeout` is now cancelled in the effect cleanup function, preventing a stale timer from firing a spurious reconnect after an intentional session switch.
- **Session restoration after re-login** — before redirecting to `/login` on `auth_error` or from the "Sign in" banner, the current URL (including `?sessionId=…&cwd=…`) is saved to `sessionStorage`. After entering the API key, the login page navigates back to that URL, restoring the exact previous session instead of opening a blank agent.
- **Reverse-proxy keepalive** — server now replies `{"type":"pong"}` to client pings so nginx/load-balancers see bidirectional traffic and don't close the connection due to one-sided idle. Ping interval reduced from 25 s to 15 s.

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
