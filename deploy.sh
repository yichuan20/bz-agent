#!/usr/bin/env bash
# Build frontend and package bz-agent for deployment.
# Usage: ./deploy.sh [version]   e.g.  ./deploy.sh 0.1.3
set -euo pipefail

# Always run relative to this script's directory.
cd "$(dirname "$0")"

VERSION="${1:-$(grep -m1 'BACKEND_VERSION' server.py | grep -oE '[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?')}"
ZIPFILE="bz-agent-v${VERSION}.zip"

echo "==> Building frontend..."
rm -rf dist/
pnpm build

# Sanity check: abort if dist/ wasn't produced.
if [ ! -d dist/assets ]; then
  echo "ERROR: dist/assets missing after build — aborting." >&2
  exit 1
fi

echo "==> Packaging ${ZIPFILE}..."
rm -f "${ZIPFILE}"
zip -r "${ZIPFILE}" \
  app.py \
  server.py \
  requirements.txt \
  agent_modes.json \
  dist/ \
  bzcode_assets/ \
  server_data/widgets/ \
  -x "*.pyc" \
  -x "*/__pycache__/*"

echo "==> Done: $(ls -lh "${ZIPFILE}" | awk '{print $5, $9}')"
