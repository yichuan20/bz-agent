# workspace-backend

BoltzAgent's workspace backend — a FastAPI service that wraps the `bzcode` CLI agent
so one server can create and manage many agent sessions. Managed with **uv** on
**Python 3.14**.

See [`../docs/08-refactor-plan-m1.md`](../docs/08-refactor-plan-m1.md) for the
architecture and roadmap.

## Setup

```bash
uv sync
```

## Run (dev)

```bash
uv run uvicorn workspace_backend.app:app --reload --port 18789
```

`create_app()` remains a factory (tests build isolated apps); `app.py` also exposes a
module-level `app` for the uvicorn import string above.

Configuration comes from the environment (or a `.env` file); see
[`.env.example`](.env.example). Key vars: `BZ_HOME`, `BZCODE_CWD`, `BZCODE_PATH`,
`PORT`, `AGENT_IDLE_TIMEOUT`, `LOG_LEVEL`.

- `GET /healthz` — liveness probe (unprefixed)
- `GET /api/v1/version` — backend version
- `GET /docs` — Swagger UI

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
