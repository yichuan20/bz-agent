# Deploying bz-agent to a Remote VM

## Prerequisites

- SSH access to the remote VM (e.g. `gcp-flow-prototype`)
- `bzcode` binary installed on the remote VM
- Ports **5010** (frontend), **5080** (WebSocket bridge), **5081** (HTTP API) open in the VM firewall
- Node.js ≥ 18, `pnpm`, Python 3.8+ available on the remote VM

---

## What gets transferred and what doesn't

| Path | Transferred? | Notes |
|---|---|---|
| `src/` | ✅ Yes | Frontend source |
| `server.py` | ✅ Yes | Python backend |
| `server_data/` | ❌ No (`.gitignore`) | Created on the VM by the server on first run |
| `design_tokens/` | ✅ Yes | CSS design tokens |
| `package.json`, `pnpm-lock.yaml` | ✅ Yes | Node dependencies |
| `vite.config.ts`, `tsconfig*.json` | ✅ Yes | Build config |
| `public/` | ✅ Yes | Static assets |
| `.env` | ✅ Yes | Base env vars (override with `.env.production`) |
| `node_modules/` | ❌ No | Re-installed on VM |
| `.venv/` | ❌ No | Re-created on VM |
| `dist/` | ❌ No | Built on VM |
| `.claude/`, `.DS_Store` | ❌ No | Local tooling |
| `*.tsbuildinfo` | ❌ No | Build cache |
| `.bzcanvas.json` | ❌ No | Per-session canvas layout, stays local |

> **`server_data/`** is excluded from rsync. On the VM it is created automatically
> when the Python server first runs and the frontend seeds the widget registry.

---

## 1 — Copy the project to the VM

Run from your local machine (replace IP and key path as needed):

```bash
rsync -avz --progress \
  --exclude 'node_modules/' \
  --exclude '.venv/' \
  --exclude 'dist/' \
  --exclude '.claude/' \
  --exclude 'server_data/' \
  --exclude '*.tsbuildinfo' \
  --exclude '.DS_Store' \
  --exclude '.bzcanvas.json' \
  -e "ssh -i ~/Credentials/bz_admin_ed25519" \
  ./ \
  bz-admin@34.142.32.44:~/bz-agent/
```

---

## 2 — Install dependencies on the VM

```bash
cd ~/bz-agent

# Node dependencies
pnpm install

# Python virtual environment + dependencies
python3 -m venv .venv
.venv/bin/pip install websockets aiohttp
```

---

## 3 — Configure environment variables

Create `.env.production` with the VM's public IP.
Vite bakes these values into the compiled JS at build time.

```bash
cat > ~/bz-agent/.env.production << 'EOF'
# Agent backend — point to the VM's public IP
VITE_AGENT_WS_URL=ws://34.142.32.44:5080
VITE_AGENT_HTTP_URL=http://34.142.32.44:5081

# Auth endpoints (boltzhub.com)
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
pnpm build          # output → dist/
```

---

## 5 — Run everything in the background (systemd)

### 5a — Python backend (WebSocket bridge + HTTP API)

```bash
sudo tee /etc/systemd/system/bz-agent-server.service > /dev/null << 'EOF'
[Unit]
Description=bz-agent Python server (WebSocket + HTTP API)
After=network.target

[Service]
User=bz-admin
WorkingDirectory=/home/bz-admin/bz-agent
ExecStart=/home/bz-admin/bz-agent/.venv/bin/python server.py \
    --bzcode /home/bz-admin/.local/bin/bzcode \
    --host 0.0.0.0 \
    --port 5080
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

The server creates `server_data/` on first launch and seeds widget `.js` files
when the frontend first opens the Canvas tab.

### 5b — Frontend static server

```bash
sudo tee /etc/systemd/system/bz-agent-frontend.service > /dev/null << 'EOF'
[Unit]
Description=bz-agent frontend (static files)
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

## 6 — Verify

```bash
sudo systemctl status bz-agent-server
sudo systemctl status bz-agent-frontend

# Live logs
sudo journalctl -u bz-agent-server  -f
sudo journalctl -u bz-agent-frontend -f
```

| Service | URL |
|---|---|
| Frontend | `http://34.142.32.44:5010` |
| WebSocket bridge | `ws://34.142.32.44:5080` |
| HTTP API | `http://34.142.32.44:5081` |

Confirm the API is alive:
```bash
curl http://34.142.32.44:5081/sessions
curl http://34.142.32.44:5081/widgets
```

---

## 7 — Redeploying after code changes

```bash
# 1. Push updated source files from local machine
rsync -avz --progress \
  --exclude 'node_modules/' --exclude '.venv/' --exclude 'dist/' \
  --exclude 'server_data/' --exclude '.claude/' --exclude '*.tsbuildinfo' \
  -e "ssh -i ~/Credentials/bz_admin_ed25519" \
  /path/to/bz-agent/ bz-admin@34.142.32.44:~/bz-agent/

# 2. On the VM — rebuild and restart
ssh bz-admin@34.142.32.44 << 'EOF'
  cd ~/bz-agent
  pnpm install
  pnpm build
  sudo systemctl restart bz-agent-server
  sudo systemctl restart bz-agent-frontend
EOF
```

---

## 8 — First-time widget seed

`server_data/widgets/` is excluded from rsync and does not exist on a fresh VM.
It is created automatically:

1. Start the Python server (step 5a above).
2. Open the app in a browser and navigate to **Agent → Canvas**.
3. The frontend calls `POST /widgets/seed` which writes `server_data/widgets/index.json`
   and one `.js` file per widget (29 files total).
4. Subsequent starts load from those files — no re-seed needed.

To force a re-seed (e.g. after adding new built-in widgets), delete the folder
and reload the Canvas tab:
```bash
rm -rf ~/bz-agent/server_data/widgets
```

---

## 9 — WhatsApp integration

Users can chat with the bzcode agent directly from WhatsApp.
Each phone number gets its own persistent bzcode session.
The working directory for all WhatsApp sessions is `{default_cwd}/whatsapp/`.

### 9a — Set up Twilio WhatsApp Sandbox

1. Create a free [Twilio account](https://www.twilio.com)
2. Go to **Messaging → Try it out → Send a WhatsApp message**
3. Follow the sandbox join instructions (send a message from your phone)
4. In **Sandbox Settings**, set the webhook:
   ```
   When a message comes in: http://YOUR_VM_IP:5081/whatsapp/incoming  POST
   Status callback URL:      http://YOUR_VM_IP:5081/whatsapp/status    POST
   ```

### 9b — Add Twilio credentials to the server

```bash
curl -X POST http://YOUR_VM_IP:5081/credentials \
  -H 'Content-Type: application/json' \
  -d '{"key":"TWILIO_ACCOUNT_SID","value":"ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}'

curl -X POST http://YOUR_VM_IP:5081/credentials \
  -H 'Content-Type: application/json' \
  -d '{"key":"TWILIO_AUTH_TOKEN","value":"your_auth_token"}'

curl -X POST http://YOUR_VM_IP:5081/credentials \
  -H 'Content-Type: application/json' \
  -d '{"key":"TWILIO_FROM","value":"whatsapp:+14155238886"}'
```

### 9c — Test

Send any message from your WhatsApp to the sandbox number.
The server will log:
```
[whatsapp] whatsapp:+447700900000: your message here
```
And reply with bzcode's response within ~30 seconds.

The bzcode session for each number:
- Runs in `{default_cwd}/whatsapp/` (created automatically)
- Uses **yolo mode** (all tool permissions auto-approved)
- Persists across messages (conversation history is maintained)
- Restarts automatically if bzcode crashes

---

## Troubleshooting

| Symptom | Check |
|---|---|
| "Disconnected" in UI | `journalctl -u bz-agent-server -f` — look for `bzcode not found` |
| Sessions page empty | `curl http://VM_IP:5081/sessions` — check server is running |
| Widget toolbar empty | Open Canvas tab to trigger `POST /widgets/seed` |
| Frontend blank | `curl http://VM_IP:5010` — check frontend service |
| Chrome "Failed to fetch" | Ports 5060/5061 are blocked by Chrome — do not use them |
| SSL error in Web Preview | Expected — proxy runs with `ssl=False` for local dev use |
| Widget code not updating | Delete `server_data/widgets/` and reload Canvas tab to re-seed |
