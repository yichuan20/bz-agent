# 01 — System Overview

## Components

| Layer | Files | Role |
|---|---|---|
| **Web UI (SPA)** | `src/`, built to `dist/` | React 19 + TanStack Router single-page app. Chat with the agent, browse/edit files, manage the widget canvas, settings. |
| **HTTP/WS entry** | `app.py` | FastAPI app factory. ~68 routes across 10 routers, the `/ws` bridge, Pydantic models, and inline document (PPTX/DOCX) rendering. Serves the SPA from `dist/`. |
| **Business logic** | `server.py` | All domain logic and in-memory state. The `AgentPool` (session/process lifecycle), credential handling, document parsing, widgets, WhatsApp, BoltzHub. Imported by `app.py`; not runnable alone. |
| **Agent engine** | `bzcode` binary (external, from `/Users/jinli/Repos/bzcode`) | The actual LLM coding agent. Spawned as `bzcode --stdio --resume <id>`, one process per session. |
| **Agent config** | `agent_modes.json`, `bzcode_assets/` | Mode/persona definitions, plus helper scripts and templates copied into each session so the agent can create docs, widgets, and cloud apps. |
| **Cloud** | Boltzbit platform | BoltzHub (app store / deploy), Dynas (DB-as-a-service), Anksy (API gateway), dpyes (remote Python). Reached over HTTPS. |

## The `bzcode` relationship

`bzcode` ("Boltzbit Code") is a **standalone terminal coding agent** — a TypeScript/Bun program that streams LLM responses, runs tools (Bash, file read/edit/write), and loops until a task is done, against Boltzbit backends. Credentials live in `~/.boltzbit/credentials.json` (or `$BZ_HOME`).

**`bz-agent` is the product layer that wraps and orchestrates `bzcode`.** It:

1. Generates per-session config from `agent_modes.json` and writes it into the session directory (`IDENTITY.md`, `SOUL.md`, `AGENTS.md`, `settings.json`, skills).
2. Spawns `bzcode` as a subprocess in the user's working directory.
3. Bridges the agent's stdio to the browser (over SSE, or legacy WebSocket).
4. Supplies the `bzcode_assets/scripts/*.py` helpers as the agent's tools and serves the endpoints those tools call back into (`/proxy`, `/files`, `/widgets`, `/credentials`, …).
5. Adds a web UI, document editors, and a widget canvas around it.

`bzcode` is the generic engine; `bz-agent` is the opinionated product built on top of it.

## Request / connection flow (the live agent)

The shipping UI ([`src/routes/_app/agent.tsx`](../src/routes/_app/agent.tsx)) connects over **SSE + REST**, keyed on `{cwd, mode, sessionId}`:

1. **`POST /api/pool/connect`** `{cwd, mode, sessionId}` → the server writes the session config, gets-or-creates an `AgentPoolEntry` (spawning `bzcode` if needed), and returns `{sessionId, messages, agentStatus, modes, commands, sessionMode}`. History is restored here.
2. **`GET /api/pool/{id}/stream`** → a Server-Sent-Events stream. The client reads it via `fetch` + `ReadableStream`, splitting on `\n\n` and parsing `data:` lines into the [stdio-bridge protocol](../stdio-bridge-protocol.md) message types (`session`, `status`, `delta`, `assistant`, `tool`, `prompt`, `result`, `system`, `user`).
3. **`POST /api/pool/{id}/send`** → outbound user messages / permission replies.
4. **Reconnect** uses exponential backoff `min(2000·2^n, 30000)`, max 5 attempts, then marks the session unavailable.

The **legacy WebSocket path** (`GET /ws?cwd=&sessionId=&mode=`, hook `useBzcodeChat.ts`) does the same job through one socket with ping/pong keepalive, but the current UI does not use it. See [04 — Frontend](./04-frontend.md).

## Process & state model

- **Single process, single worker.** The server holds all state in memory (`AgentPool._entries`, `_active_sessions`, `_token_stats`, `_batch_store`, `_whatsapp_sessions`, `_dev_servers`, `_cursor_store`). It **must not** run with `--workers N` or behind a multi-worker gunicorn — state is not shared.
- **The AgentPool decouples process lifetime from connection lifetime.** A `bzcode` process (`AgentPoolEntry`) outlives any single browser connection: you can disconnect and reconnect to the same `sessionId` and the process is still there with its context. Idle processes (no clients, `idle` status) are reaped after `AGENT_IDLE_TIMEOUT` (default 300s) by a background sweeper.
- **Fan-out to multiple subscribers.** Each entry maintains a set of subscriber queues, so both SSE and WS clients (and reconnects) can attach to the same live agent.
- **Sessions persist on disk**, in-memory stats do not. Session transcripts and config live under `$BZ_HOME/sessions/` (default `/usr/local/boltzbit/sessions`); token stats / cursor positions / active-session sets are lost on restart.

## On-disk layout (runtime)

```
$BZ_HOME (default /usr/local/boltzbit)
├── credentials.json                 # bzcode auth (access+refresh tokens) — written by POST /auth
├── api_keys.json                    # BZ_API_KEY etc. — written by POST /agent-key
├── server.log                       # stderr tee (via _TeeWriter)
└── sessions/
    ├── <id>.jsonl                   # bzcode conversation transcript
    └── <id>/                        # per-session config dir (regenerated each connect/resume)
        ├── meta.json                # our metadata (sessionId, workingDir, mode, model)
        ├── IDENTITY.md, SOUL.md, AGENTS.md, settings.json   # compiled from the agent mode
        ├── skills/ scripts/ templates/                       # copied bzcode_assets
        ├── .bzcanvas.json           # widget canvas layout for this session
        ├── custom_widgets/<canvasId>.js
        └── widget_data/<canvasId>.json

<repo>/server_data/                  # server-owned, git-ignored
├── credentials.json                 # API keys & secrets (set manually on server)
├── widgets/*.js + index.json        # built-in widget library
└── widget_data/*.json               # widget "database" (JSON-file-per-canvas)

<user workspace> ($BZCODE_CWD, e.g. /home/boltzagent/workspace)
└── … files the agent and the document editors read/write …
```

## Key entry points to read first

- Backend bootstrap: `app.py` bottom (`app = create_app(...)`, ~line 4166) and the `create_app` factory (line 744).
- The bridge: `app.py:794` (`ws_endpoint`) and the pool routes `app.py:1749–1933`.
- The pool: `server.py:1012` (`AgentPoolEntry`), `server.py:1410` (`AgentPool`), singleton at `server.py:1538`.
- Session config generation: `server.py:79` (`_write_session_config`).
- Frontend: `src/routes/_app/agent.tsx` (connect `:5049`, SSE `:5122`, message handler `:4801`).
