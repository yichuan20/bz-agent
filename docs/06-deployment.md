# 06 — Deployment & Versioning

The authoritative, detailed guide is [`DEPLOY.md`](../DEPLOY.md) in the repo
root — it is accurate and current. This doc summarizes it and adds the build /
versioning details.

## Runtime shape

- **One FastAPI/uvicorn process, one port** (default **18789**). It serves the
  API, the agent bridge (SSE + `/ws`), and the built SPA (`dist/`) together.
- **Single worker only.** In-memory state (`AgentPool._entries`,
  `_active_sessions`, `_token_stats`, WebSocket/SSE connections) is not shared —
  **never** run `--workers N` or multi-worker gunicorn.
- `bzcode` is installed **separately** on the machine's `PATH` (e.g.
  `/usr/local/bin/bzcode`); the deploy zip does **not** contain the binary, only
  `bzcode_assets/` (scripts + templates).

## Directory layout (convention: `/opt/boltzagent`)

```
/opt/boltzagent/
├── app.py, server.py, ppt_layout.py, agent_modes.json, requirements.txt
├── bzcode_assets/{scripts,templates}/
├── dist/                     # built SPA
├── server_data/
│   ├── widgets/              # widget library (shipped)
│   └── credentials.json      # API keys/secrets — set manually, never in the zip
├── scripts/boltzagent.service
└── .venv/                    # created on the server
/usr/local/bin/bzcode         # binary, installed separately
/home/boltzagent/workspace/   # user workspace (BZCODE_CWD) — must be writable
/usr/local/boltzbit/          # BZ_HOME — credentials, sessions, settings
```

## Environment variables

| Var | Default | Required | Purpose |
|---|---|---|---|
| `BZCODE_CWD` | process cwd | yes | Default working dir for sessions (must be writable by the service user). Passed as the subprocess `cwd`, **not** as a bzcode env var. |
| `BZ_HOME` | `/usr/local/boltzbit` | yes | bzcode home — credentials, sessions, settings. Must be writable. |
| `PORT` | `18789` | no | HTTP + SSE/WS port. |
| `BZCODE_PATH` | (resolve via `PATH`) | no | Only if bzcode isn't on `PATH`. |
| `BZCODE_DIST` | — | no | Path to the built SPA. |
| `AGENT_IDLE_TIMEOUT` | `300` | no | Seconds before an idle pooled agent is reaped. |
| `TWILIO_*` | — | no | WhatsApp integration. |

> ⚠️ Do **not** set `BZCODE_CWD=/opt/boltzagent` — that dir is root-owned and
> user file ops would silently fail (see `DEPLOY.md` §3f).

## Build & packaging

Two overlapping build scripts exist (⚠️ consolidate them):

- **`deploy.sh`** (root) — `pnpm build` → sanity-check `dist/assets` → zip into
  `bz-agent-v<VERSION>.zip`. Version defaults to `BACKEND_VERSION` grepped from
  `server.py`. Bundles `app.py`, `server.py`, `requirements.txt`,
  `agent_modes.json`, `dist/`, `bzcode_assets/`, `server_data/widgets/`.
- **`scripts/build-deploy.sh`** — similar, but also bundles `ppt_layout.py`,
  `CHANGELOG.md`, and ⚠️ **`server_data/credentials.json`** (shipping
  credentials inside the artifact — a security problem; `deploy.sh` does not do
  this).
- **`scripts/build-and-serve.sh`** — local dev: `pnpm build` then
  `python app.py --dist ./dist`.

The frontend is built locally; only compiled `dist/` ships. Node is not needed
on the server.

## Systemd

`scripts/boltzagent.service` runs:
```ini
ExecStart=/opt/boltzagent/.venv/bin/uvicorn app:app --host 0.0.0.0 --port 18789
Environment=BZCODE_CWD=/home/boltzagent/workspace
Environment=BZ_HOME=/usr/local/boltzbit
Environment=PORT=18789
```
Manual start: `python app.py --cwd <workspace> --dist ./dist`.

## Vite / frontend build

`vite.config.ts`: TanStack Router plugin (`autoCodeSplitting`) + React, dev port
5010 (README/`package.json` also mention 3000 — inconsistent), build to `dist/`,
chunk-size warning raised to 1500 KB, pre-bundles `recharts`.

## Versioning

- Two hand-maintained sources kept in sync: `server.py` `BACKEND_VERSION` and
  `src/version.ts` `FRONTEND_VERSION` (both currently `0.6.4`). ⚠️ No automation
  ties them together.
- Version format (from `DEPLOY.md`): `xx.xx.xx` = release (frontend & backend
  **must match exactly**); `xx.xx.xx.yy` = dev (sides may differ; `yy` is a
  per-side counter).
- Reported at startup and via `GET /api/version`, which also returns the running
  `bzcode` version (parsed from the binary) and `bzcode_latest` (polled from
  BoltzHub).

## Python dependencies (`requirements.txt`)

`fastapi==0.124.4`, `uvicorn[standard]==0.33.0`, `aiohttp==3.10.11`,
`asyncpg==0.30.0` (⚠️ **unused** — no DB connection is ever made),
`websockets==13.1`, `pydantic==2.10.6`, plus office libs (`pypdf`,
`python-docx`, `lxml`, `openpyxl`, `python-pptx`, `formulas`, `xlsxwriter`) and
`python-multipart`.

## Verification after deploy

```bash
curl http://<host>:18789/api/version          # {"backend":"0.6.4", ...}
curl http://<host>:18789/agent-modes          # mode list
curl "http://<host>:18789/files?path=<cwd>"   # dir listing
open  http://<host>:18789/                     # SPA
```
See `DEPLOY.md` §12 for a full troubleshooting table.
