#!/usr/bin/env bash
# Export a pip-installable requirements.txt from the uv lockfile.
#
# The remote deployment does NOT use uv — it installs into a plain venv with
# `pip install -r requirements.txt`. This script is the bridge: it pins every
# runtime dependency (from uv.lock) into a flat requirements.txt that pip can
# consume without any uv tooling on the server.
#
# Runtime deps only (no dev group), no hashes (keeps `pip install` forgiving
# across minor platform differences), and the project itself is excluded — the
# package source ships in the zip and is imported via PYTHONPATH=src.
#
# Usage: ./scripts/gen-requirements.sh
set -euo pipefail

cd "$(dirname "$0")/.."   # workspace-backend/

OUT="requirements.txt"

echo "==> Exporting ${OUT} from uv.lock..."
uv export \
  --no-dev \
  --no-emit-project \
  --no-hashes \
  --format requirements-txt \
  -o "${OUT}"

echo "==> Wrote ${OUT} ($(grep -cvE '^\s*#|^\s*$' "${OUT}") packages)"
