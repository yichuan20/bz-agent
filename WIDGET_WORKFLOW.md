# Widget Template Workflow

## Source files

All built-in widget templates live in **`server_data/widgets/`**:

```
server_data/widgets/
├── index.json        ← metadata registry for all widgets
├── clock.js
├── sticky.js
├── bar.js
├── kanban.js
└── ...               ← one .js file per widget
```

### `index.json`

Each entry describes a widget's metadata — no JS code is embedded here:

```json
{
  "id": "clock",
  "kind": "clock",
  "label": "Clock",
  "emoji": "🕐",
  "defaultW": 364,
  "defaultH": 189,
  "keywords": ["time", "date"],
  "description": "...",
  "meta": { "author": "boltzbit", "version": "1.0", "category": "utility" },
  "isBuiltin": true,
  "archived": false
}
```

### `{id}.js`

Plain vanilla JavaScript injected verbatim into a sandboxed iframe. Conventions:
- Manipulates `document.body` directly — no framework, no module syntax
- Uses CSS variables (`var(--text-primary)` etc.) for theming
- Persists state in `localStorage` where needed
- Optionally uses `window.db` (guarded with `if (window.db) {}`) for server-side row storage

---

## Server API

Defined in `app.py`:

| Endpoint | Purpose |
|---|---|
| `GET /widgets` | Full index + JS code for all non-archived widgets |
| `GET /widgets/template?name=<id>` | Raw `.js` file from `server_data/widgets/{id}.js` |
| `GET /widgets/{widget_id}` | Single widget metadata + code |
| `POST /widgets` | Upsert a widget entry in `index.json` and optionally save its `.js` |
| `POST /canvas/deploy-widget` | Deploy a widget instance into the session's `custom_widgets/` |
| `GET /custom-widgets/{canvas_id}` | JS for a deployed custom widget instance |
| `PUT /custom-widgets/{canvas_id}` | Update JS for a deployed instance |

The index is read from disk on every call (not cached).

---

## Session setup

When a session is created, `_write_session_config()` in `server.py` populates:

```
$BZ_HOME/sessions/{session_id}/
├── meta.json
├── IDENTITY.md / SOUL.md / AGENTS.md / settings.json
├── skills/
│   └── new-widget/SKILL.md     ← injected with live widget template table
├── scripts/                    ← copied from bzcode_assets/scripts/
├── templates/                  ← copied from bzcode_assets/templates/
├── custom_widgets/             ← deployed widget JS instances (per-session)
├── widget_data/                ← per-session widget row data
└── .bzcanvas.json              ← canvas layout
```

The `new-widget` skill's `{widget_template_table}` placeholder is filled at session start by reading `index.json` live — so adding a new widget to `server_data/widgets/` and `index.json` is immediately available to new sessions with no restart.

**Built-in template JS files are never copied per-session.** They are fetched on demand from `server_data/widgets/` via `GET /widgets/template?name=<id>`.

---

## Canvas layout (`.bzcanvas.json`)

Each placed widget is one entry:

```json
{
  "version": 1,
  "widgets": [
    {
      "canvasId": "fvg8ym9kchu",
      "widgetId": "clock",
      "kind": "clock",
      "title": "Clock",
      "x": 32, "y": 24, "w": 364, "h": 189
    },
    {
      "canvasId": "cw-65d57350af30",
      "widgetId": "cw-65d57350af30",
      "kind": "custom",
      "title": "My Widget",
      "x": 24, "y": 400, "w": 380, "h": 280
    }
  ]
}
```

- **Built-in**: `widgetId` = template id (e.g. `"clock"`), `canvasId` = random token
- **Custom**: `widgetId` = `canvasId` = `"cw-{12-hex}"`

Row data for each instance lives in `widget_data/{canvasId}.json`:
```json
{ "_next_id": 1, "records": [] }
```

---

## Agent workflow

The agent is instructed via the `new-widget` skill (from `agent_modes.json`) to always call `create-widget.py` rather than writing canvas JSON manually.

### Built-in widget

```
agent calls: create-widget.py --template clock --title "Clock" --w 364 --h 189
    │
    ├─ GET /widgets/template?name=clock
    │       → serves server_data/widgets/clock.js
    │
    ├─ writes  session/custom_widgets/cw-{hex}.js
    ├─ writes  session/widget_data/cw-{hex}.json  { "_next_id": 1, "records": [] }
    └─ appends session/.bzcanvas.json entry
```

### Custom widget

```
agent writes JS to:  session/custom_widgets/.pending.js

agent calls: create-widget.py --title "My Widget" --w 400 --h 300
    │
    ├─ reads   session/custom_widgets/.pending.js  (then deletes it)
    │
    ├─ writes  session/custom_widgets/cw-{hex}.js
    ├─ writes  session/widget_data/cw-{hex}.json
    └─ appends session/.bzcanvas.json entry
```

`create-widget.py` prints `{"canvasId": "...", "x": ..., "y": ..., "w": ..., "h": ...}` to stdout on success.

---

## Adding a new built-in widget

1. Write `server_data/widgets/{id}.js` (vanilla JS, manipulate `document.body`)
2. Add an entry to `server_data/widgets/index.json` with `"isBuiltin": true`
3. No server restart needed — `index.json` is read fresh on every request
4. New sessions immediately see the widget in the `new-widget` skill table
