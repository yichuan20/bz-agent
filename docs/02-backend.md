# 02 — Backend (`app.py` + `server.py`)

The backend is two large Python files. `app.py` is the FastAPI HTTP/WebSocket layer; `server.py` is the business logic and in-memory state. `app.py` imports ~50 symbols from `server.py` via one big `from server import (...)` block (`app.py:51–111`); there is no reverse dependency.

- `app.py` — 4,182 lines. One factory `create_app(bzcode_path, default_cwd, bz_home, port)` (line 744) that defines 10 routers and every handler as a nested closure, plus a large inline python-pptx/docx rendering block.
- `server.py` — 2,717 lines. Numbered `§` sections (out of order — a migration artifact). Holds the `AgentPool`, credential/session helpers, document parsing, widgets, WhatsApp, BoltzHub.

> Historical note: `server.py` used to be an aiohttp server. It was migrated so
> that `app.py` (FastAPI) is the sole entry point (see CHANGELOG 0.1.0). Leftover
> `aiohttp`/`web` imports, a stale module docstring advertising
> `ws://localhost:8765`, and the unused `handle_ws_client` function remain. The
> FastAPI `/ws` handler fakes an aiohttp interface via a `_WsShim` class
> (`app.py:804`) so it can reuse `server.py`'s relay coroutines unchanged.

## The AgentPool (core runtime abstraction)

`server.py` §19 (line 1003+). This is the most important part of the backend.

- **`AgentPoolEntry`** (`server.py:1012`) wraps **one long-lived `bzcode` process** and decouples it from any WebSocket/SSE connection. It tracks agent status (`starting|idle|running|waiting_permission|waiting_input|dead`), the runtime session mode (`default|yolo|plan`), model info, available modes/commands, a per-turn replay buffer, and a **set of subscriber queues** (one per SSE/WS client). Long-lived process-facing tasks read stdout/stderr; connection-facing tasks attach/detach.
  - `start()` (`:1060`) spawns via `asyncio.create_subprocess_exec` and, once bzcode emits its ready message, sends `{"type":"setMode","mode":<yolo>}`.
  - `_dispatch_stdout()` (`:1101`) reads the process output queue, tracks state, auto-approves permission prompts in yolo mode, and fans messages out to all subscribers.
- **`AgentPool`** (`server.py:1410`) keys entries by `session_id`:
  - `get_or_create()` (`:1440`) — return the live entry or spawn a new one. Rejects `bz-probe-*` sessions.
  - `remove()` / `flush_all()` — shutdown one / all (flush is used on API-key reset so agents restart with fresh env).
  - `_idle_sweeper()` (`:1492`) — every 30s, reap entries with no clients that have been idle past `AGENT_IDLE_TIMEOUT` (default 300s).
  - `status()` (`:1517`) — monitoring snapshot (backs `/api/pool/status`).
- Singleton: `agent_pool = AgentPool(...)` at `server.py:1538` — the object `app.py` consumes.

### The stdio bridge coroutines (`server.py` §17, line 2474+)

`read_bzcode_stdout` (`:2478`, drops lines > 16 MB) → `_out_queue` → `_dispatch_stdout` → `send_to_client` (`:2532`). Client → process is `relay_client_messages` (`:2579`), which writes each frame + `\n` to bzcode stdin. `drain_bzcode_stderr` (`:2545`) scans stderr for auth keywords (e.g. `401`, `invalid_token`) and forwards an `auth_error` to the client. Client `{"type":"ping"}` is answered `{"type":"pong"}` and not forwarded (reverse-proxy keepalive).

### Session config generation (`server.py:79`, `_write_session_config`)

Before every spawn **and every resume**, this writes the compiled agent mode into `$BZ_HOME/sessions/<id>/`: `meta.json` (our metadata), `IDENTITY.md`, `SOUL.md`, `AGENTS.md`, `settings.json`, and copies of the mode's `skills/`, plus `scripts/` and `templates/` from `bzcode_assets`. It purges anything in the dir not on an `_OWNED_NAMES` allowlist (to clear bzcode sub-agent leftovers). It also selects **boltzbit vs generic asset variants** based on the reported model name. See [03 — Agent Modes](./03-agent-modes-and-assets.md).

## The full API surface (~68 routes)

Routers declared at `app.py:781–790`, mounted at `4065`. Grouped by router:

### WebSocket
| Method | Path | Purpose |
|---|---|---|
| WS | `/ws` | bzcode stdio bridge (one socket per session). **Legacy** — UI uses the pool SSE routes. `app.py:794` |

### Auth & credentials (`auth_router`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth` | Write bzcode `credentials.json` (access/refresh/expiry). `app.py:950` |
| GET/POST | `/credentials`, `/credentials/{key}` (DELETE) | Credential CRUD (placeholders like `{{OPENAI_API_KEY}}`). |
| GET | `/auth/status` | Whether valid credentials exist. |
| POST | `/auth/logout` | Clear credentials. |
| POST/GET | `/agent-key`, `/agent-keys`, `/agent-key/{name}` (DELETE) | Manage `BZ_API_KEY` and other agent API keys (`api_keys.json`). |
| DELETE | `/sessions-history` | Wipe session history. |

### Sessions (`sessions_router`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/sessions` | List sessions (reads each `meta.json`, marks defaults). |
| POST | `/sessions/create` | Create a session explicitly. |
| DELETE | `/sessions/{id}` | Delete a session. |
| POST | `/sessions/{id}/title` | Rename. |
| POST | `/session-default` | Set default session for a cwd. |

### Agent pool (SSE transport — the live path) (`misc_router`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/pool/status` | Pool monitoring snapshot. |
| POST | `/api/pool/connect` | Create/attach a pooled agent; returns history + capabilities. `app.py:1753` |
| GET | `/api/pool/{id}/stream` | **SSE** event stream from the agent. `app.py:1857` |
| POST | `/api/pool/{id}/send` | Send a message / reply to the agent. `app.py:1897` |

### Modes & models (`misc_router`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/agent-modes` | List agent modes (from `agent_modes.json`). |
| POST | `/api/classify-mode` | LLM-classify a prompt into a mode (used by Home). |
| GET | `/api/models` | Available models. |
| POST | `/api/sessions/{id}/model` | Switch a session's model. |

### Files (`files_router`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/files` | List a directory. |
| POST | `/files/mkdir`, `/api/file/mkdir` | Create a directory. |
| GET | `/shell` | Run a shell command (used by the terminal widget). |
| GET/PUT/DELETE | `/api/file` | Read / write / delete a file. |
| POST | `/api/file/rename`, `/api/file/duplicate`, `/api/file/upload` | File ops. |
| GET | `/api/file/download`, `/api/file/view` | Binary download / inline view. |
| GET/PUT | `/api/doc/cursor` | Persist last cursor position per doc. |

### Document workbench (`misc_router`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/doc/parse` | Parse PDF/DOCX/PPTX/XLSX → JSON. `app.py:2245` |
| PUT | `/api/doc/save` | Save Word doc (Block[]) or markdown. |
| GET | `/api/doc/download` | Export a doc. |
| GET/PUT | `/api/excel/load`, `/api/excel/save` | XLSX ↔ evaluated-cell JSON (preserves formulas). |
| PUT/POST | `/api/excel/{patch,grid,merge,renamesheet,addsheet}` | Granular Excel edits. |
| GET | `/api/excel/download` | Export XLSX. |
| GET | `/api/ppt/load` | PPTX → slide JSON (backgrounds, boxes, images). `app.py:2711` |
| PUT | `/api/ppt/save` | Slide JSON → PPTX. |
| POST/GET | `/api/ppt/checkfit`, `/api/ppt/status` | Layout fit-checking (uses `ppt_layout.py`). |

### Canvas & widgets (`canvas_router`)
| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/canvas` | Read/write the session's `.bzcanvas.json` layout. |
| GET/POST/DELETE | `/widgets`, `/widgets/{id}` | Built-in widget library CRUD. |
| GET | `/widgets/template` | Fetch a widget template by name. |
| POST | `/widgets/seed` | Seed widget data. |
| POST | `/canvas/deploy-widget` | Deploy a widget onto the canvas. |
| GET/PUT/DELETE | `/custom-widgets/{canvas_id}` | Agent-authored custom widget JS. |

### "Database" (`db_router`, prefix `/db`) — JSON files, not Postgres
| Method | Path | Purpose |
|---|---|---|
| GET | `/db/health` | Always returns 503 (no DB connected). |
| GET/POST | `/db/widget/{id}/schema` | Declare/inspect a widget's column schema. |
| GET/POST/PUT/DELETE | `/db/widget/{id}/rows[/{row_id}]` | Widget row CRUD (backed by `server_data/widget_data/{id}.json`). |
| POST | `/db/widget/{id}/exec` | Run a query — executes a **server-side Python snippet** (see risks). |

### BoltzHub (`boltzhub_router`, prefix `/boltzhub`)
`/check`, `/create-app`, `/push` (SSE build→zip→upload→deploy pipeline), `/apps`, `/versions`, `/token-usage`, `/sync`, `/create-version`, `/publish`. See [05 — Integrations](./05-integrations.md).

### Batch (`batch_router`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/batch` | Fire N one-shot agent runs (YOLO mode, 180s timeout each). |
| GET | `/batch/{id}` | Poll batch results. |

### WhatsApp (`whatsapp_router`, prefix `/whatsapp`)
`/whatsapp/incoming` (Twilio webhook → per-phone agent session), `/whatsapp/status` (delivery callbacks). See [05 — Integrations](./05-integrations.md).

### Misc (`misc_router`)
`/api/version`, `/api/apikey-status`, `/api/apikey-verify`, `/api/user/me`, `/api/home`, `/api/server/log`, `/proxy` (general outbound proxy with credential substitution), `/search` (SerpAPI), `/token-stats`, `/settings/resources`, `/settings/sessions/clear`, `/api/dev-server/start|stop` (Coder-mode preview servers). Plus the SPA catch-all `GET /{full_path:path}` (`app.py:4091`).

## In-memory state (all in `server.py`, lost on restart)

| Global | Line | What |
|---|---|---|
| `agent_pool._entries` | 1414 | The authoritative live-session map. |
| `_active_sessions` | 306 | Sessions with an attached connection. |
| `_running_sessions` | 308 | Sessions currently executing a turn. |
| `_token_stats` | 313 | `{input, output, total}` token counters. |
| `_batch_store` | 881 | Batch id → items. |
| `_cursor_store` | 303 | Per-doc cursor positions. |
| `_dev_servers` | 2462 | cwd → running preview server. |
| `_whatsapp_sessions` | 660 | phone → `_WASess`. |

> There is **no `_active_cwds`** despite what `DEPLOY.md` §6 implies; the closest
> real names are `_active_sessions` and `_dev_servers` (keyed by cwd).

## Config / env reads

- `BACKEND_VERSION = "0.6.4"` (`server.py:10`).
- `SESSIONS_DIR = ($BZ_HOME or /usr/local/boltzbit)/sessions` (`server.py:262`).
- Bootstrap env (`app.py` ~4166): `BZCODE_PATH`, `BZCODE_CWD`, `BZ_HOME`, `PORT` (18789), `BZCODE_DIST`; plus `AGENT_IDLE_TIMEOUT`.
- **`BZCODE_CWD` is not passed to bzcode as an env var** — it's read once at bootstrap to set the default cwd, then passed as the subprocess `cwd=`.
- Each spawn's env = `os.environ` + `BZ_API_KEY` (from `api_keys.json`) + `BZ_PYTHON=sys.executable` + `BZ_HOME`.

## Document processing (high level)

- **Word (DOCX)** is the rich format. `_docx_to_blocks` (`server.py:1631`) → a `Block[]` (each `{text, styles:[{start,end,…}], …}`; table cells are blocks flagged `isTableCell` with grid coords), resolving theme/default fonts from `theme1.xml`. `_blocks_to_docx` (`server.py:2054`) reverses it, including floating images via raw OOXML anchors. (Signature says `-> list` but it actually returns `{"blocks", "defaultFont"}` — a type lie.)
- **PDF / XLSX / PPTX parse → markdown text** (not editable blocks): `_parse_pdf/_parse_docx/_parse_xlsx/_parse_pptx`, dispatched by `_detect_and_parse` (`server.py:2327`), capped at 80 K chars.
- **Excel** uses a `{cell_id: {value: …}}` cell model with a server-side formula evaluator (`_eval_excel_formula`, `server.py:2376`, SUM/AVG/COUNT/ MIN/MAX + arithmetic, via a guarded `eval`). PPTX generation/layout is the big inline block in `app.py` (`/api/ppt/load` alone spans lines 2711–3450).

## Security-relevant surfaces (see [07](./07-tech-debt.md) for the full list)

- CORS `allow_origins=["*"]`, all methods/headers (`app.py` ~773). There is **no per-request auth on the bz-agent server itself** — remote deployments rely entirely on the workspace gateway for access control.
- `/proxy` is a general outbound HTTP proxy with credential substitution.
- `/db/widget/{id}/exec` and the widget query path run **server-side Python snippets**; `_eval_excel_formula` uses `eval` (allowlisted + `__builtins__` stripped).
- Secret redaction on the WS egress path is **regex-only** best-effort (`_redact`, `server.py:293`).
