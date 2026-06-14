#!/usr/bin/env bash
# Deploy BoltzAgent to a remote VM / LXC container.
#
# Usage:
#   ./scripts/deploy.sh <user@host> [remote-dir]
#
# Example:
#   ./scripts/deploy.sh ubuntu@192.168.1.100
#   ./scripts/deploy.sh root@lxc-01 /opt/boltzagent
#
# What it does:
#   1. Builds the frontend locally  (pnpm build)
#   2. Rsyncs the minimal artifact set to the VM
#   3. Installs Python dependencies on the VM
#   4. (Re)starts the server via the systemd service

set -euo pipefail

TARGET="${1:?Usage: $0 <user@host> [remote-dir]}"
REMOTE_DIR="${2:-/opt/boltzagent}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

cd "$ROOT"

echo "▶ 1/3  Building frontend…"
pnpm build

echo "▶ 2/3  Syncing files to ${TARGET}:${REMOTE_DIR}…"
# Only the server code, config, built frontend, and bzcode binary are needed.
# node_modules, .venv, src/, and dev tooling are NOT copied.
rsync -az --progress \
  --exclude '.venv' \
  --exclude 'node_modules' \
  --exclude 'src' \
  --exclude 'bzcode/scripts/__pycache__' \
  --exclude '*.pyc' \
  --exclude '.env' \
  --include 'app.py' \
  --include 'server.py' \
  --include 'agent_modes.json' \
  --include 'requirements.txt' \
  --include 'dist/***' \
  --include 'bzcode' \
  --include 'server_data/***' \
  --exclude '*' \
  . "${TARGET}:${REMOTE_DIR}/"

echo "▶ 3/3  Installing deps and restarting service on VM…"
ssh "$TARGET" bash -s <<REMOTE
  set -e
  cd "${REMOTE_DIR}"

  # Ensure Python 3.8+ and venv
  python3 -m venv .venv --upgrade-deps 2>/dev/null || python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt

  # Mark bzcode executable (may have lost permissions during rsync)
  chmod +x bzcode 2>/dev/null || true

  # Restart via systemd if unit exists, otherwise print the run command
  if systemctl is-active --quiet boltzagent 2>/dev/null; then
    systemctl restart boltzagent
    echo "✓ boltzagent service restarted"
  else
    echo ""
    echo "  Service not found. Start manually:"
    echo "  cd ${REMOTE_DIR} && BZCODE_PATH=./bzcode .venv/bin/uvicorn app:app --host 0.0.0.0 --port 18789"
    echo ""
    echo "  Or install the systemd unit:"
    echo "  sudo cp ${REMOTE_DIR}/scripts/boltzagent.service /etc/systemd/system/"
    echo "  sudo systemctl daemon-reload && sudo systemctl enable --now boltzagent"
  fi
REMOTE

echo "✓ Deploy complete → http://<vm-ip>:18789"
