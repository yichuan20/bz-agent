# 04 — Frontend (`src/`)

React 19 + TypeScript + Vite 8 + TanStack Router SPA. Package still named `bz-app-template` (a fork tell); real version in `src/version.ts` (`FRONTEND_VERSION = '0.6.4'`). It talks to **two** backends:

1. the **Boltzbit platform** (`bz-api` / `dynas`) via typed SDK clients, and
2. the **local bzcode agent server** (this repo's FastAPI, default `localhost:18789`) via raw `fetch` / SSE / WebSocket.

## Entry & routing

- **`src/main.tsx`** — boots the app: creates the TanStack router, calls `initializeTheme()` and `initChat({ bzApiClient })`, mounts `<RouterProvider>` into `#app`. ⚠️ It **inlines its own router creation**, so `src/router.tsx` (`getRouter()`) is **dead code**.
- **`src/routes/__root.tsx`** — wraps everything in `QueryClientProvider`. Its `beforeLoad` strips a gateway-injected JWT from the URL path and redirects home — the only trace of gateway auth in the client.
- **`src/routes/_app/route.tsx`** — the authenticated app layout (`/_app`): `<Sidebar>` + `<Outlet>`, no top bar. Persists sidebar state; polls `/api/version` to show a "bzcode outdated" upgrade banner.

### Pages (`src/routes/_app/`)

| Route | File | What it is |
|---|---|---|
| `/_app/` | `index.tsx` | **Home** — greeting + prompt composer with 4 mode pills. Stashes the message in `sessionStorage`, optionally auto-detects mode via `POST /api/classify-mode`, then navigates to `/agent`. |
| `/_app/agent` | `agent.tsx` | **The product** — 6,992 lines. The live agent experience (see below). |
| `/_app/chat` | `chat.tsx` | Trivial wrapper around `<Chat chat={useAppChat()}>` — the *platform* chat, not the agent. |
| `/_app/files` | `files.tsx` | File manager backed by the **Dynas** client (upload + poll for processing). |
| `/_app/learning` | `learning.tsx` | "Live Learning" UI — **largely hardcoded mock data** (training rounds, quality scores). |
| `/_app/products` | `products.tsx` | Small product/showcase listing. |
| `/_app/settings` | `settings.tsx` | Version / API key / resources / integrations / server-log sections; all hit the agent server. |
| `/login` | `login.tsx` | **API-key login against the agent server** (see auth). |
| `/marketing` | `marketing.tsx` | 856-line static landing page with animated mockups. |

## Authentication (two inconsistent mechanisms)

- **`src/auth-store.ts`** — a minimal JWT store in `localStorage` (`bz_access_token`), with `useIsLoggedIn()` via `useSyncExternalStore` and cross-tab sync. This is the "platform" notion of logged-in.
- **`src/auth.ts`** — creates the platform SDK clients (`apiClient`, `dynasClient`) reading the token from the store (falls back to `'PUBLIC'`).
- **The actual app login** (`login.tsx`) is **API-key based against the agent server**: it POSTs `{name:'BZ_API_KEY', value}` to `/agent-key`, then honors a saved return URL. When the agent stream returns `auth_error`/401, `agent.tsx` saves the URL and redirects to `/login`.
- ⚠️ **No real OAuth in the client.** `@boltzbit/auth-utils` is a declared dependency but imported nowhere in `src/`. `VITE_OAUTH_CLIENT_ID`, `VITE_GATEWAY_URL`, `VITE_LOGIN_URL` are effectively unused (except URL-token stripping). The localStorage JWT store and the agent-key login are two different "logged in" notions that don't fully reconcile.

## The chat / agent experience (two separate stacks)

This is the most important structural point about the frontend.

### (a) Platform chat — `useAppChat` (secondary)
`src/hooks/useAppChat.ts` wraps `@boltzbit/chat`'s `useChat`, wiring in `useBzApiTools()` + `useDynasDbTools()` and a hardcoded model (`anthropic-claude-4.5-sonnet`). Used **only** by `/_app/chat` via `src/components/Chat.tsx`. This is not the agent.

### (b) The bzcode agent — the real product
- **`src/hooks/useBzcodeChat.ts`** (270 lines) — a **WebSocket** client to `VITE_AGENT_WS_URL`. Handles the [stdio-bridge protocol](../stdio-bridge-protocol.md) message types, auto-allows permission prompts, exposes a `UseChatReturn`. ⚠️ **It has no reconnect and no keepalive, and — critically — is imported nowhere.** It is the **legacy path**, superseded by `agent.tsx`.
- **`src/routes/_app/agent.tsx`** — the shipping UI, connected over **SSE + REST** (not WebSocket):
  1. `POST /api/pool/connect {cwd, mode, sessionId}` (`agent.tsx:5049`) → restores history + capabilities.
  2. `GET /api/pool/{id}/stream` (`agent.tsx:5122`) → SSE read via `fetch` + `ReadableStream`, split on `\n\n`, parse `data:` lines.
  3. `POST /api/pool/{id}/send` (`agent.tsx:5158`) → outbound.
  4. Reconnect: exponential backoff `min(2000·2^n, 30000)`, max 5 attempts, then `sessionUnavailable`. Forced reconnects via a `reconnectKey`.
  - Message handling (`handleMessage`, `agent.tsx:4801`) covers `session`, `status`, `delta` (rAF-batched), `assistant`, `tool`, `prompt`, `result` (token usage, quota detection, editor/canvas refresh), `user` (optimistic echo dedup by `clientId`), `system`, `auth_error`.
  - Layout: three panes — chat + `CanvasPanel` (widget canvas) + `EditorPanel`. Search params: `cwd`, `sessionId`, `mode`, `isNew`.

## Key components (`src/components/`)

| Component | Notes |
|---|---|
| `Sidebar.tsx` (821) | Primary nav; fetches `/sessions`, rename/delete/copy, theme toggle, sign-out. Holds a lot of session logic. |
| `TopBar.tsx` (300) | ⚠️ Not rendered by the `_app` layout (dead in the current UI). Polls `/api/apikey-status`. |
| `ModeSelector` / `ModeBadge` / `ModeIconSvg` | Agent-mode UI; `ModeSelector` fetches `/agent-modes` with a fallback. |
| `FolderTree.tsx` | Lazy FS tree; each node fetches `/files?path=` on expand. |
| `EditorPanel.tsx` (2,542) | VS-Code-style file viewer/editor; routes by extension to Excel/PPT/Word editors, handles md/html/pdf inline. |
| `BzDocEditor.tsx` | Renders/edits Word docs in the bz-office **Block JSON** format. |
| `IframeWidget.tsx` | Sandboxed widget host — builds `srcdoc`, injects theme vars + agent-http bridge. |
| Theme: `ThemeSelector`, `ThemeToggle` | Light/dark toggle (see theming). |

## Document editors (`src/office`, `src/excel`, `src/ppt`)

Three self-contained WYSIWYG editors, each with a single index barrel, that read/write real files on the agent's working directory via the doc APIs — so **the editors and the agent share the same filesystem.** They are almost entirely untyped `.jsx`:

- **`src/office/`** (Word) — `WordDocEditor` over bz-office Block JSON; large toolbar + `utils/` layer. Calls `/api/doc/*`.
- **`src/excel/`** — `ExcelViewSheetArea.jsx` (2,968 lines, the largest UI file) + sheet tabs; calls `/api/excel/{load,patch,grid,merge,renamesheet, addsheet}`.
- **`src/ppt/`** — `ppt/index.tsx` (2,544) + `Slide.jsx` (1,985, canvas-rendered slides); calls `/api/ppt/load|save`, throttled thumbnail render queue.

## Theming (`src/design-tokens/`)

- **Runtime is minimal**: `theme-config.ts` toggles a single `data-theme="dark"` on `<html>` and persists `bz-theme-mode`. Light/dark only.
- The **actual token values in use** come from `bz-agent-tokens-v1-0/boltzagent-tokens.css`, imported at the top of `src/styles.css`.
- ⚠️ The **16 theme folders** (`apex`, `terra`, `grove`, … ~64 CSS files) with `.light/.dark/.hc` variants are **completely unreferenced** — a scaffolded multi-theme system that was never wired to a picker. Dead/aspirational.

## How the frontend calls the backend

- **Platform** (auth'd, typed): `apiClient` / `dynasClient` (`src/auth.ts`), base `VITE_API_BASE_URL`. Used by `files.tsx`, `useAppChat`.
- **Agent server** (bzcode): **no central wrapper** — raw `fetch`/SSE/WebSocket to `VITE_AGENT_HTTP_URL` / `VITE_AGENT_WS_URL`, with the base URL re-derived ad hoc in **~30 places**. Two inconsistent idioms coexist:
  - `(VITE_AGENT_HTTP_URL) || (PROD ? window.location.origin : 'http://localhost:18789')`
  - `(VITE_AGENT_HTTP_URL) ?? 'http://localhost:18789'` (no PROD fallback — used by the Excel/PPT editors, `useBzcodeChat`, `ModeSelector`, `FolderTree`). ⚠️ A prod build of the Excel/PPT editors would point at `localhost`. This should be one shared module.
- **Env** (`.env`, `.env.production`, `.env.example`): `VITE_API_BASE_URL`, `VITE_GATEWAY_URL`, `VITE_LOGIN_URL`, `VITE_OAUTH_CLIENT_ID`, `VITE_DYNAS_APP_ID`, `VITE_AGENT_HTTP_URL`, `VITE_AGENT_WS_URL`. In `.env.production` the agent URLs are **left blank** so they resolve same-origin (frontend served by the Python server).

## Notable file sizes (maintainability risk)

`agent.tsx` (6,992), `ExcelViewSheetArea.jsx` (2,968), `widgetRegistry.ts` (2,747), `ppt/index.tsx` (2,544), `EditorPanel.tsx` (2,542), `Slide.jsx` (1,985), `ExcelToolbar.jsx` (1,766). See [07 — Tech Debt](./07-tech-debt.md).
