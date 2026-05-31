# Deploying bz-agent to a Remote VM

## Prerequisites

- SSH access to the remote VM (e.g. `gcp-flow-prototype`)
- `bzcode` binary installed on the remote VM
- Ports **5010** (frontend), **5070** (WebSocket bridge), **5071** (HTTP API) open in the VM firewall
- Node.js ≥ 18, `pnpm`, Python 3.8+ available on the remote VM

---

## 1 — Copy the project to the VM

Run from your local machine:

```bash
rsync -avz --progress \
  --exclude 'node_modules/' \
  --exclude '.venv/' \
  --exclude 'dist/' \
  --exclude '.claude/' \
  --exclude '*.tsbuildinfo' \
  -e "ssh -i ~/Credentials/bz_admin_ed25519" \
  /path/to/bz-agent/ \
  bz-admin@34.142.32.44:~/bz-agent/
```

---

## 2 — Install dependencies on the VM

SSH into the VM, then:

```bash
cd ~/bz-agent

# Node dependencies
pnpm install

# Python virtual environment
python3 -m venv .venv
.venv/bin/pip install websockets aiohttp
```

---

## 3 — Configure environment variables

Create a `.env.production` file (or edit `.env`) with the VM's public IP:

```bash
cat > ~/bz-agent/.env.production << 'EOF'
VITE_AGENT_WS_URL=ws://34.142.32.44:5070
VITE_AGENT_HTTP_URL=http://34.142.32.44:5071
VITE_LOGIN_URL=https://boltzhub.com/authentication-service/login
VITE_GATEWAY_URL=https://auth.boltzhub.com
VITE_API_BASE_URL=https://boltzhub.com/bz-appstore-api
VITE_DYNAS_APP_ID=app_79792de3ce8c4cd793751871cfd74fdc
EOF
```

---

## 4 — Build the frontend

```bash
cd ~/bz-agent
pnpm build          # output goes to dist/
```

---

## 5 — Run everything in the background (systemd)

### 5a — Python backend service

```bash
sudo tee /etc/systemd/system/bz-agent-server.service > /dev/null << 'EOF'
[Unit]
Description=bz-agent Python server (WebSocket bridge + HTTP API)
After=network.target

[Service]
User=bz-admin
WorkingDirectory=/home/bz-admin/bz-agent
ExecStart=/home/bz-admin/bz-agent/.venv/bin/python server.py \
    --bzcode /home/bz-admin/.local/bin/bzcode \
    --host 0.0.0.0 \
    --port 5070
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable bz-agent-server
sudo systemctl start  bz-agent-server
```

### 5b — Frontend static server

Serve the built `dist/` folder on port 5010. Using `npx serve`:

```bash
sudo tee /etc/systemd/system/bz-agent-frontend.service > /dev/null << 'EOF'
[Unit]
Description=bz-agent frontend (static)
After=network.target

[Service]
User=bz-admin
WorkingDirectory=/home/bz-admin/bz-agent
ExecStart=/usr/bin/npx serve dist -l 5010
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable bz-agent-frontend
sudo systemctl start  bz-agent-frontend
```

---

## 6 — Verify services are running

```bash
sudo systemctl status bz-agent-server
sudo systemctl status bz-agent-frontend

# Live logs
sudo journalctl -u bz-agent-server  -f
sudo journalctl -u bz-agent-frontend -f
```

The app is now accessible at:

| Service | URL |
|---|---|
| Frontend | `http://34.142.32.44:5010` |
| WebSocket bridge | `ws://34.142.32.44:5070` |
| HTTP API (sessions, search) | `http://34.142.32.44:5071` |

---

## 7 — Redeploying after code changes

```bash
# 1. Rsync updated files from local machine
rsync -avz --progress \
  --exclude 'node_modules/' --exclude '.venv/' --exclude 'dist/' \
  -e "ssh -i ~/Credentials/bz_admin_ed25519" \
  /path/to/bz-agent/ bz-admin@34.142.32.44:~/bz-agent/

# 2. On the VM — rebuild and restart
ssh bz-admin@34.142.32.44 << 'EOF'
  cd ~/bz-agent
  pnpm install          # pick up any new deps
  pnpm build
  sudo systemctl restart bz-agent-server
  sudo systemctl restart bz-agent-frontend
EOF
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| "Disconnected" in the UI | `journalctl -u bz-agent-server -f` — look for `bzcode not found` |
| Sessions page fails to load | Port 5071 open? `curl http://34.142.32.44:5071/sessions` |
| Frontend blank | Port 5010 open? `curl http://34.142.32.44:5010` |
| Chrome "Failed to fetch" | Ports 5060/5061 are blocked by Chrome — avoid those ports |
| WebSocket blocked | Browser console → Network → WS tab for details |
