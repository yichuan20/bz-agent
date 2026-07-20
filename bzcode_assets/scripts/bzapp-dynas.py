#!/usr/bin/env python3
"""Dynas CLI for boltzbit app building.

Commands: create-app, create-table, patch-table, seed, query, sql
"""

import argparse
import json
import os
import sys
import requests

BASE_URL_DEFAULT = "https://flow.boltzbit.com/bz-dynas/api"
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


def load_data(data_str: str):
    if data_str.startswith("@"):
        with open(data_str[1:]) as f:
            return json.load(f)
    return json.loads(data_str)


def json_headers(api_key: str) -> dict:
    return {"X-API-Key": api_key, "Content-Type": "application/json"}


def cmd_create_app(args):
    api_key = get_credential("DYNAS_API_KEY", args.api_key)
    data = load_data(args.data)
    r = requests.post(f"{args.base_url}/v1/apps", headers=json_headers(api_key), json=data)
    r.raise_for_status()
    print(json.dumps(r.json()))


def cmd_create_table(args):
    api_key = get_credential("DYNAS_API_KEY", args.api_key)
    app_id = args.app_id or get_credential("DYNAS_APP_ID")
    data = load_data(args.data)
    r = requests.post(
        f"{args.base_url}/v1/apps/{app_id}/tables",
        headers=json_headers(api_key),
        json=data,
    )
    r.raise_for_status()
    print(json.dumps(r.json()))


def cmd_patch_table(args):
    api_key = get_credential("DYNAS_API_KEY", args.api_key)
    app_id = args.app_id or get_credential("DYNAS_APP_ID")
    data = load_data(args.data)
    r = requests.patch(
        f"{args.base_url}/v1/apps/{app_id}/tables/{args.table}",
        headers=json_headers(api_key),
        json=data,
    )
    r.raise_for_status()
    print(json.dumps(r.json()))


def cmd_seed(args):
    api_key = get_credential("DYNAS_API_KEY", args.api_key)
    app_id = args.app_id or get_credential("DYNAS_APP_ID")
    records = load_data(args.data)
    if not isinstance(records, list):
        raise SystemExit("--data must be a JSON array for seed command")
    # Stringify dict/list values — Dynas json-type columns need string encoding
    for rec in records:
        for k, v in rec.items():
            if isinstance(v, (dict, list)):
                rec[k] = json.dumps(v)
    r = requests.post(
        f"{args.base_url}/v1/apps/{app_id}/tables/{args.table}/records/batch",
        headers=json_headers(api_key),
        json=records,
    )
    r.raise_for_status()
    print(json.dumps(r.json()))


def cmd_query(args):
    api_key = get_credential("DYNAS_API_KEY", args.api_key)
    app_id = args.app_id or get_credential("DYNAS_APP_ID")
    params = {}
    if args.filter:
        params["filter"] = args.filter
    if args.sort:
        params["sort"] = args.sort
    if args.limit is not None:
        params["limit"] = args.limit
    r = requests.get(
        f"{args.base_url}/v1/apps/{app_id}/tables/{args.table}/records",
        headers={"X-API-Key": api_key},
        params=params,
    )
    r.raise_for_status()
    print(json.dumps(r.json()))


def cmd_sql(args):
    api_key = get_credential("DYNAS_API_KEY", args.api_key)
    app_id = args.app_id or get_credential("DYNAS_APP_ID")
    payload = {"query": args.query, "readonly": True}
    if args.params:
        payload["params"] = json.loads(args.params)
    r = requests.post(
        f"{args.base_url}/v1/apps/{app_id}/tables/query",
        headers=json_headers(api_key),
        json=payload,
    )
    r.raise_for_status()
    print(json.dumps(r.json()))


def main():
    parser = argparse.ArgumentParser(description="Dynas CLI — boltzbit DB-as-a-service")
    parser.add_argument("--api-key", default=None, help="DYNAS_API_KEY (falls back to /credentials/)")
    parser.add_argument("--base-url", default=BASE_URL_DEFAULT)
    parser.add_argument("--app-id", default=None, help="Dynas app ID (falls back to /credentials/DYNAS_APP_ID)")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-app", help="Create a new Dynas app (prints appId)")
    p.add_argument("--data", required=True, help='JSON {"name","description","tables":[...]} or @file.json')

    p = sub.add_parser("create-table", help="Create a table in an existing app")
    p.add_argument("--data", required=True, help="TableInput JSON or @file.json")

    p = sub.add_parser("patch-table", help="Add/update/remove columns on a table")
    p.add_argument("--table", required=True)
    p.add_argument("--data", required=True, help="Alter JSON or @file.json")

    p = sub.add_parser("seed", help="Batch-insert records from a JSON array")
    p.add_argument("--table", required=True)
    p.add_argument("--data", required=True, help="JSON array or @file.json")

    p = sub.add_parser("query", help="Fetch records from a table")
    p.add_argument("--table", required=True)
    p.add_argument("--filter", default=None, help='e.g. [{"field":"status","op":"eq","value":"active"}]')
    p.add_argument("--sort", default=None, help='e.g. [{"field":"created_at","dir":"desc"}]')
    p.add_argument("--limit", default=None, type=int)

    p = sub.add_parser("sql", help="Run a read-only SQL query")
    p.add_argument("--query", required=True, help="SQL string")
    p.add_argument("--params", default=None, help="JSON array of bind params")

    args = parser.parse_args()
    dispatch = {
        "create-app": cmd_create_app,
        "create-table": cmd_create_table,
        "patch-table": cmd_patch_table,
        "seed": cmd_seed,
        "query": cmd_query,
        "sql": cmd_sql,
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
