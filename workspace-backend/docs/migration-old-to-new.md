# Migration: old server → `workspace-backend`

Maps every **old** endpoint (`app.py` in the repo root) to its **new** equivalent in
`workspace-backend` (`/api/v1/*`), with request/response deltas. Use this when
adapting the frontend from the old API to the new one.

Status legend: **ported** (available now, M1) · **deferred** (planned, later
milestone) · **dropped** (intentionally removed).

The new server's live contract is always authoritative: run it and read
`GET /openapi.json` or open `/docs`.

---

## Cross-cutting changes

- **Prefix.** All API routes are under **`/api/v1`**; only `/healthz` is unprefixed.
  (Old routes were a flat mix of `/sessions`, `/api/...`, `/files`, etc.)
- **Resource rename.** The public noun is **`agent`**, not `session`. One `agent`
  resource fuses the durable record and the live runtime; runtime state is a field
  (`runtime_status`) and start/stop are sub-path actions. (The word "session"
  survives only at the bzcode boundary — `--resume <sessionId>`, `sessions/*.jsonl`.)
- **Transport.** The production transport is **SSE** (`GET …/events`). The old
  WebSocket `/ws` is **dropped**.
- **Auth.** Login is **`BZ_API_KEY` only** (`PUT /api/v1/auth/api-key`). The old
  OAuth `credentials.json` flow (`POST /auth`, `/auth/logout`, `/auth/status`) is
  **dropped**.
- **Errors.** Failures return `{"error": "<code>", "detail": "<message>"}` with a
  stable `error` code (e.g. `agent_not_found`, `agent_not_live`, `credentials_missing`,
  `invalid_path`) instead of ad-hoc shapes.
- **Field casing.** Response bodies use `snake_case` (e.g. `working_dir`,
  `runtime_status`, `message_count`). The old API mixed `camelCase` (`workingDir`,
  `sessionId`). **This is a breaking rename the FE must handle.**
- **Path handling.** File paths are confined to the workspace root (traversal/symlink
  escapes → 400). The old outbound `workingDir` prefix-stripping in `GET /sessions`
  **is** ported: `GET /api/v1/agents` returns `working_dir` relative to the server's
  workspace root when under it (e.g. `workspace/proj`), absolute otherwise — paired
  with the inverse rebuild on `connect`. Same partial behavior as the old server.

---

## Agent lifecycle

| Old | New | Notes |
|---|---|---|
| `POST /sessions/create` `{cwd, mode}` → `{sessionId}` | `POST /api/v1/agents` `{cwd, mode}` → `{id}` | Creates the durable record + config; does **not** start the runtime. Old auto-created-on-connect; now create is explicit. |
| `GET /sessions` → `{sessions:[…]}` | `GET /api/v1/agents?cwd=` → `{agents:[…]}` | Fields renamed to snake_case; each item has `is_default`. `working_dir` is relativized to the workspace root when under it (like the old server). |
| (implicit in `/sessions`) | `GET /api/v1/agents/{id}` → `AgentSummary` | Single record. `404 agent_not_found` if absent. |
| `DELETE /sessions/{id}` | `DELETE /api/v1/agents/{id}` | Deletes the durable record (transcript). |
| `POST /sessions/{id}/title` `{title}` · `POST /api/sessions/{id}/model` | `PATCH /api/v1/agents/{id}` `{title?}` | Title only. **Model switching dropped as REST** — send `/model <id>` via `POST …/messages` (matches old FE behavior). |
| `POST /api/pool/connect` `{cwd, sessionId, mode}` → `{…, messages, modes, commands}` | `POST /api/v1/agents/{id}/connect` `{cwd?, mode?}` → `{id, cwd, mode, runtime_status, session_mode, pid, modes, commands}` | Starts/attaches the runtime. **No `messages` in the response** — fetch history via `GET …/messages`. `modes`/`commands` are best-effort here (empty on a fresh spawn); they also arrive on the stream. `401 credentials_missing` without a `BZ_API_KEY`. |
| (implicit idle-only) | `POST /api/v1/agents/{id}/stop` | Kills the runtime, keeps the record; next connect respawns via `--resume`. |
| `GET /api/pool/{id}/stream` (SSE) | `GET /api/v1/agents/{id}/events` (SSE) | Same event vocabulary (`session|status|delta|assistant|tool|prompt|result|system`). Carries the **current in-flight turn**; `409 agent_not_live` if not connected, `410 agent_dead` if the process died. |
| `POST /api/pool/{id}/send` `{type,…}` or `{message}` | `POST /api/v1/agents/{id}/messages` `{content}` or `{type, subtype, requestId, behavior, answers, clientId}` | Plain turn via `content`; permission/input replies via the typed fields. `clientId` echoed back for optimistic-UI dedup. |
| (was embedded in connect response) | `GET /api/v1/agents/{id}/messages` → `{messages:[…]}` | **New:** committed history (the `.jsonl` transcript). On reconnect: open `/events` first, then GET this. |
| `GET /api/pool/status` → `{agents:[…]}` | `GET /api/v1/agents/status` → `{agents:[…]}` | Ops snapshot of live runtimes; fields renamed. |
| `POST /session-default` `{cwd, sessionId}` | `PUT /api/v1/defaults` `{cwd, agent_id}` | Blank `agent_id` clears the default. |

## Auth & secrets

| Old | New | Notes |
|---|---|---|
| `POST /agent-key` `{name:"BZ_API_KEY", value}` | `PUT /api/v1/auth/api-key` `{value}` | The login. Flushes live runtimes so they restart with the new key. |
| `GET /api/apikey-status` | `GET /api/v1/auth/api-key` → `{present}` | |
| `DELETE /agent-key/{name}` | `DELETE /api/v1/auth/api-key` | Logout; flushes runtimes. |
| `GET /credentials` · `POST /credentials` | `GET /api/v1/secrets` → `{keys}` · `PUT /api/v1/secrets` `{key, value}` | **Renamed** widget-secret store (was `/credentials`) so it isn't confused with bzcode login. Values never returned. |
| `DELETE /credentials/{key}` | `DELETE /api/v1/secrets/{key}` | |

## Modes, models, misc

| Old | New | Notes |
|---|---|---|
| `GET /agent-modes` → raw config | `GET /api/v1/modes` → `{default, modes:[{id,label,icon,description}]}` | Structured. |
| `POST /api/classify-mode` `{message}` → `{mode}` | `POST /api/v1/modes/classify` `{message}` → `{mode}` | Same LLM routing; falls back to `general`. |
| `GET /api/models?session_id=` → `{models,current}` | `GET /api/v1/models?agentId=` → `{models,current}` | Param renamed `session_id` → `agentId`. |
| `GET /api/version` → `{backend, bzcode, bzcode_latest}` | `GET /api/v1/version` → `{backend}` | bzcode-version reporting not ported in M1. |

## Files

| Old | New | Notes |
|---|---|---|
| `GET /files?path=` · `GET /api/file?path=` | `GET /api/v1/files?path=` (list) · `GET /api/v1/files/content?path=` (read) | List and read split into two paths. Dotfiles + doc sidecars hidden. |
| `PUT /api/file` `{path, content}` | `PUT /api/v1/files` `{path, content}` | |
| `DELETE /api/file?path=` | `DELETE /api/v1/files?path=` | |
| `POST /files/mkdir` · `POST /api/file/mkdir` `{parent, name}` | `POST /api/v1/files/mkdir` `{parent, name}` → `{path}` | |
| `GET /healthz`-style checks (none) | `GET /healthz` → `{status:"ok"}` | **New** liveness probe (unprefixed). |

---

## Deferred (planned, not in M1)

Documented so the FE knows they're coming. Old paths still exist only in the old
server; the new server returns 404 for them today.

- **Documents (M2):** `POST /api/doc/parse`, `PUT /api/doc/save`, `GET /api/doc/*`,
  `GET/PUT /api/excel/*`, `GET/PUT /api/ppt/*`.
- **Widgets & canvas (M3):** `GET/POST /canvas`, `/widgets*`, `/custom-widgets/*`,
  `/db/widget/*`. **Widget-secret `{{KEY}}` substitution** (old `_resolve(text, creds)`)
  lands here + with `/proxy`.
- **BoltzHub (M4):** `/boltzhub/*`, `POST /proxy`, `GET /search`, `GET /api/user/me`.
- **WhatsApp (M5):** `POST /whatsapp/incoming`, `/whatsapp/status`.
- **Misc, TBD:** `GET /shell`, `POST /api/dev-server/start|stop`, `POST /batch`,
  `GET /token-stats`, `GET /settings/*`, `GET /api/file/download|view|upload`,
  `POST /api/file/rename|duplicate`, `GET/PUT /api/doc/cursor`, SPA static serving.

## Dropped (intentional)

| Old | Why |
|---|---|
| `WS /ws` | The production FE already uses SSE; the WS hook was unused. Removes the aiohttp shim. |
| `POST /auth`, `POST /auth/logout`, `GET /auth/status` | OAuth `credentials.json` flow. This backend authenticates via `BZ_API_KEY` only. |
| `POST /api/sessions/{id}/model` | Model switch flows through a `/model <id>` message, not REST (matches the old FE). |
| `GET /agent-keys` (list), `GET /api/apikey-verify` | Unused by the FE. |

---

## Notable behavior deltas the FE must handle

1. **snake_case response fields** throughout (`working_dir`, `runtime_status`, …).
2. **`create` and `connect` have distinct, clean roles.** `POST /api/v1/agents`
   mints the **durable agent record** (writes `meta.json` + config) and fixes its
   `cwd`+`mode`; the agent is immediately listable (`GET /api/v1/agents`) and
   gettable (`GET /api/v1/agents/{id}`) **before any turn runs** — existence is keyed
   on the record, not on a transcript. `POST /api/v1/agents/{id}/connect` only starts
   or re-attaches the runtime; its body is **optional** (`{}`) — `cwd`/`mode` come
   from the record, and are sent only to override. (The old FE minted an agent
   implicitly by connecting with no id and re-sent cwd/mode on every connect; both
   are gone.) An idle-reaped agent is respawned transparently on the next connect
   (`--resume` restores history).
3. **History is a separate fetch.** `connect` no longer returns `messages`; call
   `GET /api/v1/agents/{id}/messages`. Reconnect order: open `/events`, then GET.
4. **Model switching** is a `/model <id>` message on `POST …/messages`, not a REST call.
5. **Widget-secret store renamed** `/credentials` → `/api/v1/secrets`.
6. **Errors** are `{error, detail}` with stable codes.

## The old frontend will 404 against this backend

The current `src/` frontend polls **old** paths on timers — e.g. `GET /sessions`
(Sidebar, every 30s) and `GET /api/apikey-status` (Sidebar/TopBar, every 60s). Those
moved: `/sessions` → `GET /api/v1/agents`, `/api/apikey-status` →
`GET /api/v1/auth/api-key`. Until the frontend is migrated per this doc, expect a
steady stream of harmless 404s in the logs from the stale poll loops.
