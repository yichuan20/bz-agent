# BoltzAgent — Remote Deployment Guide

The server is a single **FastAPI / uvicorn** process that serves the API, WebSocket
bridge, and built frontend on **one port (default 18789)**. No Docker, no nginx — just
Python.

---

## 1. Prerequisites on the remote machine

### System packages (Ubuntu / Debian)

```bash
apt update && apt install -y \
  python3 python3-venv python3-pip \
  rsync unzip curl
```

**Python 3.10 or higher is required** (3.11+ recommended for performance).

```bash
python3 --version    # must be ≥ 3.10
```

If the system Python is older (e.g. Ubuntu 20.04 ships 3.8), install a newer version:

```bash
add-apt-repository ppa:deadsnakes/ppa
apt install python3.11 python3.11-venv python3.11-distutils
```

Then substitute `python3.11` wherever `python3` is used below.

### Node / pnpm (build machine only — not needed on the remote)

The frontend is built **locally** and only the compiled `dist/` is copied to the server.
You do not need Node on the remote machine.

---

## 2. Remote directory layout

All server files live under `/opt/boltzagent/` by convention:

```
/opt/boltzagent/
├── app.py                  ← FastAPI entry point  (the only file you run)
├── server.py               ← Business logic, routes, WebSocket bridge
├── agent_modes.json        ← Agent mode definitions (General / Widget / Worker / Coder)
├── requirements.txt        ← Python dependency list
├── bzcode_assets/
│   ├── scripts/            ← Python helper scripts called by bzcode
│   └── templates/          ← Document/slide templates used by bzcode
├── dist/                   ← Built frontend SPA (JS + CSS, no Node needed at runtime)
├── server_data/
│   ├── widgets/            ← Widget JSON definitions
│   └── credentials.json    ← API keys & secrets (never commit, set manually on server)
├── scripts/
│   └── boltzagent.service  ← systemd unit (copy to /etc/systemd/system/)
└── .venv/                  ← Python virtualenv (created on the server, not synced)

/usr/local/bin/bzcode       ← bzcode binary (installed separately — see §3d)
```

**User workspace** (where sessions create files — must be writable by the service user):

```
/home/boltzagent/workspace/   ← set via BZCODE_CWD env var
```

---

## 3. First-time server setup

### 3a. Create a service user

```bash
useradd -m -s /bin/bash boltzagent
```

### 3b. Create the app directory

```bash
mkdir -p /opt/boltzagent
```

### 3c. Upload the deployment package

#### Version compatibility

| Version format | Rule |
|---|---|
| `xx.xx.xx` | Release version — frontend and backend **must match exactly** |
| `xx.xx.xx.yy` | Dev version — frontend and backend may differ; `yy` is an independent per-side dev counter |

The version string is printed at startup and served by `GET /api/version`. Always confirm both sides are on compatible versions after a deploy.

#### Package contents

`deploy.sh` produces `bz-agent-v<VERSION>.zip` containing:

| Path | Description |
|---|---|
| `app.py` | FastAPI entry point |
| `server.py` | Business logic, routes, WebSocket bridge |
| `requirements.txt` | Python dependency list |
| `agent_modes.json` | Agent mode definitions |
| `dist/` | Built frontend SPA (compiled locally before zipping) |
| `bzcode_assets/scripts/` | Python helper scripts called by bzcode |
| `bzcode_assets/templates/` | Document and slide templates |
| `server_data/widgets/` | Widget JSON definitions |

**Not included** (set manually on the server):
- `server_data/credentials.json` — API keys and secrets
- `.venv/` — Python virtualenv (created on the server)

#### Build and upload

```bash
# On your local machine — inside bz-agent/
./deploy.sh              # auto-detects version from server.py → bz-agent-v<VERSION>.zip
./deploy.sh 0.6.2        # override version explicitly
```

Then copy to the server:

```bash
scp bz-agent-v<VERSION>.zip ubuntu@<server-ip>:/opt/boltzagent/
ssh ubuntu@<server-ip> "cd /opt/boltzagent && unzip -o bz-agent-v<VERSION>.zip"
```

### 3d. Install the bzcode binary

The `bzcode_assets/` directory in the zip holds Python helper scripts and templates — **not** the binary. Install the binary separately so it is on the system `PATH`:

```bash
# Copy the Linux bzcode binary (obtained from the Boltzbit team) to a system path:
cp bzcode-linux /usr/local/bin/bzcode
chmod +x /usr/local/bin/bzcode

# Verify it is on PATH:
bzcode --version
```

The server calls `bzcode` by name and resolves it via `PATH` automatically — no path configuration needed as long as the binary is in a standard location like `/usr/local/bin/`.

### 3e. Create the Python virtualenv and install dependencies

```bash
cd /opt/boltzagent
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

### 3f. Set file permissions

```bash
# App files can be root-owned (server only reads them)
chown -R root:root /opt/boltzagent

# .venv and server_data must be readable by the service user
chown -R boltzagent:boltzagent /opt/boltzagent/.venv
chown -R boltzagent:boltzagent /opt/boltzagent/server_data

# bzcode binary (installed in §3d) must be executable
chmod +x /usr/local/bin/bzcode

# Create a writable workspace and BZ_HOME for the service user
mkdir -p /home/boltzagent/workspace
mkdir -p /usr/local/boltzbit
chown -R boltzagent:boltzagent /home/boltzagent/workspace
chown -R boltzagent:boltzagent /usr/local/boltzbit
```

> **Important:** Do NOT set `BZCODE_CWD=/opt/boltzagent`. That directory is
> root-owned and the service user cannot write there. User file operations
> (upload, create folder, save documents) will silently fail.

### 3g. Set up credentials

```bash
# Edit server_data/credentials.json on the server directly
# (never include secrets in the zip / git)
nano /opt/boltzagent/server_data/credentials.json
```

---

## 4. Environment variables

Set these in the systemd unit file or export them before the manual start command.

| Variable | Default | Required | Description |
|---|---|---|---|
| `BZCODE_CWD` | process cwd | **yes** | Default working directory for sessions (must be writable) |
| `BZ_HOME` | `/usr/local/boltzbit` | **yes** | bzcode home — stores credentials, sessions, and settings. Must be writable by the service user. |
| `PORT` | `18789` | no | HTTP + WebSocket port |

`BZCODE_PATH` is not needed — the server resolves `bzcode` from `PATH` automatically.

The server is started with CLI flags, not env vars, when running `app.py` directly:

```bash
.venv/bin/python app.py \
  --cwd  /home/boltzagent/workspace \
  --dist /opt/boltzagent/dist
```

When using **uvicorn** (systemd), set both `BZCODE_CWD` and `BZ_HOME`:

```ini
Environment=BZCODE_CWD=/home/boltzagent/workspace
Environment=BZ_HOME=/usr/local/boltzbit
```

---

## 5. systemd service (recommended)

### Install the unit

```bash
cp /opt/boltzagent/scripts/boltzagent.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now boltzagent
```

### Unit file reference (`scripts/boltzagent.service`)

```ini
[Unit]
Description=BoltzAgent FastAPI server
After=network.target

[Service]
Type=simple
User=boltzagent
Group=boltzagent

WorkingDirectory=/opt/boltzagent
ExecStart=/opt/boltzagent/.venv/bin/uvicorn app:app --host 0.0.0.0 --port 18789
Restart=on-failure
RestartSec=5

Environment=BZCODE_CWD=/home/boltzagent/workspace
Environment=BZ_HOME=/usr/local/boltzbit
Environment=PORT=18789

StandardOutput=journal
StandardError=journal
SyslogIdentifier=boltzagent

[Install]
WantedBy=multi-user.target
```

### Useful commands

```bash
systemctl status boltzagent           # check running state
systemctl restart boltzagent          # restart after a deploy
journalctl -u boltzagent -f           # tail live logs
journalctl -u boltzagent --since "5m ago"   # last 5 minutes
```

---

## 6. Manual start (without systemd)

```bash
cd /opt/boltzagent
.venv/bin/python app.py \
  --cwd  /home/boltzagent/workspace \
  --dist ./dist
```

> **Single process only.** The server holds in-memory state (`_active_cwds`,
> `_batch_store`, WebSocket connections) that is not shared across workers.
> Do **not** run with `--workers N` or behind gunicorn multi-worker.

To keep it running after logout:

```bash
nohup .venv/bin/python app.py \
  --cwd  /home/boltzagent/workspace \
  --dist ./dist \
  > /var/log/boltzagent.log 2>&1 &
echo $! > /var/run/boltzagent.pid
```

---

## 7. Firewall

```bash
# ufw (Ubuntu)
ufw allow 18789/tcp
ufw reload

# iptables
iptables -A INPUT -p tcp --dport 18789 -j ACCEPT
```

---

## 8. Python dependencies (`requirements.txt`)

All installed automatically via `pip install -r requirements.txt`.

| Package | Version pin | Purpose |
|---|---|---|
| `fastapi` | `0.124.4` | HTTP framework & route declarations |
| `uvicorn[standard]` | `0.33.0` | ASGI server (production runner) |
| `aiohttp` | `3.10.11` | Outgoing HTTP (BoltzHub, WhatsApp integrations) |
| `websockets` | `13.1` | WebSocket bridge to bzcode |
| `pydantic` | `2.10.6` | Request/response validation |
| `python-multipart` | `≥0.0.9` | Multipart file upload parsing |
| `pypdf` | `≥4.0` | PDF text extraction |
| `python-docx` | `≥1.1` | Word `.docx` read/write |
| `openpyxl` | `≥3.1` | Excel `.xlsx` read/write |
| `python-pptx` | `≥0.6` | PowerPoint `.pptx` read/write (slide JSON conversion) |
| `formulas` | `≥1.3` | Server-side Excel formula evaluation |

`asyncpg` is **not** in requirements — the server connects to Postgres if available but
continues without it (logs a warning). Add it manually if you need DB persistence:

```bash
.venv/bin/pip install asyncpg>=0.30
```

---

## 9. Subsequent deploys

```bash
# 1. Build + zip locally
./deploy.sh              # produces bz-agent-v<VERSION>.zip

# 2. Upload and extract
scp bz-agent-v<VERSION>.zip ubuntu@<server-ip>:/opt/boltzagent/
ssh ubuntu@<server-ip> "cd /opt/boltzagent && unzip -o bz-agent-v<VERSION>.zip"

# 3. Reinstall Python deps if requirements.txt changed
ssh ubuntu@<server-ip> "cd /opt/boltzagent && .venv/bin/pip install -r requirements.txt -q"

# 4. Restart
ssh ubuntu@<server-ip> "systemctl restart boltzagent"
```

---

## 10. Verification

```bash
# Health check — returns {"backend": "x.y.z"} (or "x.y.z.yy" for dev builds)
curl http://<server-ip>:18789/api/version

# Agent modes list
curl http://<server-ip>:18789/agent-modes

# File tree — returns directory listing for cwd
curl "http://<server-ip>:18789/files?path=/home/boltzagent/workspace"

# Frontend SPA
open http://<server-ip>:18789/
```

---

## 11. Complete API reference

### WebSocket

| Endpoint | Description |
|---|---|
| `ws://<host>:18789/ws` | bzcode agent bridge — all chat/agent traffic |

### Session management

| Method | Path | Description |
|---|---|---|
| `GET` | `/sessions` | List sessions |
| `POST` | `/sessions` | Create session |
| `GET` | `/sessions/{id}` | Get session |
| `DELETE` | `/sessions/{id}` | Delete session |
| `GET` | `/agent-modes` | List available agent modes |

### File system

| Method | Path | Body / params | Description |
|---|---|---|---|
| `GET` | `/files` | `?path=` | List directory entries |
| `GET` | `/api/file` | `?path=` | Read a file as text |
| `PUT` | `/api/file` | `{path, content}` | Write text content to a file |
| `POST` | `/api/file/rename` | `{path, newName}` | Rename a file or folder |
| `POST` | `/api/file/duplicate` | `{path}` | Duplicate a file (auto-names `copy`) |
| `GET` | `/api/file/download` | `?path=` | Download binary file |
| `POST` | `/api/file/upload` | multipart `file` + `dir` | Upload one or more files to a directory |
| `POST` | `/api/file/mkdir` | `{path}` | Create a directory (including parents) |
| `DELETE` | `/api/file` | `?path=` | Delete a file or directory (recursive) |

### Office document parsing & editing

| Method | Path | Body / params | Description |
|---|---|---|---|
| `POST` | `/api/doc/parse` | `{path}` or multipart | Parse PDF / DOCX / PPTX → JSON |
| `PUT` | `/api/doc/save` | `{path, blocks}` or `{path, content}` | Save Word doc (Block[]) or markdown |
| `GET` | `/api/doc/cursor` | `?path=` | Get last cursor position for a doc |
| `PUT` | `/api/doc/cursor` | `{path, selStart, selEnd}` | Save cursor position |
| `GET` | `/api/excel/load` | `?path=` | Load XLSX → evaluated cell JSON |
| `PUT` | `/api/excel/save` | `{path, sheets}` | Save cell JSON → XLSX (preserves formulas) |
| `GET` | `/api/ppt/load` | `?path=` | Load PPTX → slide JSON (backgrounds, boxes, images) |
| `PUT` | `/api/ppt/save` | `{path, slides}` | Save slide JSON → PPTX |

### Dev server (Coder mode)

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/api/dev-server/start` | `{cwd}` | Start a local dev server, returns `{url}` |
| `POST` | `/api/dev-server/stop` | `{cwd}` | Stop a running dev server |

### Misc

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/version` | Returns `{backend: "x.y.z"}` |
| `POST` | `/auth/logout` | Clear session token |
| `GET` | `/api/file/download` | Download any file as binary attachment |

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Permission denied` on file upload / new folder | `BZCODE_CWD` is not writable by service user | `chown boltzagent /home/boltzagent/workspace` |
| `ModuleNotFoundError: No module named 'pptx'` | pip install missed | `cd /opt/boltzagent && .venv/bin/pip install -r requirements.txt` |
| Server starts but frontend is blank | `--dist` path wrong or `dist/` not uploaded | check `dist/index.html` exists; re-run `unzip -o deploy.zip` |
| `bzcode: Permission denied` | binary not executable | `chmod +x /usr/local/bin/bzcode` |
| `bzcode binary not found` | binary not installed or `BZCODE_PATH` wrong | ensure bzcode is installed and on PATH (e.g. `which bzcode` should succeed) |
| Port 18789 not reachable | firewall blocking | `ufw allow 18789/tcp && ufw reload` |
| `address already in use` on restart | old process still running | `pkill -f 'app.py'` or `systemctl restart boltzagent` |
| `[db] connection failed` in logs | no Postgres running | safe to ignore — server continues without DB |
