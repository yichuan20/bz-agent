#!/usr/bin/env python3
"""
bzapp-pack — Convert a lingma app into a BoltzHub-compatible base template.

What it does:
  1. Copies the lingma app to a destination directory
  2. Adds @boltzbit/auth-utils, bz-api-client, dynas-client to package.json
  3. Injects src/auth.ts (standard Boltzbit OAuth + Dynas setup)
  4. Rewrites src/main.tsx to call setupAuth() before rendering
  5. Creates .env skeleton and .bzhub/app_config.json skeleton
  6. Optionally runs pnpm install + pnpm build to verify

Usage:
  python3 bzapp-pack.py --source /path/to/lingma/apps/hubspot --dest /tmp/hubspot-base
  python3 bzapp-pack.py --source ... --dest ... --skip-build
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

AUTH_TS = """\
import { getAccessToken, initOAuth } from '@boltzbit/auth-utils';
import { type BzApiClient, createBzApiClient } from '@boltzbit/bz-api-client';
import type { DynasClient } from '@boltzbit/dynas-client';
import { createDynasClient } from '@boltzbit/dynas-client';

const apiClient: BzApiClient = createBzApiClient({
  apiBaseUrl: `${import.meta.env.VITE_API_BASE_URL}/v1/bz-api`,
  getAuthToken: () => getAccessToken() ?? 'PUBLIC',
});

const dynasClient: DynasClient = createDynasClient({
  apiBaseUrl: `${import.meta.env.VITE_API_BASE_URL}/v1/bz-dynas/api`,
  getAuthToken: () => getAccessToken() ?? 'PUBLIC',
});

export { apiClient, dynasClient };

export async function setupAuth() {
  await initOAuth({
    clientId: import.meta.env.VITE_OAUTH_CLIENT_ID,
    redirectUri: `${window.location.origin}/`,
    apiBaseUrl: `${import.meta.env.VITE_API_BASE_URL}`,
    gatewayUrl: import.meta.env.VITE_GATEWAY_URL,
  });
}
"""

ENV_TEMPLATE = """\
# Boltzbit App Config — fill in after creating your BoltzHub app
VITE_OAUTH_CLIENT_ID=
VITE_DYNAS_APP_ID=
VITE_API_BASE_URL=https://boltzhub.com/bz-appstore-api
VITE_GATEWAY_URL=https://auth.boltzbit.com
"""

APP_CONFIG_SKELETON = {
    "id": "",
    "name": "",
    "description": "",
    "visibility": "private",
    "buildCommand": "pnpm build"
}

BOLTZBIT_DEPS = {
    "@boltzbit/auth-utils": "latest",
    "@boltzbit/bz-api-client": "latest",
    "@boltzbit/dynas-client": "latest"
}


def _patch_package_json(dest: Path) -> None:
    pkg_path = dest / "package.json"
    if not pkg_path.exists():
        print("  [warn] No package.json found — skipping dep injection")
        return
    pkg = json.loads(pkg_path.read_text())
    deps = pkg.setdefault("dependencies", {})
    for name, ver in BOLTZBIT_DEPS.items():
        if name not in deps:
            deps[name] = ver
    pkg_path.write_text(json.dumps(pkg, indent=2) + "\n")
    print(f"  [ok] Injected Boltzbit deps into package.json")


def _inject_auth_ts(dest: Path) -> None:
    auth_path = dest / "src" / "auth.ts"
    auth_path.write_text(AUTH_TS)
    print(f"  [ok] Wrote src/auth.ts")


def _patch_main_tsx(dest: Path) -> None:
    """Wrap the render call with setupAuth() promise chain."""
    main_path = dest / "src" / "main.tsx"
    if not main_path.exists():
        print("  [warn] No src/main.tsx — skipping entry point patch")
        return

    src = main_path.read_text()

    # Already patched
    if "setupAuth" in src:
        print("  [skip] src/main.tsx already has setupAuth")
        return

    # Inject import
    import_line = "import { setupAuth } from './auth';\n"
    if import_line not in src:
        # Add after last existing import
        src = re.sub(
            r"((?:import\s+.*?;\n)+)",
            lambda m: m.group(0) + import_line,
            src,
            count=1
        )

    # Find the ReactDOM.createRoot(...).render(...) block and wrap in setupAuth().then(...)
    # Pattern: find `ReactDOM.createRoot(root).render(` or `const root = ...` blocks
    render_patterns = [
        # Pattern: if (root) { ReactDOM.createRoot(root).render(...) }
        r"(if\s*\(root\)\s*\{[^}]+ReactDOM\.createRoot[^}]+\})",
        # Pattern: ReactDOM.createRoot(root!).render(...)
        r"(ReactDOM\.createRoot\([^)]+\)\.render\([\s\S]+?\);)",
    ]

    wrapped = False
    for pat in render_patterns:
        match = re.search(pat, src)
        if match:
            original = match.group(0)
            indented = "\n".join("  " + line for line in original.split("\n"))
            replacement = f"setupAuth().then(() => {{\n{indented}\n}});"
            src = src[:match.start()] + replacement + src[match.end():]
            wrapped = True
            break

    if not wrapped:
        # Fallback: append a setupAuth call comment at the end
        src += "\n// TODO: wrap render call with setupAuth().then(() => { ... });\n"
        print("  [warn] Could not auto-wrap render — added TODO comment in main.tsx")
    else:
        print("  [ok] Patched src/main.tsx to call setupAuth() before render")

    main_path.write_text(src)


def _write_env(dest: Path) -> None:
    env_path = dest / ".env"
    if env_path.exists():
        print("  [skip] .env already exists — not overwriting")
        return
    env_path.write_text(ENV_TEMPLATE)
    print("  [ok] Wrote .env skeleton")


def _write_bzhub_config(dest: Path, app_name: str) -> None:
    bzhub_dir = dest / ".bzhub"
    bzhub_dir.mkdir(exist_ok=True)
    config = {**APP_CONFIG_SKELETON, "name": app_name}
    (bzhub_dir / "app_config.json").write_text(json.dumps(config, indent=2) + "\n")
    print("  [ok] Wrote .bzhub/app_config.json skeleton")


def _run(cmd: str, cwd: Path) -> bool:
    print(f"  [run] {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  [err] {result.stderr[:500]}", file=sys.stderr)
        return False
    return True


def pack(source: Path, dest: Path, app_name: str, skip_build: bool) -> bool:
    if dest.exists():
        print(f"[warn] Destination {dest} already exists — removing")
        shutil.rmtree(dest)

    print(f"[pack] Copying {source} → {dest}")
    shutil.copytree(source, dest, ignore=shutil.ignore_patterns("node_modules", ".git", "dist", ".bzhub"))

    _patch_package_json(dest)
    _inject_auth_ts(dest)
    _patch_main_tsx(dest)
    _write_env(dest)
    _write_bzhub_config(dest, app_name)

    if not skip_build:
        print("[pack] Installing dependencies…")
        if not _run("pnpm install", dest):
            print("[fail] pnpm install failed", file=sys.stderr)
            return False
        print("[pack] Building…")
        if not _run("pnpm build", dest):
            print("[fail] pnpm build failed", file=sys.stderr)
            return False
        print("[pack] Build succeeded")

    print(f"[pack] Done → {dest}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Convert a lingma app to a BoltzHub base template")
    parser.add_argument("--source", required=True, help="Path to the lingma app (e.g. .../lingma-app-design/apps/hubspot)")
    parser.add_argument("--dest", required=True, help="Output directory for the base template")
    parser.add_argument("--name", default="", help="App display name (defaults to source dir name)")
    parser.add_argument("--skip-build", action="store_true", help="Skip pnpm install + build verification")
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    dest = Path(args.dest).expanduser().resolve()
    name = args.name or source.name.replace("-", " ").title()

    if not source.exists():
        print(f"[error] Source not found: {source}", file=sys.stderr)
        sys.exit(1)

    ok = pack(source, dest, name, args.skip_build)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
