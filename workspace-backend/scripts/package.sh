#!/usr/bin/env bash
# Build the frontend and package workspace-backend for remote deployment.
#
# Produces bz-agent-v<VERSION>.zip containing everything the server needs, sized
# for a remote that has NO uv and NO Node — just Python + pip. The remote creates
# a venv, `pip install -r requirements.txt`, and runs uvicorn (see DEPLOY.md).
#
# Usage: ./scripts/package.sh [version]     e.g.  ./scripts/package.sh 0.6.4
set -euo pipefail

cd "$(dirname "$0")/.."   # workspace-backend/

# Version: explicit arg, else the shipped product version from the frontend.
VERSION="${1:-$(grep -m1 'FRONTEND_VERSION' frontend/src/version.ts | grep -oE '[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?')}"
if [ -z "${VERSION}" ]; then
  echo "ERROR: could not determine version — pass one explicitly: ./scripts/package.sh 0.6.4" >&2
  exit 1
fi
ZIPFILE="dist/bz-agent-v${VERSION}.zip"

echo "==> Building frontend (pnpm build)..."
( cd frontend && pnpm install && pnpm build )

# Sanity check: abort if the SPA build didn't produce assets.
if [ ! -d frontend/dist/assets ]; then
  echo "ERROR: frontend/dist/assets missing after build — aborting." >&2
  exit 1
fi

echo "==> Generating requirements.txt from uv.lock..."
./scripts/gen-requirements.sh

# The remote provisioner starts `uvicorn app:app` from /opt/boltzagent with no
# PYTHONPATH. Our package ships under src/, so inject a tiny top-level shim that
# puts src/ on sys.path and re-exports the real ASGI app. Generated only here at
# package time (removed on exit) — local dev uses `uvicorn workspace_backend.app:app`.
echo "==> Generating deployment entrypoint shim (app.py)..."
trap 'rm -f app.py' EXIT
cat > app.py <<'PYEOF'
"""Deployment entrypoint: thin re-export of the real app for `uvicorn app:app`.

The provisioner runs from /opt/boltzagent with no PYTHONPATH; the package ships
under src/, so put it on the path, then re-export.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from workspace_backend.app import app  # noqa: E402,F401
PYEOF

echo "==> Packaging ${ZIPFILE}..."
mkdir -p dist
rm -f "${ZIPFILE}"
zip -r "${ZIPFILE}" \
  app.py \
  src/ \
  pyproject.toml \
  .python-version \
  requirements.txt \
  agent_modes.json \
  bzcode_assets/ \
  server_data/widgets/ \
  frontend/dist/ \
  -x "*.pyc" \
  -x "*/__pycache__/*" \
  -x "*/.DS_Store" \
  -x "bzcode_assets/templates/*.md" \
  -x "bzcode_assets/templates/index.json" \
  -x "server_data/credentials.json" \
  -x "server_data/widget_data/*" \
  -x "server_data/custom_widgets/*"

echo "==> Done: $(ls -lh "${ZIPFILE}" | awk '{print $5, $9}')"
