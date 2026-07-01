#!/usr/bin/env bash
# Build the frontend and package everything into a deployment zip.
#
# The zip is always named bz-agent-v<version>.zip where <version> is read
# from BACKEND_VERSION in server.py.  An optional argument overrides the name.
#
# Usage:
#   ./scripts/build-deploy.sh                   # → bz-agent-v0.1.0.zip
#   ./scripts/build-deploy.sh bz-agent-v1.2     # → bz-agent-v1.2.zip

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

# Read version from server.py (BACKEND_VERSION = "x.y.z")
VERSION="$(grep -m1 'BACKEND_VERSION\s*=' "$ROOT/server.py" | sed 's/.*"\(.*\)".*/\1/')"
DEFAULT_OUTPUT="bz-agent-v${VERSION}"
OUTPUT="${1:-$DEFAULT_OUTPUT}"
ZIP_FILE="$ROOT/${OUTPUT}.zip"

cd "$ROOT"

echo "▶ 1/3  Building frontend…"
pnpm build

echo "▶ 2/3  Packaging deployment zip…"
rm -f "$ZIP_FILE"

zip -r "$ZIP_FILE" \
  app.py \
  server.py \
  requirements.txt \
  agent_modes.json \
  CHANGELOG.md \
  dist/ \
  server_data/widgets/ \
  server_data/credentials.json \
  bzcode_assets/

echo "▶ 3/3  Done."
echo ""
echo "  $(ls -lh "$ZIP_FILE" | awk '{print $5, $9}')"
echo ""
echo "  Contents:"
zip -sf "$ZIP_FILE" | grep -v "^Archive\|^End" | sed 's/^/    /'
