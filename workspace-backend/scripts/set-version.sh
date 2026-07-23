#!/usr/bin/env bash
#
# Set and sync the product version across the frontend and backend.
#
# There is ONE version for the whole product. It is declared in three files that
# different tools read, so this script stamps all of them at once:
#
#   src/workspace_backend/__init__.py  __version__  — runtime source of truth
#                                                     (FastAPI docs + /api/v1/version)
#   pyproject.toml                     version      — build metadata / importlib
#   frontend/src/version.ts            FRONTEND_VERSION — UI + package.sh zip name
#
# Usage:
#   ./scripts/set-version.sh 0.6.5     # set every file to 0.6.5
#   ./scripts/set-version.sh           # show current versions and whether they agree
#
set -euo pipefail

cd "$(dirname "$0")/.."  # workspace-backend/

INIT="src/workspace_backend/__init__.py"
PYPROJECT="pyproject.toml"
VERSION_TS="frontend/src/version.ts"

current_init()      { grep -oE '__version__ = "[^"]*"' "$INIT" | grep -oE '[0-9][^"]*'; }
current_pyproject() { grep -m1 -oE '^version = "[^"]*"' "$PYPROJECT" | grep -oE '[0-9][^"]*'; }
current_ts()        { grep -oE "FRONTEND_VERSION = '[^']*'" "$VERSION_TS" | grep -oE "[0-9][^']*"; }

# No argument: report current state and exit non-zero if the files disagree.
if [ $# -eq 0 ]; then
  printf '%-34s %s\n' "$INIT" "$(current_init)"
  printf '%-34s %s\n' "$PYPROJECT" "$(current_pyproject)"
  printf '%-34s %s\n' "$VERSION_TS" "$(current_ts)"
  if [ "$(current_init)" = "$(current_pyproject)" ] && [ "$(current_init)" = "$(current_ts)" ]; then
    echo "==> in sync"
  else
    echo "==> OUT OF SYNC — run '$0 <version>' to fix" >&2
    exit 1
  fi
  exit 0
fi

VERSION="$1"
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?$'; then
  echo "ERROR: version must look like 1.2.3 or 1.2.3.4 (got '$VERSION')" >&2
  exit 1
fi

# In-place edit that works with both BSD (macOS) and GNU sed: write to a temp file.
replace() {  # <file> <sed-expression>
  local file="$1" expr="$2"
  sed -E "$expr" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

replace "$INIT"       "s/(__version__ = \")[^\"]*(\")/\1${VERSION}\2/"
replace "$PYPROJECT"  "s/^(version = \")[^\"]*(\")/\1${VERSION}\2/"
replace "$VERSION_TS" "s/(FRONTEND_VERSION = ')[^']*(')/\1${VERSION}\2/"

echo "==> set version to ${VERSION}"
printf '%-34s %s\n' "$INIT" "$(current_init)"
printf '%-34s %s\n' "$PYPROJECT" "$(current_pyproject)"
printf '%-34s %s\n' "$VERSION_TS" "$(current_ts)"
