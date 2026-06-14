#!/usr/bin/env bash
# Build the frontend and start the Python server serving both API, WebSocket, and SPA.
#
# Usage:
#   ./scripts/build-and-serve.sh [--bzcode ./bzcode] [--host 0.0.0.0] [--port 18789]
#
# Everything runs on a single port (default 18789):
#   GET /ws       → bzcode WebSocket bridge  (ws://host:18789/ws)
#   /sessions     → Python API
#   /widgets      → Python API
#   /             → dist/index.html  (SPA)
#   /assets/*     → dist/assets/*   (JS/CSS bundles)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

cd "$ROOT"

echo "[build] Running pnpm build…"
pnpm build
echo "[build] Frontend built → dist/"

echo "[serve] Starting FastAPI server on port 18789…"
exec .venv/bin/python app.py \
  --dist "./dist" \
  "$@"
