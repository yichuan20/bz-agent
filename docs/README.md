# BoltzAgent (`bz-agent`) — Architecture & Code Review

> Written 2026-07-21 as a hand-over review of the repo. It documents **what the code actually does today** (version 0.6.4), not what the boilerplate README claims. Where the two disagree, this doc is the source of truth.

## What this repo is

`bz-agent` (product name **BoltzAgent**) is a **single-process backend service with a bundled web UI** that wraps the [`bzcode`](../../Repos/bzcode) terminal coding agent so that one server can **create and manage many agent sessions** on a remote machine. Each session is a long-lived `bzcode` subprocess driven over stdio; the server exposes those sessions to a browser (or mobile / WhatsApp) client and layers a large amount of product functionality on top:

- **Agent modes / personas** — 24 named modes (4 base + 20 professional profiles) that reconfigure each session's identity, behaviour, and tools.
- **A document workbench** — server-side parse/edit/save of Word, Excel, PowerPoint and PDF, with matching rich WYSIWYG editors in the frontend.
- **A widget canvas** — sandboxed vanilla-JS "widgets" the agent can generate and place on a per-session dashboard.
- **BoltzHub app-building** — the agent can scaffold, provision (database, API gateway, remote-python), and deploy full apps to Boltzbit's cloud.

It is deployed as **one FastAPI/uvicorn process on one port (default 18789)** that serves the API, the agent bridge, and the built SPA together. No Docker, no nginx, no multi-worker.

```
Browser SPA  ──HTTP + SSE──►  FastAPI (app.py)  ──stdio──►  bzcode subprocess (per session)
(src/, dist/)                 business logic       AgentPool      │
                              (server.py)                         ├─ reads session config
                                                                  │  (IDENTITY.md/SOUL.md/
                                                                  │   settings.json/skills)
                                                                  └─ calls helper scripts
                                                                     (bzcode_assets/scripts)
                                    │
                                    ├──►  Boltzbit cloud (BoltzHub / Dynas / Anksy / dpyes)
                                    └──►  Twilio (WhatsApp)
```

## Documentation map

| Doc | Contents |
|---|---|
| [01 — System Overview](./01-system-overview.md) | The big picture: components, request flow, process model, the bzcode relationship |
| [02 — Backend](./02-backend.md) | `app.py` + `server.py`: routers, the full API surface, the AgentPool, sessions, document/widget/db subsystems |
| [03 — Agent Modes & bzcode Assets](./03-agent-modes-and-assets.md) | `agent_modes.json`, session config generation, the helper scripts and templates the agent uses as tools |
| [04 — Frontend](./04-frontend.md) | The React SPA: routing, the two chat stacks, editors, theming, how it talks to the backend |
| [05 — Integrations](./05-integrations.md) | BoltzHub, Dynas, Anksy, dpyes, WhatsApp, and the workspace reverse-proxy deployment model |
| [06 — Deployment & Versioning](./06-deployment.md) | Build/package/deploy, env vars, systemd, versioning |
| [07 — Tech Debt & Risks](./07-tech-debt.md) | Consolidated, prioritized list of issues — read this before changing anything |
| [08 — Refactor Plan (M1)](./08-refactor-plan-m1.md) | Approved plan for the `workspace-backend/` rebuild: architecture, `/v1` API surface + migration map, 5 phases, later-milestone roadmap |
| [09 — Refactor Plan (M2)](./09-refactor-plan-m2.md) | Approved plan for the new frontend (`workspace-backend/frontend/`): structure, the extracted chat service, main pages (Home/Agent-chat/Settings), phases, and the resequenced milestone roadmap |

## The 60-second orientation

- **Two Python files hold ~90% of the backend:** `app.py` (4,182 lines, FastAPI routing + document rendering) and `server.py` (2,717 lines, all business logic + the `AgentPool`). `app.py` imports ~50 symbols from `server.py`. `server.py` is *not* runnable on its own.
- **The heart of the frontend is one 6,992-line file:** [`src/routes/_app/agent.tsx`](../src/routes/_app/agent.tsx). It contains the entire live-agent experience (connection state machine, chat, canvas, editor).
- **The production chat transport is SSE + REST**, not WebSocket. The `/ws` WebSocket endpoint and the `useBzcodeChat` hook still exist but are the **legacy path**; the shipping UI uses `POST /api/pool/connect` → `GET /api/pool/{id}/stream` (SSE) → `POST /api/pool/{id}/send`.
- **There is no real database.** `asyncpg` is in `requirements.txt` and there's a `docker-compose.yml` for Postgres, but the server never connects — `app.state.db` is always `None`, `/db/health` always 503, and the "database" is per-widget JSON files on disk.
- **The boilerplate `README.md` is inaccurate.** It was inherited from `bz-app-template` and describes a `docs/` structure, OAuth flow, and packages (`@boltzbit/pebble`, etc.) that don't reflect this repo. Trust *this* `docs/` and [`DEPLOY.md`](../DEPLOY.md) instead.

## Known-good references already in the repo

These existing files are accurate and worth reading alongside this review:

- [`DEPLOY.md`](../DEPLOY.md) — the real, detailed remote-deployment guide.
- [`CHANGELOG.md`](../CHANGELOG.md) — accurate history of backend changes.
- [`stdio-bridge-protocol.md`](../stdio-bridge-protocol.md) — the NDJSON message protocol between the client and `bzcode --stdio` (the thing the SSE/WS bridge wraps).
- [`agent_mode_profiles.md`](../agent_mode_profiles.md) — narrative description of the 20 professional personas.
