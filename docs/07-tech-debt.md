# 07 — Tech Debt & Risks

This repo was rushed. Read this before changing anything. Items are grouped by
priority. File:line references are current as of version 0.6.4.

## 🔴 Security — address first

1. **Hardcoded, git-tracked API key.** The same live-looking key
   `bz_a0XYs3Oid878h7VLt7u4344RhVIsFB0Q` is committed in four places:
   [`scripts/create-dynas-table.py:19`](../scripts/create-dynas-table.py#L19),
   [`scripts/populate-products.py:23`](../scripts/populate-products.py#L23),
   [`scripts/patch-dynas-table.py:26`](../scripts/patch-dynas-table.py#L26),
   and [`scripts/README.md:37`](../scripts/README.md#L37).
   → **Rotate/revoke the key**, then change these scripts to read from env / the
   cred server (as `bzapp-*.py` already do). It is in git history — rotation, not
   just deletion, is required.

2. **Build script ships credentials.** `scripts/build-deploy.sh:39` bundles
   `server_data/credentials.json` **into the deploy zip**. `deploy.sh` does not.
   → Remove that line; credentials must only be set on the server.

3. **No auth on the server itself.** CORS is `allow_origins=["*"]` with all
   methods/headers (`app.py` ~773) and there is **no per-request token check**.
   Remote security relies entirely on the workspace gateway
   ([05 — Integrations](./05-integrations.md)). → Never expose port 18789
   directly to the internet; keep it behind the gateway.

4. **Server-side code execution surfaces.** `/db/widget/{id}/exec` and the widget
   query path run **arbitrary server-side Python snippets**; `_eval_excel_formula`
   uses `eval` (allowlist + stripped `__builtins__`, but still an eval path);
   `/proxy` is an open outbound proxy with credential substitution. These are
   "local-first" conveniences that become real risks if the server is reachable.

5. **Committed env files.** `.env` and `.env.production` are in the tree and may
   contain secrets (they contain OAuth client ids and API base URLs today).
   Confirm nothing sensitive is committed; prefer `.env.example` only.

6. **Best-effort secret redaction.** WS/SSE egress is scrubbed by regex only
   (`_redact`, `server.py:293`) — a differently-formatted secret could slip
   through.

## 🟠 Architecture / correctness

7. **Two chat stacks, one is dead.** The production UI (`agent.tsx`) uses
   **SSE + REST** (`/api/pool/*`). The WebSocket `/ws` endpoint and the
   `useBzcodeChat.ts` hook still ship but the hook is **imported nowhere**, and
   `useBzcodeChat` has no reconnect/keepalive. Decide: keep `/ws` as a
   documented alternate transport, or remove it and the hook. Right now it's
   confusing dead-ish weight (and the CHANGELOG's WS-stability entries describe
   the *legacy* path).

8. **`asyncpg` / Postgres is vestigial.** `requirements.txt` pins `asyncpg`,
   `docker-compose.yml` + `db/init.sql` define a schema, but the server never
   connects: `app.state.db` is always `None`, `/db/health` always 503, and the
   "database" is JSON-file-per-widget on disk. → Either wire it up or remove the
   scaffolding so nobody assumes persistence exists. Note: `_token_stats` and
   other in-memory state are lost on every restart.

9. **Frontend base-URL duplication with two variants.** The agent server URL is
   re-derived in ~30 places. Some use a PROD/`window.location.origin` fallback;
   others use a bare `?? 'http://localhost:18789'` (Excel/PPT editors,
   `ModeSelector`, `FolderTree`, `useBzcodeChat`). ⚠️ **A prod build of the
   Excel/PPT editors points at localhost.** → Extract one `agentBaseUrl()` module.

10. **Two auth notions that don't reconcile.** The localStorage JWT store
    (`auth-store.ts`) vs the agent-key login (`login.tsx`). `@boltzbit/auth-utils`
    is a dependency but unused; the OAuth env vars are effectively dead. → Pick
    one model and document it.

11. **Type lie:** `_docx_to_blocks(...) -> list` (`server.py:1631`) actually
    returns a `dict`. Callers depend on the dict. Fix the signature.

## 🟡 Maintainability

12. **Monster files.** Backend: `app.py` (4,182), `server.py` (2,717). Frontend:
    `agent.tsx` (6,992 — the whole live-agent state machine, chat, canvas, and
    doc-push flows in one file), `ExcelViewSheetArea.jsx` (2,968),
    `widgetRegistry.ts` (2,747), `ppt/index.tsx` (2,544), `EditorPanel.tsx`
    (2,542). `agent.tsx` is the single biggest maintainability risk — splitting
    the connection/state-machine out is the highest-value refactor.

13. **`.jsx`/`.tsx` mix.** ~36 `.tsx` + 28 `.jsx` + 8 `.js`. The entire
    office/excel/ppt subtree is untyped `.jsx`, bridged via `as any` and
    `React.lazy(...) as any`. ~21 `as any` casts, 33 `biome-ignore`s.

14. **Dead code.** `src/router.tsx` (`getRouter`, unused — `main.tsx` inlines
    router creation); `TopBar.tsx` (never rendered by the app layout); the **16
    unused design-token theme folders** (~64 CSS files); duplicated
    `useClickOutside.js` / `common.js` across `office/` and `excel/`; the legacy
    aiohttp `handle_ws_client` in `server.py`; stale `aiohttp`/`web` imports and
    an outdated module docstring in `server.py`.

15. **`server.py` section banners are out of order and several are empty** (§1,
    §9 PowerPoint, §18) — an artifact of bulk-moving handlers to `app.py`. Makes
    navigation confusing.

16. **Duplicated subprocess-spawn boilerplate** across 4 sites
    (`server.py:688, 921, 1060, 2637`) — same env/limit/args, no shared helper.
    Same for the credential-resolution block copy-pasted across all four
    `bzapp-*.py` CLIs.

17. **Duplicated Pydantic models / constants** in `app.py`: `WriteFileBody` vs
    `WriteFileBody2`; `CreateVersionBody`/`BzHubVersionBody` (and Sync/Publish)
    pairs; `_SCHEME_MAP` defined twice; the `/usr/local/boltzbit` literal
    repeated across `app.py` and 5 `server.py` sites instead of one constant.

18. **React Query is a dependency but mostly bypassed.** `QueryClient` is
    created with zero config and most fetching uses raw `fetch` + `useState` +
    manual polling (files, FolderTree, TopBar, Sidebar) — so caching/retry
    benefits go unused.

19. **Pervasive `except Exception: pass`** across backend parsing, credential,
    and read loops (plus a bare `except:` at `server.py:2392`). Silent failures
    make debugging hard.

20. **Encapsulation breaks:** `app.py` handlers reach into `agent_pool._entries`
    and `entry.model_info` directly (`app.py:885, 1820, 1975`).

21. **Fragile SSE parser** in `agent.tsx` (manual `\n\n` split, `data:` slice, a
    leftover `console.log`, silent `catch {}` on bad frames).

## 🟢 Repo hygiene

22. **~11 zip files (~40 MB+) clutter the root**: `bz-agent-v{0.3.2…0.6.3}.zip`,
    `deploy.zip`, `deploy-0.0.3.zip`, `deploy-uvicorn.zip`, `Archive.zip`,
    `bz-agent-mock.zip` (33 MB). `.gitignore` lists `*.zip`, but 5 of them
    (`Archive.zip`, `bz-agent-mock.zip`, `deploy-0.0.3.zip`,
    `deploy-uvicorn.zip`, `deploy.zip`) are **tracked anyway** (committed before
    the ignore rule). → `git rm --cached` them and delete; the versioned
    `bz-agent-v*.zip` are untracked and safe to delete.

23. **Generated files kept in tree** despite being gitignored: `openapi.json`
    (99 KB), `server_data/`, `.bzcanvas.json`.

24. **Inaccurate boilerplate `README.md`** — inherited from `bz-app-template`;
    describes a `docs/` layout, OAuth flow, and packages (`@boltzbit/pebble`,
    etc.) that don't match this repo. → Replace it (this `docs/` set can be the
    basis). Package name is still `bz-app-template`.

25. **Two build scripts diverge** (`deploy.sh` vs `scripts/build-deploy.sh`) —
    consolidate to one.

26. **Loose one-off files in root** mixed with production code:
    `test_client*.py`, `test_pool.py`, `test-init-template.py`,
    `bug-image-history-restore.md`, `poem.md`, `app_push_curl.text`, empty
    `whatsapp/` dir.

27. **Mock data in a prod route.** `learning.tsx` is largely hardcoded demo
    content, not backed by an API — misleading if shipped as a real feature.

## Suggested first moves for the new owner

1. **Rotate the leaked Dynas key** and purge it from the scripts (#1, #2).
2. **Delete/untrack the zip clutter** and replace the boilerplate README (#22, #24).
3. **Decide the transport story** — keep or kill `/ws` + `useBzcodeChat` (#7).
4. **Extract one `agentBaseUrl()` module** — fixes the localhost-in-prod editor
   bug (#9).
5. **Decide on Postgres** — wire it up or remove the scaffolding (#8).
6. Only then start carving up `agent.tsx` and the two Python god-files (#12).
