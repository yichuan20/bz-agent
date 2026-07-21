# Refactor Plan — `workspace-backend/` (Milestone 1: Core Agent Path)

## Context

BoltzAgent is a FastAPI service that wraps the external `bzcode` CLI agent so one server can create and manage many agent sessions. Today the backend is two rushed god-files — `app.py` (4,182 lines, FastAPI routing + inline document rendering) and `server.py` (2,717 lines, all business logic + in-memory state + the `AgentPool`). It works but is hard to test, extend, or reason about: nested-closure routes, module-global state, a 400-line `AgentPoolEntry` welding subprocess I/O to protocol parsing to a state machine to WebSocket glue, dead code (the aiohttp `/ws` shim), and no tests.

**Goal:** rebuild the backend cleanly in a new `workspace-backend/` folder, leaving all existing files untouched. Python stays, now managed by **uv** on **Python 3.14** (verified: all deps — including `formulas`, `lxml`, `numpy 2.5.1`, `scipy 1.18.0`, `asyncpg`, `aiohttp`→`httpx` — resolve cleanly on 3.14). We start with the **core agent path** and lay a structure the rest of the system ports into over later milestones.

This plan covers **Milestone 1 only**, in 5 reviewable phases, plus a roadmap sketch (M2–M5) and the frontend-tooling follow-up.

### Decisions locked with the user
- **API:** clean redesign, **`/v1` prefix**, a **single `agent` resource** (`/v1/agents/{id}`) — the frontend thinks in terms of "agents," so that is the public noun. Creating an agent returns an id; you connect, stream, and send against that same id. **Transcript fetched separately** via `GET /v1/agents/{id}/messages`. A migration doc (old→new) is a deliverable so the frontend can be adapted later.
- **Durable vs. live is an internal detail, not a URL concept.** A "session" in the current code is really two things fused: the *durable record* (id + transcript + config on disk, exists forever) and the *live runtime* (the `bzcode` subprocess, spawned on connect and reaped after an idle timeout, respawned on reconnect). The API exposes one `agent` resource; whether a process is currently live is just a `runtimeStatus` field, and activating/stopping the runtime are sub-path actions (`/connect` / `/stop`). The pool's spawn/reap/respawn machinery is unchanged — it just isn't reflected in the path hierarchy.
- **Action syntax:** plain sub-path verbs (`POST /v1/agents/{id}/connect`, `/stop`; `GET /v1/agents/status`; `POST /v1/modes/classify`) — the widely-used, no-special-characters convention, over the Google-AIP `resource:verb` colon form.
- **Naming inside the code:** public + service + domain layers use **`Agent`** (durable record) and **`AgentRuntime`** (the live pooled process). The word "session" survives only at the bzcode boundary (`infra/process` + `storage/paths`), because that is bzcode's own vocabulary (`--resume <sessionId>`, `sessions/{id}.jsonl`) and we must speak its protocol there.
- **Milestone 1 scope:** core agent path only — AgentPool + sessions + bzcode bridge (SSE) + auth (BZ_API_KEY) + agent-modes/models + basic file APIs. Documents, widgets, BoltzHub, WhatsApp are later milestones.
- **Persistence:** file-based, behind **Protocol-based repositories** (ports in `domain/`, filesystem impls in `infra/storage/`). No DB now; Postgres drops in later with zero service changes.
- **Transport:** **drop the legacy `/ws`** (the shipping frontend already uses SSE; the `useBzcodeChat` WS hook is imported nowhere). This removes the aiohttp shim and the aiohttp dependency.
- **Logging:** **structured logging from Phase 1** (stdlib `logging`, level via `LOG_LEVEL`), replacing the ~100 `print(..., file=sys.stderr)` calls.
- **Tests:** written alongside each phase (pytest + `httpx.AsyncClient` + a fake bzcode stub).
- Work happens on the existing `jinli-refactor` branch; `workspace-backend/` already exists and is empty.

---

## Target architecture (hexagonal / ports-and-adapters)

Dependency direction: `api → services → domain(ports) ← infra`. Business logic depends only on `domain` ports; `infra` implements them; `api/deps.py` wires concrete impls to ports. The AgentPool has **zero web-framework imports** — it speaks only `asyncio.Queue`; the SSE wire format lives in the API layer.

```
workspace-backend/
  pyproject.toml                 # uv-managed, py3.14
  README.md
  src/workspace_backend/
    __main__.py                  # `python -m workspace_backend` → reads Settings, runs uvicorn
    app.py                       # create_app(): lifespan (pool + httpx), routers, CORS, exc handlers
    config.py                    # pydantic-settings Settings
    logging.py                   # structured logging setup
    errors.py                    # domain exceptions (ProbeSessionRejected, AgentDead, …)
    domain/
      models.py                  # Agent, AgentRuntimeStatus, Mode, ModelInfo
      ports.py                   # Protocols: AgentStore, TranscriptStore,
                                 #   ApiKeyStore, SecretStore, ModeConfigStore
      protocol.py                # bzcode stdio message vocabulary (enums/TypedDicts)
    services/
      agent_pool/
        pool.py                  # AgentPool: registry of live runtimes, get_or_create,
                                 #   remove, flush_all, idle sweeper, status
        runtime.py               # AgentRuntime (was AgentPoolEntry): one live process
                                 #   + subscriber fan-out (subscribe/unsubscribe)
        dispatcher.py            # stdout state machine — PURE, unit-testable
        buffer.py                # TurnBuffer: seed/append/clear-on-boundary/replay-skip
      agent_service.py           # list/create/delete/title/default + resolve_cwd()
                                 #   (durable agent records)
      credential_service.py      # BZ_API_KEY read/write + validity; widget secrets store
      mode_service.py            # load agent_modes.json, classify, compile(mode,model) — pure
      config_writer.py           # write compiled config into agent's dir (I/O)
      model_service.py           # /v1/models cache
      file_service.py            # basic file read/write/list
      runtime_state.py           # replaces _active_sessions/_running_sessions/_token_stats globals
    infra/
      process.py                 # spawn (create_subprocess_exec, 16MB limit, injectable) + env build
      reader.py                  # stdout/stderr readers (16MB drop, auth-keyword scan)
      http.py                    # shared httpx.AsyncClient factory
      storage/
        filesystem/              # (postgres/ sibling added when that milestone lands)
          agents.py              # FsAgentStore + FsTranscriptStore
          credentials.py         # FsApiKeyStore (BZ_API_KEY) + FsSecretStore (widget secrets)
          modes.py               # FsModeConfigStore
          paths.py               # BZ_HOME/sessions layout (bzcode's on-disk vocabulary)
    api/
      deps.py                    # Depends() providers reading a typed app.state.ctx
      sse.py                     # Queue → SSE frame encoder (data:/: ping)
      schemas.py                 # pydantic v2 request/response DTOs
      routes/
        health.py                # GET /healthz, /readyz
        agents.py                # agents CRUD + connect / stop / events(SSE) /
                                 #   messages(GET transcript, POST send) / status
        auth.py                  # BZ_API_KEY login + apikey-status; /v1/secrets
        modes.py                 # modes, models, classify
        files.py                 # basic file APIs
        version.py               # GET /v1/version
  tests/
    conftest.py                  # fixtures: tmp BZ_HOME, fake bzcode, AsyncClient
    fakes/
      fake_bzcode.py             # stub executable that speaks the stdio protocol
      in_memory_stores.py        # in-memory port impls for fast service tests
    unit/                        # test_buffer, test_dispatcher, test_credential_service,
                                 #   test_agent_service, test_config_writer
    integration/                 # test_pool_lifecycle (spawn/reconnect/idle/16MB/stderr-auth)
    e2e/                         # test_agent_flow (connect→send→events→reconnect)
  docs/
    migration-old-to-new.md      # old endpoint → new endpoint map + body deltas
```

**Lean file structure (~22 modules):** the 4 layers and the pure `dispatcher`/`buffer` split are kept (they carry the real test wins), but bootstrap ceremony is collapsed: `create_app()` + `lifespan` + exception handlers live together in `app.py` (no separate `app_factory.py`/`lifespan.py`/`exception_handlers.py`); the subscriber fan-out folds into `runtime.py`; process spawn + env-building is one `process.py`. `mode_service` (pure compile) and `config_writer` (I/O) stay separate for the pure/side-effecting seam. `infra/storage/filesystem/` keeps its subfolder so a `postgres/` sibling drops in later without moving files.

### Why this structure (vs today)
- **`agent_pool` decomposed** so `dispatcher.py` and `buffer.py` — which hold every behavior that MUST be preserved (per-turn replay, spurious-idle handling, yolo auto-approve) — become pure, unit-testable units instead of being welded to a live subprocess and module globals. This is the single highest-value change.
- **`infra/` names the "talks to OS/disk/network" tier** (subprocess, filesystem, httpx), keeping `services/` logic-focused.
- **Ports in `domain/`** so a future `infra/storage/postgres/` satisfies the same interfaces with zero service edits.
- **No DI container** — FastAPI `Depends` + a small `deps.py` reading a typed `app.state.ctx` is enough. Singletons are built in `lifespan`, not module globals.

---

## Milestone 1 — REST surface (with old→new migration map)

`/v1` prefix; **one `agent` resource**. The durable record and the live runtime are the same resource to the client; runtime state is a field, and starting/stopping the process are sub-path actions (`/connect` / `/stop`).

| New (M1) | Method | Replaces (old) |
|---|---|---|
| `/healthz`, `/readyz` | GET | (new) — readyz checks bzcode binary + creds |
| `/v1/version` | GET | `GET /api/version` (app.py:966) |
| `/v1/agents` | GET | `GET /sessions` (1637) |
| `/v1/agents` | POST | `POST /sessions/create` (1690); `?prewarm=true` |
| `/v1/agents/{id}` | GET | (was implicit in `/sessions`) — metadata + `runtimeStatus` |
| `/v1/agents/{id}` | DELETE | `DELETE /sessions/{id}` (1673) — deletes durable record |
| `/v1/agents/{id}` | PATCH | `POST /sessions/{id}/title` (1683) — title only (model switch is a slash command, see note) |
| `/v1/agents/{id}/messages` | GET | (was embedded in connect response) transcript fetch |
| `/v1/agents/{id}/connect` | POST | `POST /api/pool/connect` (1753) — ensure runtime live → status + caps |
| `/v1/agents/{id}/stop` | POST | pool.remove (was implicit idle-only) — kill runtime, keep record |
| `/v1/agents/{id}/events` | GET (SSE) | `GET /api/pool/{id}/stream` (1857) |
| `/v1/agents/{id}/messages` | POST | `POST /api/pool/{id}/send` (1897) — send msg / reply / `/model` slash cmd |
| `/v1/agents/status` | GET | `GET /api/pool/status` (1749) — ops snapshot of live runtimes |
| `/v1/defaults` | PUT | `POST /session-default` (1663) |
| `/v1/auth/api-key` | GET / PUT / DELETE | `GET /api/apikey-status` (974) / `POST /agent-key` (1316) / `DELETE /agent-key/{name}` (1338) — **the login path** |
| `/v1/secrets` | GET / PUT | `GET /credentials` (1266) / `POST /credentials` (1276) — widget secret placeholders |
| `/v1/secrets/{key}` | DELETE | `DELETE /credentials/{key}` (1285) |
| `/v1/user` | GET | `GET /api/user/me` (988) |
| `/v1/modes` | GET | `GET /agent-modes` (1934) |
| `/v1/modes/classify` | POST | `POST /api/classify-mode` (1019) |
| `/v1/models` | GET | `GET /api/models` (1968) |
| `/v1/files` | GET / PUT / DELETE | `GET /files`+`GET /api/file` / `PUT /api/file` / `DELETE /api/file` |
| `/v1/files/mkdir` / `/rename` / `/duplicate` / `/upload` | POST | `/api/file/*` (2040+) |
| `/v1/files/download`, `/v1/files/view` | GET | `GET /api/file/download` (2074) / `GET /api/file/view` (2089) |

> **Usage audit (against the current `src/`).** The table was trimmed to what the frontend actually calls, plus a few deliberately-kept additions:
> - **Authentication is `BZ_API_KEY` only.** There are three easily-confused stores: (1) `$BZ_HOME/credentials.json` = bzcode **OAuth** tokens, written by the old `POST /auth` — **the web FE never calls it**; (2) `$BZ_HOME/api_keys.json` = `BZ_API_KEY`, written by `POST /agent-key` — **this is the actual login** ([login.tsx:36](../src/routes/login.tsx#L36)); (3) `server_data/credentials.json` = **widget secret placeholders** (e.g. `OPENAI_API_KEY`), the `/credentials` store. **M1 drops the OAuth store entirely** (no `POST /auth`, no `/auth/logout`, no `GET /auth/status`, no `$BZ_HOME/credentials.json`). `credential_service` validity check simplifies to "is `BZ_API_KEY` present." Login = `/v1/auth/api-key`.
> - **Renamed** the widget placeholder store to **`/v1/secrets`** (was `/credentials`) so it can't be mistaken for bzcode login. Actively used by `settings.tsx` and `agent.tsx`.
> - **Dropped** `POST /api/sessions/{id}/model` — the FE switches models by sending a `/model <id>` **slash command through the message channel**, not REST. Model switching therefore rides `POST /v1/agents/{id}/messages`; `PATCH` handles title only.
> - **Dropped** `GET /agent-keys` (list) and `GET /api/apikey-verify` — never called (`apikey-verify` is only referenced by `TopBar.tsx`, which the app layout doesn't render).
> - **Kept despite not being called today** (your call): the create-only `POST /v1/agents` (see note below), `GET /v1/agents/status` (ops), and `GET /v1/agents/{id}` (single-get) — all useful for the new FE + monitoring.
> - **Create vs. connect stay separate.** Note: today the FE never calls `/sessions/create`; it mints a new agent implicitly by `POST /api/pool/connect` with no id. We keep them separate anyway — `POST /v1/agents` mints the durable record (optionally `?prewarm=true`), `POST /v1/agents/{id}/connect` activates — so the new FE can pre-create + pre-warm. The migration doc must flag that the old implicit-create-on-connect behavior is replaced by explicit create.
> - `/v1/agents/{id}` (GET/DELETE/PATCH) is the durable record; `/connect`, `/stop`, `/events`, `/messages` are runtime sub-paths. Reserved sub-path names can't collide with ids (server-minted `bz-<hex>`).

**Deferred (documented in migration doc as "not yet ported"):** `/ws`, `/api/doc/*`, `/api/excel/*`, `/api/ppt/*`, `/canvas`, `/widgets`, `/custom-widgets`, `/db/*`, `/boltzhub/*`, `/batch`, `/whatsapp/*`, `/proxy`, `/search`, `/shell`, `/api/dev-server/*`, SPA catch-all.

**Deferred behaviors carried forward (tracked so they aren't lost):**
- **Widget-secret `{{KEY}}` substitution.** The secret *store* is done in M1
  (`/v1/secrets`, `SecretStore`), but the *substitution* of `{{OPENAI_API_KEY}}`-style
  placeholders into outbound requests (old `server.py:_resolve(text, creds)` at 628,
  applied in `/proxy` at app.py:1242) is **not** ported — it belongs with `/proxy`
  (M4) and the widget canvas (M3). Port the small `{{KEY}}` regex resolver then.
- **Outbound `workingDir` path stripping.** The old `GET /sessions` stripped the
  absolute-path prefix off each `workingDir` before returning it (app.py:1653-1660),
  exposing only `workspace/foo`. The *inverse* (relative→absolute rebuild) is already
  ported (`agent_service.resolve_cwd`, `file_service._resolve`). Decide when wiring
  `GET /v1/agents` in Phase 4 whether to keep this leaky presentation transform or
  return absolute paths; note the choice in the migration doc.
- **File API traversal guard (done early in Phase 3).** `file_service._resolve`
  confines every path to the workspace root (parent of the default cwd), rejecting
  `..`/absolute/symlink escapes — hardening the original, which relied on the gateway.
  `agent_service.resolve_cwd` is intentionally *not* confined (session working dirs
  are user-chosen at create time); revisit if that trust model changes.

### API self-documentation standard (first-class deliverable)

The generated **OpenAPI schema (`/openapi.json`) and Swagger UI (`/docs`) must be good enough that a FE client or an LLM can work against the server from the schema alone.** This is a requirement of every route, not a cleanup pass. Concretely:

- **App metadata:** `FastAPI(title, version=BACKEND_VERSION, description=…, summary=…)` with a top-level description covering auth (`BZ_API_KEY`), the agent lifecycle (create → connect → events/messages), and the SSE event vocabulary.
- **Every route:** a concise `summary` (imperative, one line) + a `description` docstring explaining what it does, when to call it, and how it relates to sibling routes (e.g. "call after `POST /v1/agents/{id}/connect`"). Use OpenAPI **tags** grouping routes (Agents, Auth, Modes, Files, Secrets, System).
- **Typed models everywhere:** all request/response bodies are pydantic v2 models in `api/schemas.py` (no bare `dict`/`Request.json()` handlers), with `Field(description=…, examples=[…])` on non-obvious fields and `model_config = {"json_schema_extra": {"examples": [ … ]}}` giving at least one realistic full example per model. Declare `response_model=` and non-200 `responses={401: …, 404: …, 410: …}` so error shapes are in the schema.
- **SSE endpoint** (`/events`, not JSON-typed by FastAPI): document the event frame format and the message-`type` union in its description, since the schema can't express the stream body. Reference `domain/protocol.py` types.
- **Enums over free strings** for `mode`, `runtimeStatus`, message `type`/`subtype` so valid values appear in the schema.
- **Verification:** a test asserts `/openapi.json` builds and every route has a `summary` + `description` and a `response_model` (fails CI otherwise). The migration doc links each new endpoint to its `operationId`.

---

## Milestone 1 — the 5 phases (each independently reviewable/mergeable)

**Phase 1 — Skeleton, config, ports, health.** `pyproject.toml` (uv, py3.14, `httpx` not `aiohttp`, no `asyncpg`), package skeleton, `config.py` (pydantic-settings: `BZCODE_CWD`, `BZ_HOME`, `PORT`, `BZCODE_PATH`, `AGENT_IDLE_TIMEOUT`, `LOG_LEVEL`), `logging.py`, `app.py` (`create_app` + lifespan stub, no pool yet), `domain/{models,ports}.py`, `errors.py`, `api/routes/health.py`. Tests: settings load from env; `GET /healthz` returns 200. **Gate: app boots.**

**Phase 2 — Process adapter + AgentPool core (NO HTTP). Highest risk — do fully tested before any HTTP.** `infra/{process,reader}.py`, `domain/protocol.py`, `services/agent_pool/*`. Port, preserving exactly (ref `server.py`):
- process lifetime decoupled from connections; reconnect to same sessionId;
- `TurnBuffer` seed-on-send / clear only on running→idle (not spurious idles) / replay skipping already-answered prompts (server.py:1204-1240);
- subscriber fan-out over `asyncio.Queue` (1210-1249);
- yolo auto-approve of permission prompts (1154-1173);
- idle sweeper reaps clientless idle agents after `AGENT_IDLE_TIMEOUT` (1492);
- stdout lines >16 MB dropped (2489-2497); stderr auth-keyword → `auth_error` (2550-2574); `setMode` sent once bzcode is ready (1089-1099);
- `bz-probe-*` sessions rejected from the pool (1450). `spawn` is injectable so unit tests need no binary. `tests/fakes/fake_bzcode.py` is a real stub executable driven by stdin (deterministic). Tests: pure dispatcher/buffer unit tests; integration spawn/reuse/reject-probe/reconnect-replay/ idle-sweep/16MB-drop/stderr-auth.

**Phase 3 — Storage impls + non-agent services (parallelizable with Phase 2; shares only `domain/ports.py`).** `infra/storage/filesystem/*` implementing the ports; `agent_service` (durable agent records: list/create/delete/title/default, incl. `resolve_cwd()` porting the subtle absolute/relative/stored-workingDir fallback at app.py:1765-1799), `credential_service` (read/write `BZ_API_KEY` in `api_keys.json`; validity check = "is `BZ_API_KEY` present", the simplified form of `_credentials_valid` 796-826; plus the widget-secret store for `/v1/secrets`), `mode_service` + `config_writer` (split the 170-line `_write_session_config` at server.py:79-251 into a **pure** `compile(mode, model) → CompiledConfig` and an **I/O** `write(...)` that mkdirs, purges non-owned files 97-115, copies scripts/templates, selects boltzbit/generic variants 87-88), `model_service`, `file_service`, and `runtime_state.py` replacing the `_active_sessions`/`_running_sessions`/`_token_stats` globals. Tests against both in-memory fakes and tmp-dir FS stores.

**Phase 4 — API layer wiring.** `api/{deps,schemas,sse}.py` + `api/routes/*`; mount routers, CORS, and domain-exception handlers in `app.py`; wire `pool.start()/stop()` and the shared `httpx.AsyncClient` into the `app.py` lifespan. **Every route ships with the self-documentation standard above** (summary + description + typed `response_model` + examples + tags). Tests: e2e via `httpx.AsyncClient` against the fake bzcode — `/connect` → send → read SSE frames → reconnect mid-turn → receive replayed prompt; auth gating (401 when no `BZ_API_KEY`, mirroring app.py:1816-1827); plus an `/openapi.json` completeness test (every route has summary/description/response_model).

**Phase 5 — Migration doc + verification.** `docs/migration-old-to-new.md` (the table above, expanded with request/response body deltas), `README.md` with uv commands, optional parity test, and a smoke run against the **real** bzcode binary if available.

---

## Later milestones (roadmap sketch — not part of this approval)

- **M2 — Document workbench** (`/api/doc|excel|ppt/*`): biggest LOC (app.py 2245-3450 + `ppt_layout.py` + docx/xlsx logic). Pure functions → `services/documents/`. Depends only on the M1 files layer; independent of the pool. Highest extraction payoff.
- **M3 — Canvas + widgets** (`/canvas`, `/widgets`, `/custom-widgets`, `/db/*`): depends on M1 sessions + a `WidgetStore` port. `/db/widget/{id}/exec` server-side Python is a security-redesign item (sandbox or drop).
- **M4 — BoltzHub** (`/boltzhub/*`, `/proxy`, `/search`): SSE build→deploy pipeline; depends on the httpx client and M3 (deploys canvas apps).
- **M5 — WhatsApp** (`/whatsapp/*`): reuses the M1 AgentPool wholesale (phone-keyed session); narrowest, last.
- **Cross-cutting anytime after M1:** add `infra/storage/postgres/` (+ `asyncpg`) — the payoff of the Protocol design — to persist token stats etc.

**Frontend follow-up (separate track):** uv is Python-only, so "set up frontend with uv" means smooth co-existence with the uv-managed backend — a `just`/`Makefile` (or uv scripts) that runs `pnpm dev` with a Vite dev-proxy to the backend, and wires `pnpm build` output to what the backend serves. The frontend then migrates from the old endpoints to `/v1` per the migration doc. Detailed after M1 lands.

---

## Verification

- **Per phase:** `uv run pytest` green; `uv run ruff check` / `uv run mypy` clean.
- **Phase 1:** `uv run python -m workspace_backend` boots; `curl /healthz` → 200.
- **Phase 2:** pool integration tests pass against `fake_bzcode.py` (no real binary).
- **Phase 4:** e2e connect→send→SSE→reconnect flow passes; 401 gating verified; `/openapi.json` completeness test passes; open `/docs` and confirm every route has a clear summary/description, typed request/response models, and examples.
- **Phase 5:** with a real `bzcode` on PATH + a `BZ_API_KEY`, run `uv run python -m workspace_backend --cwd <workspace>` and drive `POST /v1/agents` → `POST /v1/agents/{id}/connect` → `GET /v1/agents/{id}/events` → `POST /v1/agents/{id}/messages` end-to-end; confirm a live turn streams and a mid-turn reconnect replays.

## Non-goals for Milestone 1
No document/widget/BoltzHub/WhatsApp endpoints; no Postgres; no frontend changes; no edits to existing `app.py`/`server.py`/`src/` (new code lives only in `workspace-backend/`).
