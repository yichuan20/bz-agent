# Workspace Backend — Remote Deployment Guide

The server is a single **FastAPI / uvicorn** process that serves the API and the
built frontend on **one port (default 18789)**. No Docker, no nginx, **no uv on the
remote** — just Python + pip.

The build machine uses `uv` (dev) and `pnpm` (frontend build); the remote uses only
a plain `venv` + `pip install -r requirements.txt`. `scripts/package.sh` bridges the
two: it exports a pinned `requirements.txt` from `uv.lock` and zips the package.

---

## 1. Prerequisites on the remote

```bash
apt update && apt install -y python3 python3-venv python3-pip unzip curl
python3 --version    # must be ≥ 3.12
```

Node is **not** needed on the remote — the frontend is built locally and only the
compiled `frontend/dist/` is shipped.

---

## 2. Remote directory layout

Everything lives under `/opt/boltzagent/` by convention (this is the zip root):

```
/opt/boltzagent/
├── src/workspace_backend/   ← the backend package (imported via PYTHONPATH=src)
├── pyproject.toml           ← package metadata (version, deps — reference)
├── requirements.txt         ← pinned deps for pip (generated from uv.lock)
├── agent_modes.json         ← agent mode definitions
├── bzcode_assets/
│   ├── scripts/             ← Python helper scripts called by bzcode
│   └── templates/           ← document / slide templates
├── frontend/dist/           ← built SPA (JS + CSS; no Node at runtime)
├── server_data/
│   └── widgets/             ← built-in widget library (shipped)
├── app.py                   ← entrypoint shim so `uvicorn app:app` finds src/ (generated at package time)
└── .venv/                   ← Python virtualenv (created on the server, not shipped)

/usr/local/bin/bzcode        ← bzcode binary (installed separately — see §4)
```

Runtime-only data is created on first run and is **not** in the zip:
`server_data/credentials.json`, `server_data/widget_data/`,
`server_data/custom_widgets/`.

---

## 3. Build & upload (from your local machine)

```bash
cd workspace-backend
./scripts/package.sh              # auto-detects version → dist/bz-agent-v<VERSION>.zip
./scripts/package.sh 0.6.4        # or pin the version explicitly

scp dist/bz-agent-v<VERSION>.zip ubuntu@<server-ip>:/opt/boltzagent/
ssh ubuntu@<server-ip> "cd /opt/boltzagent && unzip -o bz-agent-v<VERSION>.zip"
```

---

## 4. First-time server setup

```bash
# Service user + app dir
useradd -m -s /bin/bash boltzagent
mkdir -p /opt/boltzagent      # then upload+unzip the package here (see §3)

# bzcode binary on PATH (obtained from the Boltzbit team)
cp bzcode-linux /usr/local/bin/bzcode && chmod +x /usr/local/bin/bzcode
bzcode --version

# Python venv + deps (NO uv here — plain pip)
cd /opt/boltzagent
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

# Writable workspace + BZ_HOME for the service user
mkdir -p /home/boltzagent/workspace /usr/local/boltzbit
chown -R boltzagent:boltzagent /home/boltzagent/workspace /usr/local/boltzbit
chown -R boltzagent:boltzagent /opt/boltzagent/.venv /opt/boltzagent/server_data
```

> Do **not** set `BZCODE_CWD=/opt/boltzagent` — that dir is root-owned and the
> service user can't write there. User file operations would silently fail.

---

## 5. Environment variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `BZCODE_CWD` | process cwd | **yes** | Default working dir for sessions (must be writable) |
| `BZ_HOME` | `/usr/local/boltzbit` | **yes** | bzcode home — credentials, sessions, settings (must be writable) |
| `BZ_DATA_ROOT` | package root | recommended | Holds `agent_modes.json`, `bzcode_assets/`, `server_data/` |
| `BZ_FRONTEND_DIST` | `<root>/frontend/dist` | recommended | Built SPA to serve |
| `PYTHONPATH` | — | **yes** | Must include `/opt/boltzagent/src` so `workspace_backend` imports |
| `PORT` | `18789` | no | HTTP port (pass as `--port` to uvicorn) |

`BZCODE_PATH` is optional — `bzcode` is resolved from `PATH` automatically.

---

## 6. Run via systemd (recommended)

The cloud provisioner installs its own systemd unit automatically; the steps below
are only for **manual** installs. Create the unit inline:

```bash
cat > /etc/systemd/system/boltzagent.service <<'EOF'
[Unit]
Description=BoltzAgent Workspace Backend (FastAPI / uvicorn)
After=network.target

[Service]
Type=simple
User=boltzagent
Group=boltzagent
WorkingDirectory=/opt/boltzagent
# The package source ships under src/; make it importable without a build step.
Environment=PYTHONPATH=/opt/boltzagent/src
ExecStart=/opt/boltzagent/.venv/bin/uvicorn workspace_backend.app:app --host 0.0.0.0 --port 18789
Restart=on-failure
RestartSec=5
Environment=BZCODE_CWD=/home/boltzagent/workspace
Environment=BZ_HOME=/usr/local/boltzbit
Environment=BZ_DATA_ROOT=/opt/boltzagent
Environment=BZ_FRONTEND_DIST=/opt/boltzagent/frontend/dist
StandardOutput=journal
StandardError=journal
SyslogIdentifier=boltzagent

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now boltzagent

systemctl status boltzagent
journalctl -u boltzagent -f
```

> **Single process only.** The server holds in-memory state (the agent pool, SSE
> connections). Do **not** run with `--workers N` or behind a multi-worker gunicorn.

---

## 7. Manual start (without systemd)

```bash
cd /opt/boltzagent
BZCODE_CWD=/home/boltzagent/workspace \
BZ_HOME=/usr/local/boltzbit \
BZ_DATA_ROOT=/opt/boltzagent \
BZ_FRONTEND_DIST=/opt/boltzagent/frontend/dist \
PYTHONPATH=/opt/boltzagent/src \
  .venv/bin/uvicorn workspace_backend.app:app --host 0.0.0.0 --port 18789
```

---

## 8. Subsequent deploys

```bash
# local
./scripts/package.sh

# remote
scp dist/bz-agent-v<VERSION>.zip ubuntu@<server-ip>:/opt/boltzagent/
ssh ubuntu@<server-ip> "cd /opt/boltzagent && unzip -o bz-agent-v<VERSION>.zip"
# reinstall deps only if requirements.txt changed:
ssh ubuntu@<server-ip> "cd /opt/boltzagent && .venv/bin/pip install -r requirements.txt -q"
ssh ubuntu@<server-ip> "systemctl restart boltzagent"
```

---

## 9. Verification

```bash
curl http://<server-ip>:18789/healthz            # liveness
curl http://<server-ip>:18789/api/v1/version     # {"backend": "...", "bzcode": "..."}
open http://<server-ip>:18789/                    # frontend SPA
```

---

## 10. Firewall

```bash
ufw allow 18789/tcp && ufw reload
```
