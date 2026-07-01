#!/usr/bin/env python3
"""
Quick end-to-end test for the init-from-template skill.

Usage:
  python3 test-init-template.py                          # search "react vite starter"
  python3 test-init-template.py "fastapi python api"    # custom query
  python3 test-init-template.py --out /tmp/my-project   # custom output directory
  python3 test-init-template.py --id <template-id>      # skip search, download by ID
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.parse

CREDS_FILE = os.path.join(os.environ.get("BZ_HOME") or "/usr/local/boltzbit", "credentials.json")


def load_creds():
    if not os.path.exists(CREDS_FILE):
        sys.exit("✗ No credentials found. Sign in via the app first (POST /auth).")
    with open(CREDS_FILE) as f:
        creds = json.load(f)
    if not creds:
        sys.exit("✗ credentials.json is empty.")
    base_url = list(creds.keys())[0].rstrip("/")
    token = list(creds.values())[0].get("accessToken", "")
    if not token:
        sys.exit("✗ No accessToken in credentials.json.")
    return base_url, token


def api_get(url, token, binary=False):
    if binary:
        result = subprocess.run(
            ["curl", "-sL", "-w", "\n__HTTP__%{http_code}",
             "-H", f"Authorization: Bearer {token}",
             "-D", "/tmp/_bz_headers.txt", url],
            capture_output=True
        )
        # Split off the status line we appended
        parts = result.stdout.rsplit(b"\n__HTTP__", 1)
        body = parts[0]
        code = int(parts[1]) if len(parts) == 2 else 0
        if code >= 400:
            sys.exit(f"✗ HTTP {code} from {url}\n{body.decode()[:300]}")
        headers = {}
        if os.path.exists("/tmp/_bz_headers.txt"):
            for line in open("/tmp/_bz_headers.txt"):
                if ":" in line:
                    k, _, v = line.partition(":")
                    headers[k.strip().lower()] = v.strip()
        return body, headers
    else:
        result = subprocess.run(
            ["curl", "-sL", "-w", "\n__HTTP__%{http_code}",
             "-H", f"Authorization: Bearer {token}", url],
            capture_output=True, text=True
        )
        parts = result.stdout.rsplit("\n__HTTP__", 1)
        body = parts[0].strip()
        code = int(parts[1]) if len(parts) == 2 else 0
        if code >= 400:
            sys.exit(f"✗ HTTP {code} from {url}\n{body[:300]}")
        return json.loads(body)


def step_search(base_url, token, query):
    print(f'\n[1/4] Searching templates for: "{query}"')
    url = f"{base_url}/bz-appstore-api/v1/creator/apps/templates/search?query={urllib.parse.quote(query)}"
    results = api_get(url, token)
    if not results:
        print("  No templates found — the API returned an empty list.")
        return None
    print(f"  Found {len(results)} template(s):\n")
    for i, t in enumerate(results):
        default_tag = " [default]" if t.get("isDefault") else ""
        print(f"  [{i+1}] {t['name']}{default_tag}")
        if t.get("description"):
            print(f"      {t['description']}")
        if t.get("tags"):
            print(f"      tags: {', '.join(t['tags'])}")
        print(f"      id: {t['id']}")
        print()
    if len(results) == 1:
        chosen = results[0]
        print(f"  → Auto-selecting the only result: {chosen['name']}")
    else:
        while True:
            raw = input(f"  Pick a template [1-{len(results)}]: ").strip()
            if raw.isdigit() and 1 <= int(raw) <= len(results):
                chosen = results[int(raw) - 1]
                break
            print("  Invalid choice, try again.")
    return chosen


def step_download(base_url, token, template_id, out_dir):
    url = f"{base_url}/bz-appstore-api/v1/creator/apps/templates/{template_id}/download"
    print(f"[2/4] Downloading template {template_id}")
    print(f"      {url}")
    data, headers = api_get(url, token, binary=True)
    # Detect format from Content-Disposition or magic bytes
    disposition = headers.get("Content-Disposition", "")
    if ".tar.gz" in disposition or ".tgz" in disposition or data[:2] == b"\x1f\x8b":
        archive_path = os.path.join(out_dir, "_template.tar.gz")
        fmt = "tar"
    else:
        archive_path = os.path.join(out_dir, "_template.zip")
        fmt = "zip"
    with open(archive_path, "wb") as f:
        f.write(data)
    size_kb = len(data) // 1024
    print(f"  ✓ Downloaded {size_kb} KB → {archive_path}")
    return archive_path, fmt


def step_extract(archive_path, fmt, out_dir):
    print(f"[3/4] Extracting into {out_dir}")
    if fmt == "zip":
        result = subprocess.run(["unzip", "-o", archive_path, "-d", out_dir], capture_output=True, text=True)
    else:
        result = subprocess.run(["tar", "-xzf", archive_path, "-C", out_dir], capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"✗ Extraction failed:\n{result.stderr}")

    # Collapse single top-level directory if present
    entries = [e for e in os.listdir(out_dir) if not e.startswith("_template")]
    if len(entries) == 1 and os.path.isdir(os.path.join(out_dir, entries[0])):
        inner = os.path.join(out_dir, entries[0])
        print(f"  Collapsing single top-level directory: {entries[0]}/")
        for item in os.listdir(inner):
            shutil.move(os.path.join(inner, item), out_dir)
        os.rmdir(inner)

    os.remove(archive_path)

    # List extracted files
    extracted = []
    for root, dirs, files in os.walk(out_dir):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", "__pycache__")]
        for f in files:
            extracted.append(os.path.relpath(os.path.join(root, f), out_dir))
    print(f"  ✓ Extracted {len(extracted)} files")
    for p in sorted(extracted)[:20]:
        print(f"    {p}")
    if len(extracted) > 20:
        print(f"    … and {len(extracted) - 20} more")


def step_install(out_dir):
    print(f"[4/4] Installing dependencies")
    if os.path.exists(os.path.join(out_dir, "pnpm-lock.yaml")):
        cmd = ["pnpm", "install"]
    elif os.path.exists(os.path.join(out_dir, "package-lock.json")):
        cmd = ["npm", "install"]
    elif os.path.exists(os.path.join(out_dir, "yarn.lock")):
        cmd = ["yarn", "install"]
    elif os.path.exists(os.path.join(out_dir, "package.json")):
        cmd = ["pnpm", "install"]
    elif os.path.exists(os.path.join(out_dir, "requirements.txt")):
        cmd = ["pip", "install", "-r", "requirements.txt"]
    elif os.path.exists(os.path.join(out_dir, "pyproject.toml")):
        cmd = ["pip", "install", "-e", "."]
    elif os.path.exists(os.path.join(out_dir, "go.mod")):
        cmd = ["go", "mod", "download"]
    elif os.path.exists(os.path.join(out_dir, "Cargo.toml")):
        cmd = ["cargo", "build"]
    else:
        print("  No recognised dependency manifest — skipping install.")
        return

    print(f"  Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=out_dir)
    if result.returncode == 0:
        print("  ✓ Dependencies installed")
    else:
        print(f"  ✗ Install exited with code {result.returncode}")


def main():
    parser = argparse.ArgumentParser(description="Test the init-from-template skill end-to-end")
    parser.add_argument("query", nargs="?", default="react vite starter", help="Natural-language description of the project")
    parser.add_argument("--out", default=None, help="Output directory (default: ./test-project-<id>)")
    parser.add_argument("--id", default=None, help="Skip search and download a specific template by ID")
    parser.add_argument("--no-install", action="store_true", help="Skip the dependency install step")
    args = parser.parse_args()

    base_url, token = load_creds()
    print(f"✓ Credentials loaded (auth URL: {base_url})")

    if args.id:
        chosen = {"id": args.id, "name": args.id}
        print(f"\n[1/4] Skipping search — using template ID: {args.id}")
    else:
        chosen = step_search(base_url, token, args.query)
        if not chosen:
            sys.exit(0)

    out_dir = args.out or os.path.join(os.getcwd(), f"test-project-{chosen['id'][:8]}")
    os.makedirs(out_dir, exist_ok=True)

    archive_path, fmt = step_download(base_url, token, chosen["id"], out_dir)
    step_extract(archive_path, fmt, out_dir)

    if not args.no_install:
        step_install(out_dir)

    print(f"\n✓ Done — project at: {out_dir}")

    # Hint at dev command
    if os.path.exists(os.path.join(out_dir, "package.json")):
        pkg = json.load(open(os.path.join(out_dir, "package.json")))
        scripts = pkg.get("scripts", {})
        if "dev" in scripts:
            print(f"  Start: cd {out_dir} && pnpm dev")
        elif "start" in scripts:
            print(f"  Start: cd {out_dir} && pnpm start")
    elif os.path.exists(os.path.join(out_dir, "main.py")):
        print(f"  Start: cd {out_dir} && python main.py")


if __name__ == "__main__":
    main()
