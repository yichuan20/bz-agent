# Widget Template Expansion — Analysis

_Conversation export · 2026-07-20_

---

## Current State: 32 Widgets Across 9 Categories

### Existing widgets by category

| Category | Count | Widgets |
|---|---|---|
| productivity | 7 | search, editor, table, timer, kanban, sticky, whiteboard |
| dev | 5 | terminal, json, files, github, sql |
| information | 6 | news, map, markdown, weather, stock, web-preview |
| utility | 3 | clock, calendar, translator |
| visualization | 3 | bar, pie, line-chart |
| communication | 3 | email, chat, videocall |
| dashboard | 1 | kpi |
| media | 1 | video |
| ai | 1 | llm-chat |
| custom | 1 | custom scaffold |

---

## Expansion by Category

### 1. Visualization — biggest ROI, all reuse Chart.js already loaded

| Widget | Why needed |
|---|---|
| Scatter Plot | Correlation / regression analysis — data scientists, analysts |
| Heatmap | Activity calendars, matrix data, cohort analysis |
| Gantt Chart | Project timelines — ubiquitous in productivity contexts |
| Funnel Chart | Sales/conversion analysis — explicit persona match (Sales Director, BI Analyst) |
| Gauge / Speedometer | Single-metric display — KPI dashboards often need this |
| Radar / Spider Chart | Multi-dimension comparison — analyst personas |
| Treemap | Hierarchical proportional data — finance, portfolios |

### 2. Dashboard — only 1 widget but 2 whole personas are dashboard-oriented (BI Analyst, CFO)

| Widget | Why needed |
|---|---|
| Revenue Dashboard | Financial metrics grid — CFO, Investment Banker personas |
| Project Dashboard | Tasks + milestones + progress — PM personas |
| Sales Pipeline | Leads, stages, conversion — Sales Director persona |
| System Health Monitor | CPU/mem/disk over time — DevOps persona |
| Social Media Analytics | Follower growth, engagement — Marketing persona |

These are compositions of visualization primitives, each with a defined persona match in `agent_modes`.

### 3. AI — 1 widget in an AI-first product is inconsistent

All proxy through the existing credential system (same as `llm-chat`).

| Widget | Why needed |
|---|---|
| Text Summarizer | Drop in text, get summary — most common AI use case |
| Image Generator | DALL-E/Flux prompt → image in canvas |
| Code Explainer | Paste code, get plain-English explanation |
| Sentiment Analyzer | Paste reviews/feedback, get breakdown |
| Prompt Builder | Write, test, save prompt templates — power users |
| Document Q&A | Upload/path a file, ask questions about it |

### 4. Utility — missing obvious everyday tools

| Widget | Why needed |
|---|---|
| Currency Converter | Live FX rates — finance personas, international work |
| Unit Converter | Length/weight/temp/volume — general utility |
| QR Code Generator | URL → QR — no API key needed |
| World Clock | Multi-timezone view — remote teams, global orgs |
| Color Picker | Hex/RGB/HSL + palette — design adjacent work |
| Password Generator | Secure random passwords — universal utility |
| Countdown | Target date countdown — projects, events |

### 5. Dev — natural extensions of existing terminal, json, sql

| Widget | Why needed |
|---|---|
| API Tester | HTTP requests (GET/POST + headers/body) — mini Postman |
| Regex Tester | Pattern + test strings, highlighted matches |
| Diff Viewer | Two text blocks → unified diff — code review adjacent |
| Base64 / Hash | Encode/decode + MD5/SHA256 — dev utilities |
| YAML Explorer | Companion to JSON Explorer, same pattern |
| Cron Builder | Visualize cron expressions — DevOps persona |
| Logs Viewer | Tail a file path, auto-refresh — DevOps persona |

### 6. Finance — zero representation despite CFO, IB, VC, RA personas

**New category.**

| Widget | Why needed |
|---|---|
| Budget Planner | Monthly income vs expense tracking |
| Portfolio Tracker | Multi-asset with gain/loss — VC, RA personas |
| Compound Interest Calculator | Time value of money |
| Mortgage / Loan Calculator | Financial planning |
| Break-even Calculator | Startup/product decisions |
| Invoice Generator | Simple billable items → totals |

### 7. Health & Wellness — missing but realistic for personal workspace

**New category.**

| Widget | Why needed |
|---|---|
| Water Intake Tracker | Daily hydration log |
| Mood / Energy Log | Daily check-in with trend graph |
| Breathing Exercise | Box breathing / 4-7-8 — focus/stress |
| Pomodoro Focus Mode | Richer variant of the existing timer |
| Habit Tracker | Daily checkbox streaks |

### 8. Media — only 1 widget (YouTube/Vimeo)

| Widget | Why needed |
|---|---|
| Image Gallery | Directory path or URLs → slideshow/grid |
| Audio Player | Local file or URL playback |
| PDF Viewer | Embed a PDF by path — common in worker context |
| Spotify Embed | Playlist/track embed |

### 9. Productivity — gaps in the existing 7

| Widget | Why needed |
|---|---|
| To-Do List | Simple checkbox list — simpler than full Kanban |
| Bookmarks | Save/organize URLs with tags |
| Flashcards | Q&A spaced repetition — researcher/student |
| Mind Map | Visual brainstorming — strategy/planning |
| Reading List | Track articles/papers — academic persona |

---

## Suggested Implementation Priority

### Tier 1 — High ROI, reuse existing infrastructure
1. **Visualization**: scatter, heatmap, gantt, funnel, gauge (Chart.js already loaded)
2. **AI**: text summarizer, image generator, sentiment (credential proxy already exists)
3. **Finance** (new category): budget planner, portfolio tracker, calculators

### Tier 2 — Strong persona alignment
4. **Dashboard**: revenue, sales pipeline, project (maps to bi_analyst, cfo, sales_director personas)
5. **Utility**: currency converter, QR generator, unit converter, world clock
6. **Dev**: API tester, regex tester, diff viewer, YAML explorer

### Tier 3 — Lifestyle/engagement
7. **Health & Wellness** (new category)
8. **Media**: image gallery, PDF viewer, audio player
9. **Productivity**: to-do, flashcards, mind map

---

## Structural Notes

- The `{widget_template_table}` placeholder in the `new-widget` skill means new templates just need entries in `server_data/widgets/index.json` + a JS file in `server_data/widgets/<kind>.js` — the agent skill picks them up automatically with no other changes.
- The credential proxy pattern (llm-chat, stock, weather, github) is the right shape for all AI and finance API widgets.
- Many new widgets (QR, regex, diff, unit converter, hash) need **no API key** — lower friction for users.
- New categories (Finance, Health) should get their own `meta.category` values so the UI can group and filter them.
