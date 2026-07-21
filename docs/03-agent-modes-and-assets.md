# 03 — Agent Modes & bzcode Assets

This is the layer that turns a generic `bzcode` process into a specific
"BoltzAgent" persona with a specific toolset. It has three parts:

1. **`agent_modes.json`** — the mode/persona definitions.
2. **Session config generation** — how a mode becomes files bzcode reads.
3. **`bzcode_assets/`** — the scripts and templates the agent uses as tools.

## 1. Agent modes (`agent_modes.json`)

An **agent mode** is a named persona + capability profile for a session.
Top-level shape:

```json
{ "default": "general",
  "modes": {
    "<id>": { "label", "icon", "description",
              "identity", "soul", "settings": { "mode", "tools" },
              "baseMode"?, "agents_md"?, "skills"? } } }
```

There are **24 modes in two tiers**:

- **4 base modes** carry the full config (`identity`, `soul`, `settings`, and for
  widget/worker/coder also `agents_md` + `skills`):

  | Mode | Purpose | Tools (allowlist highlights) | Runtime mode |
  |---|---|---|---|
  | `general` | Q&A, research, writing, file tasks | FileRead/Edit/Write, Glob, Grep, AskUserQuestion, TodoWrite, WebFetch, Skill (**no Bash**) | yolo |
  | `widget` | Widget / mini-app dev | base + **Bash** (for `create-widget.py`) | yolo |
  | `worker` | Document review & knowledge work | Bash, File*, Glob, Grep, AskUserQuestion, TodoWrite, WebFetch, Skill (+ doc skills) | yolo |
  | `coder` | Code projects & deployment | fullest — adds EnterPlanMode, ExitPlanMode, **Agent** (sub-agents) | yolo |

- **20 professional profiles** (`software_engineer`, `data_scientist`, `cfo`,
  `patent_lawyer`, `hr_manager`, `ceo`, `ux_designer`, …). Each has only
  `label/icon/description/baseMode/identity/soul` and points at one of the 4
  base modes via `baseMode` (e.g. `software_engineer.baseMode = "coder"`). They
  **layer a role-specific identity/soul on top of a base mode's tools/skills.**
  Narratively documented in
  [`agent_mode_profiles.md`](../agent_mode_profiles.md).

**What distinguishes modes:** the `identity` text (→ `IDENTITY.md`, "who the
agent is"), the `soul` text (→ `SOUL.md`, "how it behaves"), the `settings.tools`
allowlist, the `settings.mode` runtime permission mode, and per-mode `skills`
(SKILL.md files). **No per-mode model is set** — the model comes from the
bzcode/boltzbit login.

> Note: the frontend only surfaces the 4 base modes as a union type
> (`src/lib/agentModes.ts`); the 20 profiles are used server-side / via
> `/agent-modes`. `DEPLOY.md` mentions only "General/Widget/Worker/Coder" — the
> other 20 exist in `agent_modes.json` but aren't a first-class UI concept.

### boltzbit vs generic asset variants

`agent_modes.json` entries can carry `skills` **and** `skills_generic` (and the
`agents_md` equivalent). `_write_session_config` picks the variant based on the
reported model name (boltzbit models get the boltzbit assets, everything else
gets generic). This lets the same mode behave slightly differently depending on
which LLM backs the session.

## 2. How a mode reaches bzcode (`server.py:79`)

On every connect/resume, `_write_session_config(session_id, mode, cwd, model)`:

1. Resolves the mode entry, following `baseMode` for profiles (`_mode_entry`).
2. Ensures `$BZ_HOME/sessions/<id>/` exists and **purges** anything not on the
   `_OWNED_NAMES` allowlist (clears bzcode sub-agent leftovers).
3. Writes `meta.json` (our metadata), `IDENTITY.md`, `SOUL.md`, `AGENTS.md`,
   `settings.json`.
4. Copies the mode's `skills/` and the `bzcode_assets/scripts/` +
   `bzcode_assets/templates/` into the session dir so the agent's tools are
   available.

bzcode reads these at startup and on `--resume`, so the persona is re-applied on
every reconnect. After spawn, the server also sends `{"type":"setMode","mode":
"yolo"}` over stdio to match `settings.mode`.

## 3. `bzcode_assets/scripts/*.py` — the agent's tools

These are Python scripts the agent invokes via its Bash tool
(`$BZ_PYTHON <path>/<script>.py`). Grouped by purpose:

### Document reading / analysis (worker)
- `read-doc.py` — parse PDF/DOCX/XLSX/PPTX → text (~80 K char cap).
- `extract-doc.py` — return only query-relevant sections (token-saving).
- `diff-docs.py` — diff two docs → unified diff + summary of changed sections.

### Document creation (worker)
- `create-doc.py` — markdown → Word `.docx`.
- `create-xlsx.py` — JSON → Excel `.xlsx` (basic).
- `excel-worker.py` — heavier Excel builder + formula evaluator (CREATE / RECALC
  modes, styles/formulas sidecar JSON).
- `create-pptx.py` — JSON outline → PowerPoint (from a template inheriting
  masters, or from scratch).
- `read-pptx.py` — inspect a `.pptx` (layouts, placeholders, content) for
  planning.
- `create-pptx-sidecar.py` / `read-pptx-sidecar.py` — sidecar-JSON workflow:
  read a template's editable box ids, then clone slides and replace only named
  text boxes, preserving fonts/layout.
- `generate-templates.py` — **build tool** (not a runtime tool): regenerates the
  markdown templates + `index.json`.

### Widgets
- `create-widget.py` — deploy a canvas widget: fetch a built-in template's JS
  from `/widgets/template?name=`, or read agent-written `.pending.js`; write to
  `custom_widgets/{canvasId}.js`, seed `widget_data/{canvasId}.json`, append to
  `.bzcanvas.json`.

### BoltzHub / cloud app building (all resolve creds from the local cred server
`http://localhost:18789/credentials/<NAME>`, never printing tokens)
- `bzapp-dynas.py` — Dynas DB service (create-app/table, patch-table, seed,
  query, sql).
- `bzapp-anksy.py` — Anksy API gateway (register/update/delete/list routes,
  import-spec from OpenAPI). Routes must start `/api/`.
- `bzapp-dpyes.py` — dpyes remote-Python (create/run snippet, submit-job,
  job-status).
- `bzapp-template.py` — BoltzHub app-store template search/download.
- `db.py` — local PostgreSQL CRUD via asyncpg (defaults match
  `docker-compose.yml`). Backs `window.db` in widgets. *Note: the server itself
  doesn't use Postgres; this script is for the agent to use directly if a DB is
  present.*

See [05 — Integrations](./05-integrations.md) for what Dynas/Anksy/dpyes are.

## 4. `bzcode_assets/templates/`

Two categories:

- **Business-document markdown templates (~63× `.md`)** — fill-in-the-blank
  documents with `{{PLACEHOLDER}}` tokens (reports, proposals, NDAs, HR policies,
  investor updates, OKRs, risk assessments, …). Consumed by the worker's
  `new-doc` skill → `create-doc.py`. `index.json` is the searchable catalog
  (id, keywords, use_cases, profiles).
- **Code-scaffolding templates (7× `.tmpl`)** — Boltzbit app code for coder mode:
  `boltzbit-route.tsx.tmpl` (TanStack Router page), `boltzbit-dal.ts.tmpl`
  (Dynas data-access layer), `boltzbit-hooks.ts.tmpl` (React Query hooks),
  `boltzbit-mock.ts.tmpl`, `boltzbit-dpyes-snippet.py.tmpl`,
  `boltzbit-anksy-route.json.tmpl`. Use `{Domain}`/`{domain}`/`{tableName}`
  substitution.

## 5. The widget system

A **widget** is self-contained **vanilla JS** that runs in a **sandboxed
iframe** on the per-session "canvas".

- **Runtime environment**: each iframe gets `document/window/fetch` plus the
  current theme's **CSS custom properties** injected into `:root`
  (`--text-primary`, `--accent-blue`, …). Charts load Chart.js from CDN.
  Optional persistence via `window.db` (→ `/db/widget/...` JSON store); optional
  `window.__agentHttpBase__` for server endpoints (`/proxy`, `/shell`, `/files`,
  `/search`). Credential placeholders (`{{OPENAI_API_KEY}}`, etc.) are
  substituted server-side.
- **Built-in library**: `server_data/widgets/*.js` (~33 files: clock, timer,
  stock, pie, sticky, weather, files, llm-chat, web-preview, line-chart,
  terminal, …) + `index.json` catalog. `clock.js` is ~15 lines; `llm-chat.js`
  posts through `/proxy` to OpenAI/Anthropic with injected keys.
- **Frontend source of truth**: `src/lib/widgetRegistry.ts` (2,747 lines) —
  defines the `WidgetKind` union (~30 kinds) and inlines each widget's code as a
  template-literal string. The `server_data/widgets/*.js` files mirror these.
- **Canvas format** (`.bzcanvas.json`):
  `{version:1, widgets:[{canvasId, widgetId, kind, title, x, y, w, h}]}`. Each
  entry places a widget on a 2D grid. `kind:"custom"` entries have
  `canvasId===widgetId` (prefixed `cw-…`) with JS in `custom_widgets/{id}.js`;
  per-widget data is in `widget_data/{id}.json`.

The frontend host is [`src/components/IframeWidget.tsx`](../src/components/IframeWidget.tsx),
which builds the iframe `srcdoc`, injects theme vars and the agent-http bridge,
and escapes `</script>`.
