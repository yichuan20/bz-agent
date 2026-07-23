# workspace-backend

BoltzAgent's workspace backend — a FastAPI service that wraps the `bzcode` CLI agent
so one server can create and manage many agent sessions. Managed with **uv** on
**Python 3.14**.

This is the ground-up refactor of the original root-level `app.py` + `server.py`.
See [`../docs/08-refactor-plan-m1.md`](../docs/08-refactor-plan-m1.md) for the full
architecture and roadmap, and [`docs/migration-old-to-new.md`](docs/migration-old-to-new.md)
for the old→new endpoint map (for adapting the frontend).

## Architecture

Hexagonal / ports-and-adapters — `api → services → domain(ports) ← infra`. Business
logic depends only on `domain` ports; `infra` implements them; the API layer wires
concrete impls to ports. The agent pool speaks only `asyncio.Queue` (no web-framework
imports); the SSE wire format lives in the API layer.

```
src/workspace_backend/
  app.py            create_app() + lifespan; mounts routers, CORS, exception handlers
  config.py         pydantic-settings (env vars)
  domain/           models, ports (Protocols), bzcode protocol vocabulary — framework-free
  services/
    agent_pool/     pool, runtime (one bzcode process), dispatcher (pure), buffer (pure)
    agent_service, credential_service, mode_service, config_writer, model_service, file_service
  infra/
    process.py      subprocess spawn + env
    reader.py       stdout/stderr readers
    storage/filesystem/   FS impls of the storage ports (Postgres sibling later)
  api/
    routes/         agents, auth, modes, files, health, version
    deps.py, context.py, sse.py, schemas.py, exception_handlers.py
tests/              unit (pure logic), integration (pool vs. fake bzcode), e2e (HTTP)
```

## Setup

```bash
uv sync
```

## Run (dev)

```bash
uv run uvicorn workspace_backend.app:app --reload --port 18789
```

`create_app()` is a factory (tests build isolated apps); `app.py` also exposes a
module-level `app` for the uvicorn import string above. **Single process only** — the
server holds in-memory state (the agent pool), so do not run multiple workers.

## Configuration

From the environment (or a `.env` file — see [`.env.example`](.env.example)):

| Var | Default | Purpose |
|---|---|---|
| `BZCODE_CWD` | process cwd | Default working directory for agent sessions (must be writable). |
| `BZ_HOME` | `/usr/local/boltzbit` | bzcode home: `api_keys.json` (login) + `sessions/` (transcripts + per-agent config). Must be writable. |
| `BZCODE_PATH` | `bzcode` | bzcode binary name/path (resolved via `PATH`). |
| `BZ_DATA_ROOT` | package dir | Directory holding `agent_modes.json`, `bzcode_assets/`, and `server_data/` (vendored). Override in deployment. |
| `AGENT_IDLE_TIMEOUT` | `300` | Seconds a client-less idle agent lives before the sweeper reaps it (reconnect respawns it). |
| `LOG_LEVEL` | `INFO` | DEBUG / INFO / WARNING / ERROR. |

The HTTP port/host are **uvicorn's** concern (its `--port` / `--host` flags), not app
config — the app object is imported by uvicorn, which binds the socket.

**Auth:** set a `BZ_API_KEY` before starting an agent —
`PUT /api/v1/auth/api-key {"value": "..."}` (writes `$BZ_HOME/api_keys.json`).

## API surface (Milestone 1)

All API routes are under `/api/v1`; `/healthz` is unprefixed. Full, self-documenting
schema at `GET /openapi.json` / `GET /docs`.

- **Agents:** `POST/GET /api/v1/agents`, `GET/PATCH/DELETE /api/v1/agents/{id}`,
  `POST …/{id}/connect`, `POST …/{id}/stop`, `GET …/{id}/events` (SSE),
  `GET/POST …/{id}/messages`, `GET /api/v1/agents/status`, `PUT /api/v1/defaults`
- **Auth:** `GET/PUT/DELETE /api/v1/auth/api-key`
- **Secrets (widget placeholders):** `GET/PUT /api/v1/secrets`, `DELETE …/{key}`
- **Modes/models:** `GET /api/v1/modes`, `POST /api/v1/modes/classify`,
  `GET /api/v1/models`
- **Files:** `GET/PUT/DELETE /api/v1/files`, `GET /api/v1/files/content`,
  `POST /api/v1/files/mkdir`
- **System:** `GET /healthz`, `GET /api/v1/version`

**Agent lifecycle:** `POST /api/v1/agents` (create) →
`POST /api/v1/agents/{id}/connect` (start runtime) →
`GET /api/v1/agents/{id}/events` (SSE) + `POST /api/v1/agents/{id}/messages` (send).
History via `GET /api/v1/agents/{id}/messages`; on reconnect open `/events` first.

## Checks

Run in this order — format first so the linter sees formatted code:

```bash
uv run ruff format         # format (like Black)
uv run ruff check --fix    # lint + autofix (import sorting, etc.)
uv run mypy                # static type checking (strict) — ruff does NOT do this
uv run pytest              # tests
```

`mypy` is not redundant with `ruff`: ruff is a linter/formatter (fast, per-file AST
patterns); mypy does whole-program type inference. It's what enforces that the
filesystem stores actually satisfy the `domain/ports.py` Protocols — the seam that
lets Postgres drop in later.

### Testing notes

- **Unit** tests cover the pure logic (dispatcher, turn buffer, services) with no I/O.
- **Integration** tests drive the real `AgentPool` against a fake bzcode stub
  (`tests/fakes/fake_bzcode.py`) — real subprocess + stdio, deterministic.
- **e2e** tests hit the HTTP layer. SSE streaming can't be tested through
  `httpx.ASGITransport` (it buffers), so those use a real uvicorn `live_server`
  fixture over a socket. `pytest-timeout` guards against any stream that fails to
  terminate.
