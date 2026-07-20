#!/usr/bin/env python3
"""Anksy CLI for boltzbit app building.

Commands: register-route, update-route, delete-route, list-routes, get-route, import-spec, list-apps

All route paths must start with /api/ (Anksy gateway requirement).
App namespace is created implicitly when first route is registered — no create-app step needed.
"""

import argparse
import json
import os
import sys
import requests

BASE_URL_DEFAULT = "https://boltzhub.com/bz-anksy"
CRED_SERVER = "http://localhost:18789"


def get_credential(name: str, cli_value=None) -> str:
    if cli_value:
        return cli_value
    env_val = os.environ.get(name)
    if env_val:
        return env_val
    try:
        r = requests.get(f"{CRED_SERVER}/credentials/{name}", timeout=3)
        val = r.json().get("value", "")
        if val:
            return val
    except Exception:
        pass
    try:
        bz_home = os.environ.get("BZ_HOME") or os.path.expanduser("~/.boltzbit")
        with open(os.path.join(bz_home, "api_keys.json")) as f:
            val = json.load(f).get(name, "")
            if val:
                return val
    except Exception:
        pass
    raise SystemExit(f"Credential '{name}' not found. Ask user to save it via POST /credentials.")


def json_headers(api_key: str) -> dict:
    return {"X-API-Key": api_key, "Content-Type": "application/json"}


def load_spec(spec_str: str):
    if spec_str.startswith("@"):
        with open(spec_str[1:]) as f:
            return json.load(f)
    return json.loads(spec_str)


def emit_swagger_url(base_url: str, app_id: str):
    print(f"Swagger UI: {base_url}/apps/{app_id}/docs", file=sys.stderr)


def cmd_register_route(args):
    api_key = get_credential("ANKSY_API_KEY", args.api_key)
    app_id = args.app_id or get_credential("ANKSY_APP_ID")
    spec = load_spec(args.spec)
    path = spec.get("path", "")
    if not path.startswith("/api/"):
        print(f'Warning: route path "{path}" does not start with /api/ — Anksy will reject it.', file=sys.stderr)
    r = requests.post(
        f"{args.base_url}/apps/{app_id}/routes",
        headers=json_headers(api_key),
        json=spec,
    )
    r.raise_for_status()
    print(json.dumps(r.json()))
    emit_swagger_url(args.base_url, app_id)


def cmd_update_route(args):
    api_key = get_credential("ANKSY_API_KEY", args.api_key)
    app_id = args.app_id or get_credential("ANKSY_APP_ID")
    spec = load_spec(args.spec)
    r = requests.put(
        f"{args.base_url}/apps/{app_id}/routes/{args.route_id}",
        headers=json_headers(api_key),
        json=spec,
    )
    r.raise_for_status()
    print(json.dumps(r.json()))
    emit_swagger_url(args.base_url, app_id)


def cmd_delete_route(args):
    api_key = get_credential("ANKSY_API_KEY", args.api_key)
    app_id = args.app_id or get_credential("ANKSY_APP_ID")
    r = requests.delete(
        f"{args.base_url}/apps/{app_id}/routes/{args.route_id}",
        headers={"X-API-Key": api_key},
    )
    r.raise_for_status()
    print(json.dumps({"deleted": args.route_id}))


def cmd_list_routes(args):
    api_key = get_credential("ANKSY_API_KEY", args.api_key)
    app_id = args.app_id or get_credential("ANKSY_APP_ID")
    params: dict = {}
    if args.method:
        params["method"] = args.method
    if args.path_prefix:
        params["path_prefix"] = args.path_prefix
    r = requests.get(
        f"{args.base_url}/apps/{app_id}/routes",
        headers={"X-API-Key": api_key},
        params=params,
    )
    r.raise_for_status()
    print(json.dumps(r.json()))
    emit_swagger_url(args.base_url, app_id)


def cmd_get_route(args):
    api_key = get_credential("ANKSY_API_KEY", args.api_key)
    app_id = args.app_id or get_credential("ANKSY_APP_ID")
    r = requests.get(
        f"{args.base_url}/apps/{app_id}/routes/{args.route_id}",
        headers={"X-API-Key": api_key},
    )
    r.raise_for_status()
    print(json.dumps(r.json()))


def cmd_import_spec(args):
    api_key = get_credential("ANKSY_API_KEY", args.api_key)
    app_id = args.app_id or get_credential("ANKSY_APP_ID")
    filename = os.path.basename(args.file)
    with open(args.file, "rb") as f:
        r = requests.post(
            f"{args.base_url}/apps/{app_id}/import",
            headers={"X-API-Key": api_key},
            files={"file": (filename, f)},
        )
    r.raise_for_status()
    print(json.dumps(r.json()))
    emit_swagger_url(args.base_url, app_id)


def cmd_list_apps(args):
    api_key = get_credential("ANKSY_API_KEY", args.api_key)
    params: dict = {}
    if args.limit is not None:
        params["limit"] = args.limit
    r = requests.get(
        f"{args.base_url}/apps",
        headers={"X-API-Key": api_key},
        params=params,
    )
    r.raise_for_status()
    print(json.dumps(r.json()))


def main():
    parser = argparse.ArgumentParser(description="Anksy CLI — API semantic wrapper")
    parser.add_argument("--api-key", default=None, help="ANKSY_API_KEY (falls back to /credentials/)")
    parser.add_argument("--base-url", default=BASE_URL_DEFAULT)
    parser.add_argument("--app-id", default=None, help="Anksy app UUID (falls back to /credentials/ANKSY_APP_ID)")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("register-route", help="Register a new route (namespace auto-created)")
    p.add_argument("--spec", required=True, help="RouteCreate JSON or @file.json")

    p = sub.add_parser("update-route", help="Partially update an existing route")
    p.add_argument("--route-id", required=True, help="UUID of the route to update")
    p.add_argument("--spec", required=True, help="RouteUpdate JSON or @file.json")

    p = sub.add_parser("delete-route", help="Delete a route")
    p.add_argument("--route-id", required=True)

    p = sub.add_parser("list-routes", help="List all routes in the app namespace")
    p.add_argument("--method", default=None, choices=["GET", "POST", "PUT", "DELETE", "PATCH"])
    p.add_argument("--path-prefix", default=None, help="Filter by path prefix, e.g. /api/v1/orders")

    p = sub.add_parser("get-route", help="Get a single route by ID")
    p.add_argument("--route-id", required=True)

    p = sub.add_parser("import-spec", help="Bulk-import mock routes from an OpenAPI YAML/JSON file")
    p.add_argument("--file", required=True, help="Path to OpenAPI spec file")

    p = sub.add_parser("list-apps", help="List all app namespaces owned by this user")
    p.add_argument("--limit", default=None, type=int)

    args = parser.parse_args()
    dispatch = {
        "register-route": cmd_register_route,
        "update-route": cmd_update_route,
        "delete-route": cmd_delete_route,
        "list-routes": cmd_list_routes,
        "get-route": cmd_get_route,
        "import-spec": cmd_import_spec,
        "list-apps": cmd_list_apps,
    }
    try:
        dispatch[args.command](args)
    except requests.HTTPError as e:
        body = ""
        try:
            body = e.response.text
        except Exception:
            pass
        print(json.dumps({"error": str(e), "body": body}), file=sys.stderr)
        sys.exit(1)
    except SystemExit:
        raise
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
