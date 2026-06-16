#!/usr/bin/env bash
# Build the frontend and package everything into a deployment zip.
#
# Usage:
#   ./scripts/build-deploy.sh [output-name]
#
# Example:
#   ./scripts/build-deploy.sh                   # → deploy.zip
#   ./scripts/build-deploy.sh bz-agent-v1.2     # → bz-agent-v1.2.zip

set -euo pipefail

OUTPUT="${1:-deploy}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
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
  dist/ \
  server_data/widgets/ \
  server_data/credentials.json \
  bzcode/scripts/

echo "▶ 3/3  Done."
echo ""
echo "  $(ls -lh "$ZIP_FILE" | awk '{print $5, $9}')"
echo ""
echo "  Contents:"
zip -sf "$ZIP_FILE" | grep -v "^Archive\|^End" | sed 's/^/    /'
