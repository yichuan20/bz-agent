#!/usr/bin/env python3
"""
bzapp-template — BoltzHub template search & download helper.

Commands:
  search   <query>                     Search for matching templates
  download <template_id> <dest_file>   Download a template archive by ID
  download-auto <query> <dest_file>    Search + download best match in one step
  list                                 List all available templates

Auth: reads BZ_API_KEY from the local credentials server. Never prints tokens.
"""

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
import urllib.error

BASE_URL = os.environ.get("BOLTZHUB_URL", "https://boltzhub.com")
APPSTORE = f"{BASE_URL}/bz-appstore-api/v1"


def _get_api_key(cli_value=None):
    if cli_value:
        return cli_value
    env_val = os.environ.get("BZ_API_KEY")
    if env_val:
        return env_val
    # Fallback: try api_keys.json directly
    try:
        server = os.environ.get("BZ_AGENT_URL", "http://localhost:18789")
        with __import__("urllib.request", fromlist=["urlopen"]).urlopen(
            f"{server}/api/v1/secrets/BZ_API_KEY", timeout=3
        ) as _r:
            val = __import__("json").loads(_r.read()).get("value", "")
            if val:
                return val
    except Exception:
        pass
    try:
        bz_home = os.environ.get("BZ_HOME") or os.path.expanduser("~/.boltzbit")
        keys_path = os.path.join(bz_home, "api_keys.json")
        with open(keys_path) as f:
            val = json.load(f).get("BZ_API_KEY", "")
            if val:
                return val
    except Exception:
        pass
    print("ERROR: BZ_API_KEY not found. Save it first:", file=sys.stderr)
    print('  PUT /api/v1/secrets  {"key":"BZ_API_KEY","value":"bz_..."}  (on the running backend)', file=sys.stderr)
    sys.exit(1)


def _request(url, api_key, dest_file=None):
    """Make an authenticated GET. If dest_file given, stream body there; else return parsed JSON."""
    req = urllib.request.Request(
        url,
        headers={
            "X-API-Key": api_key,
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json, application/zip, application/gzip, */*",
            "User-Agent": "BoltzAgent/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if dest_file:
                with open(dest_file, "wb") as f:
                    while True:
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        f.write(chunk)
                return None
            else:
                return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        print(f"ERROR: HTTP {e.code} from {url}", file=sys.stderr)
        # Never print the URL if it contains auth params
        safe_body = body[:300]
        print(f"  {safe_body}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_search(args):
    api_key = _get_api_key(args.api_key)
    query = urllib.parse.quote(args.query)
    url = f"{APPSTORE}/creator/apps/templates/search?query={query}"
    results = _request(url, api_key)
    if not isinstance(results, list):
        results = results.get("templates") or results.get("results") or []
    if not results:
        print(json.dumps({"templates": [], "message": "No templates found"}))
        return
    # Strip any credential-looking fields before printing
    safe = []
    for t in results:
        safe.append({k: v for k, v in t.items() if k not in ("token", "secret", "accessToken")})
    print(json.dumps({"templates": safe}))


def cmd_download(args):
    api_key = _get_api_key(args.api_key)
    url = f"{APPSTORE}/creator/apps/templates/{urllib.parse.quote(args.template_id)}/download"
    _request(url, api_key, dest_file=args.dest)
    print(json.dumps({"ok": True, "file": args.dest}))


def cmd_download_auto(args):
    api_key = _get_api_key(args.api_key)
    query = urllib.parse.quote(args.query)
    url = f"{APPSTORE}/creator/apps/templates/download?query={query}"
    _request(url, api_key, dest_file=args.dest)
    print(json.dumps({"ok": True, "file": args.dest}))


def cmd_list(args):
    api_key = _get_api_key(args.api_key)
    url = f"{APPSTORE}/creator/apps/templates"
    results = _request(url, api_key)
    if not isinstance(results, list):
        results = results.get("templates") or results.get("results") or []
    safe = [{k: v for k, v in t.items() if k not in ("token", "secret", "accessToken")} for t in results]
    print(json.dumps({"templates": safe}))


def cmd_fix_env(args):
    """Clean up .env after template extraction:
    - Clear VITE_OAUTH_CLIENT_ID and VITE_DYNAS_APP_ID (template-specific values must not carry over)
    - Set VITE_GATEWAY_URL to the canonical auth URL
    """
    env_path = os.path.join(args.dest, ".env")
    if not os.path.exists(env_path):
        print(json.dumps({"ok": True, "message": "No .env file found — nothing to fix"}))
        return

    CLEAR_KEYS = {"VITE_OAUTH_CLIENT_ID", "VITE_DYNAS_APP_ID"}
    GATEWAY_URL = "https://auth.boltzbit.com"

    lines = []
    changed = []
    with open(env_path) as f:
        for line in f:
            stripped = line.rstrip("\n")
            # Match KEY=value (with or without quotes)
            if "=" in stripped and not stripped.lstrip().startswith("#"):
                key, _, _ = stripped.partition("=")
                key = key.strip()
                if key in CLEAR_KEYS:
                    lines.append(f"{key}=\n")
                    changed.append(f"cleared {key}")
                    continue
                if key == "VITE_GATEWAY_URL":
                    lines.append(f"VITE_GATEWAY_URL={GATEWAY_URL}\n")
                    changed.append(f"set VITE_GATEWAY_URL={GATEWAY_URL}")
                    continue
            lines.append(line if line.endswith("\n") else line + "\n")

    with open(env_path, "w") as f:
        f.writelines(lines)

    print(json.dumps({"ok": True, "file": env_path, "changes": changed}))


def main():
    parser = argparse.ArgumentParser(description="BoltzHub template helper")
    parser.add_argument("--api-key", help="BZ_API_KEY (omit to auto-detect)")
    sub = parser.add_subparsers(dest="command")

    p_search = sub.add_parser("search")
    p_search.add_argument("query")

    p_dl = sub.add_parser("download")
    p_dl.add_argument("template_id")
    p_dl.add_argument("dest")

    p_auto = sub.add_parser("download-auto")
    p_auto.add_argument("query")
    p_auto.add_argument("dest")

    sub.add_parser("list")

    p_fix = sub.add_parser("fix-env")
    p_fix.add_argument("dest", help="Directory containing the extracted template (must have a .env file)")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    {
        "search": cmd_search,
        "download": cmd_download,
        "download-auto": cmd_download_auto,
        "list": cmd_list,
        "fix-env": cmd_fix_env,
    }[args.command](args)


if __name__ == "__main__":
    main()
