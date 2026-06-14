# Deploying BoltzAgent to a VM / LXC

The server is a single FastAPI process that serves the API, WebSocket bridge, and
the built frontend on **one port (18789)**.  No Docker, no nginx — just Python.

---

## Prerequisites (on the VM)

```bash
# Ubuntu / Debian LXC
apt update && apt install -y python3 python3-venv python3-pip rsync

# Python ≥ 3.8 is required
python3 --version
```

Place the `bzcode` binary on the VM at `/opt/boltzagent/bzcode` (or point
`BZCODE_PATH` to wherever it lives).

---

## One-line deploy from your local machine

```bash
./scripts/deploy.sh ubuntu@<vm-ip>
```

That single command:

1. Runs `pnpm build` locally → produces `dist/`
2. Rsyncs **only the required files** to `/opt/boltzagent/` on the VM:

   | File / directory | Purpose |
   |---|---|
   | `app.py` | FastAPI entry point |
   | `server.py` | Business logic (imported by `app.py`) |
   | `agent_modes.json` | Agent mode identities & tool config |
   | `requirements.txt` | Python dependency list |
   | `dist/` | Built frontend (SPA) |
   | `bzcode` | AI agent binary |
   | `server_data/` | Widget definitions & credentials (optional) |

   Source code (`src/`), `node_modules/`, `.venv/`, and dev tooling are **not** copied.

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

## First-time systemd setup (run once on the VM)

```bash
sudo cp /opt/boltzagent/scripts/boltzagent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now boltzagent

# Verify
sudo systemctl status boltzagent
journalctl -u boltzagent -f          # tail live logs
```

After this, every `./scripts/deploy.sh` will automatically restart the service.

---

## Manual start (without systemd)

```bash
cd /opt/boltzagent
BZCODE_PATH=./bzcode .venv/bin/uvicorn app:app --host 0.0.0.0 --port 18789
```

> **Important:** Use `--workers 1`. The server holds per-process in-memory state
> (`_active_cwds`, `_batch_store`, etc.) that is not shared across workers.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `BZCODE_PATH` | `./bzcode` | Path to the `bzcode` binary |
| `BZCODE_CWD` | current dir | Default working directory for new sessions |
| `PORT` | `18789` | HTTP + WebSocket port |
| `BZCODE_DIST` | `./dist` (auto) | Vite `dist/` folder to serve as the SPA |

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
curl http://<vm-ip>:18789/agent-modes    # API working
curl http://<vm-ip>:18789/db/health      # Postgres (if configured)
open http://<vm-ip>:18789/docs           # Swagger UI
open http://<vm-ip>:18789/               # Frontend SPA
```

---

## Subsequent updates

```bash
./scripts/deploy.sh ubuntu@<vm-ip>
```

No SSH required — the script handles build, sync, and restart in one command.
