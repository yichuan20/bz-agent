#!/usr/bin/env python3
"""dpyes CLI for boltzbit app building.

Commands: create-snippet, run-snippet, submit-job, job-status, list-snippets
"""

import argparse
import json
import os
import sys
import requests

BASE_URL_DEFAULT = "https://flow.boltzbit.com/bz-dpyes/api"
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


def load_code(code_str: str) -> str:
    if code_str.startswith("@"):
        with open(code_str[1:]) as f:
            return f.read()
    return code_str


def load_json(val: str):
    if val.startswith("@"):
        with open(val[1:]) as f:
            return json.load(f)
    return json.loads(val)


def cmd_create_snippet(args):
    api_key = get_credential("DPYES_API_KEY", args.api_key)
    payload: dict = {"name": args.name, "code": load_code(args.code)}
    if args.input_schema:
        payload["inputSchema"] = load_json(args.input_schema)
    if args.output_schema:
        payload["outputSchema"] = load_json(args.output_schema)
    if args.tags:
        payload["tags"] = args.tags
    r = requests.post(f"{args.base_url}/v1/codes", headers=json_headers(api_key), json=payload)
    r.raise_for_status()
    result = r.json()
    # Normalise snippet ID key
    snippet_id = result.get("id") or result.get("snippetId") or result.get("codeId", "")
    print(json.dumps({"snippetId": snippet_id, **result}))


def cmd_run_snippet(args):
    api_key = get_credential("DPYES_API_KEY", args.api_key)
    input_data = load_json(args.data) if args.data else {}
    r = requests.post(
        f"{args.base_url}/v1/codes/{args.snippet_id}/execute",
        headers=json_headers(api_key),
        json={"input": input_data},
    )
    r.raise_for_status()
    print(json.dumps(r.json()))


def cmd_submit_job(args):
    api_key = get_credential("DPYES_API_KEY", args.api_key)
    input_data = load_json(args.data) if args.data else {}
    payload = {"codeId": args.snippet_id, "input": input_data}
    r = requests.post(f"{args.base_url}/v1/jobs", headers=json_headers(api_key), json=payload)
    r.raise_for_status()
    result = r.json()
    job_id = result.get("id") or result.get("jobId", "")
    print(json.dumps({"jobId": job_id, **result}))


def cmd_job_status(args):
    api_key = get_credential("DPYES_API_KEY", args.api_key)
    r = requests.get(
        f"{args.base_url}/v1/jobs/{args.job_id}",
        headers={"X-API-Key": api_key},
    )
    r.raise_for_status()
    print(json.dumps(r.json()))


def cmd_list_snippets(args):
    api_key = get_credential("DPYES_API_KEY", args.api_key)
    params: dict = {}
    if args.limit is not None:
        params["limit"] = args.limit
    r = requests.get(
        f"{args.base_url}/v1/codes",
        headers={"X-API-Key": api_key},
        params=params,
    )
    r.raise_for_status()
    print(json.dumps(r.json()))


def main():
    parser = argparse.ArgumentParser(description="dpyes CLI — remote Python execution service")
    parser.add_argument("--api-key", default=None, help="DPYES_API_KEY (falls back to /credentials/)")
    parser.add_argument("--base-url", default=BASE_URL_DEFAULT)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-snippet", help="Register a Python snippet (prints snippetId)")
    p.add_argument("--name", required=True)
    p.add_argument("--code", required=True, help="Python source or @file.py")
    p.add_argument("--input-schema", default=None, help="JSON Schema string or @file.json")
    p.add_argument("--output-schema", default=None, help="JSON Schema string or @file.json")
    p.add_argument("--tags", nargs="*", default=[])

    p = sub.add_parser("run-snippet", help="Execute a snippet synchronously")
    p.add_argument("--snippet-id", required=True)
    p.add_argument("--data", default=None, help="JSON input dict")

    p = sub.add_parser("submit-job", help="Submit an async job (prints jobId)")
    p.add_argument("--snippet-id", required=True, help="Code/snippet ID to run")
    p.add_argument("--data", default=None, help="JSON input dict")

    p = sub.add_parser("job-status", help="Poll job status and output")
    p.add_argument("--job-id", required=True)

    p = sub.add_parser("list-snippets", help="List registered snippets")
    p.add_argument("--limit", default=None, type=int)

    args = parser.parse_args()
    dispatch = {
        "create-snippet": cmd_create_snippet,
        "run-snippet": cmd_run_snippet,
        "submit-job": cmd_submit_job,
        "job-status": cmd_job_status,
        "list-snippets": cmd_list_snippets,
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
