# Deploying BoltzAgent to a VM / LXC

The server is a single aiohttp process that serves the API, WebSocket bridge, and
the built frontend on **one port (18789)**. No Docker, no nginx — just Python.

---

## Prerequisites (on the VM)

```bash
# Ubuntu / Debian LXC
apt update && apt install -y python3 python3-venv python3-pip rsync

# Python ≥ 3.10 is required (3.11+ recommended)
python3 --version
```

Place the `bzcode` binary at `/opt/boltzagent/bzcode` (or set `BZCODE_PATH` to
wherever it lives).

---

## One-line deploy from your local machine

```bash
./scripts/deploy.sh ubuntu@<vm-ip>
```

That single command:

1. Runs `pnpm build` locally → produces `dist/` (design tokens are compiled in)
2. Rsyncs **only the required files** to `/opt/boltzagent/` on the VM:

   | File / directory | Purpose |
   |---|---|
   | `app.py` | aiohttp entry point |
   | `server.py` | All business logic & API routes |
   | `agent_modes.json` | Agent mode identities, tool config, identity prompts |
   | `requirements.txt` | Python dependency list |
   | `dist/` | Built frontend SPA (all JS/CSS baked in) |
   | `bzcode` | AI agent binary |
   | `bzcode/scripts/` | Helper Python scripts used by the agent |
   | `server_data/` | Widget definitions & per-deployment config |
   | `scripts/` | Deploy script + systemd unit |

   Source (`src/`), `design_tokens/`, `node_modules/`, `.venv/`, and dev
   tooling are **not** copied.

3. Creates `.venv` on the VM and runs `pip install -r requirements.txt`
4. Restarts the systemd service if installed, otherwise prints the manual start command

**Custom remote directory:**

```bash
./scripts/deploy.sh root@192.168.1.50 /srv/boltzagent
```

Make the script executable if needed:

```bash
chmod +x scripts/deploy.sh
```

---

## Python dependencies

All installed automatically from `requirements.txt`:

| Package | Version | Purpose |
|---|---|---|
| `fastapi` / `aiohttp` | latest | HTTP server & routing |
| `uvicorn[standard]` | ≥0.33 | ASGI runner |
| `asyncpg` | ≥0.30 | PostgreSQL async driver |
| `pypdf` | ≥4.0 | PDF parsing |
| `python-docx` | ≥1.1 | Word (`.docx`) read/write |
| `openpyxl` | ≥3.1 | Excel (`.xlsx`) read/write |
| `python-pptx` | ≥0.6 | PowerPoint (`.pptx`) read/write |
| `formulas` | ≥1.3 | Server-side Excel formula evaluation |

---

## First-time systemd setup (run once on the VM)

```bash
sudo cp /opt/boltzagent/scripts/boltzagent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now boltzagent

# Verify
sudo systemctl status boltzagent
journalctl -u boltzagent -f          # tail live logs
```

After this, every `./scripts/deploy.sh` automatically restarts the service.

---

## Manual start (without systemd)

```bash
cd /opt/boltzagent
BZCODE_PATH=./bzcode .venv/bin/python server.py
```

> **Important:** Use a single process — the server holds in-memory state
> (`_active_cwds`, `_batch_store`, etc.) that is not shared across workers.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `BZCODE_PATH` | `./bzcode` | Path to the `bzcode` binary |
| `BZCODE_CWD` | current dir | Default working directory for new sessions |
| `PORT` | `18789` | HTTP + WebSocket port |
| `BZCODE_DIST` | `./dist` (auto) | Vite `dist/` folder to serve as the SPA |

Set these in `/etc/systemd/system/boltzagent.service` under `[Service]` or in a
`.env.production` file (not copied to the VM — set them directly on the system).

---

## Firewall

```bash
# ufw (Ubuntu)
ufw allow 18789/tcp

# or iptables
iptables -A INPUT -p tcp --dport 18789 -j ACCEPT
```

---

## Verify the deployment

```bash
curl http://<vm-ip>:18789/agent-modes        # API — returns agent mode list
curl http://<vm-ip>:18789/api/excel/load     # Excel endpoint (should 400 — needs ?path)
open http://<vm-ip>:18789/                   # Frontend SPA
```

---

## API surface (new endpoints since last release)

### Office file viewer/editor

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/doc/parse` | Parse PDF / DOCX / PPTX / XLSX → JSON |
| `PUT` | `/api/doc/save` | Save Word (Block[]) or markdown back to DOCX |
| `GET` | `/api/excel/load?path=` | Load XLSX → cell JSON (formulas evaluated) |
| `PUT` | `/api/excel/save` | Save cell JSON → XLSX (preserves formulas) |
| `GET` | `/api/ppt/load?path=` | Load PPTX → slide JSON |
| `PUT` | `/api/ppt/save` | Save slide JSON → PPTX |

### File tree operations

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/file?path=` | Read a file as text |
| `PUT` | `/api/file` | Write text content to a file |
| `POST` | `/api/file/rename` | Rename a file or directory `{ path, newName }` |
| `POST` | `/api/file/duplicate` | Duplicate a file (creates `name copy.ext`) `{ path }` |
| `GET` | `/api/file/download?path=` | Download a file as binary attachment |

---

## What's new since last deploy checkpoint

### Agent modes & UI
- Four agent modes: **General**, **Widget**, **Worker**, **Coder**
- Each mode auto-collapses the side nav and starts with an identity prompt
- Widget mode: canvas-only view with floating prompt bar; chat panel toggle button
- Nav bar collapses by default for all agent modes (not just widget)
- Session creation now requires mode selection upfront

### Worker file editor
- Full VS Code-style editor panel with syntax highlighting
- **Word** (`.docx`): canvas-based rich editor (ported from bz-office)
- **Excel** (`.xlsx`): canvas-based spreadsheet with toolbar, formula bar, sheet tabs
  - Client + server-side formula evaluation (`formulas` library)
  - Formula persistence: formulas saved as formula strings, not values
  - Dependency recalculation on every cell edit
- **PowerPoint** (`.pptx`): canvas-based slide editor with thumbnail panel
  - Toolbar: select / text / shape / line / image tools, text formatting
  - Fullscreen presentation mode (browser Fullscreen API, arrow-key navigation)
  - Server-side PPTX ↔ slide JSON conversion via `python-pptx`
- File tree right-click context menu: **Open**, **Rename**, **Duplicate**, **Download**
- Chat "Open" button now routes `.docx`/`.pptx`/`.xlsx` to the editor panel

### Design system
- Design tokens (`design_tokens/boltzhub-tokens.css`) compiled into the build
- Dark/light mode CSS variables: `--border-default`, `--bg-elevated`, `--bg-hover`, `--accent-blue-light`
- Excel canvas theme-aware: clears CSS var cache on theme toggle

---

## Subsequent updates

```bash
./scripts/deploy.sh ubuntu@<vm-ip>
```

No manual SSH required — the script handles build, sync, and restart in one command.
