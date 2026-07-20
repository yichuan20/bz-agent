#!/usr/bin/env python3
"""
bzapp-publish-batch — Orchestrate full template generation and BoltzHub upload.

Pipeline per manifest entry:
  1. bzapp-pack: lingma app → packed base (once per base_app)
  2. bzapp-variant: base + vertical + token → variant dir
  3. pnpm build inside variant dir
  4. zip + upload to BoltzHub template API
  5. Write returned template ID back to manifest

Usage:
  python3 bzapp-publish-batch.py --manifest manifest.json
  python3 bzapp-publish-batch.py --manifest manifest.json --dry-run
  python3 bzapp-publish-batch.py --manifest manifest.json --filter category=management
  python3 bzapp-publish-batch.py --manifest manifest.json --limit 5
  python3 bzapp-publish-batch.py --manifest manifest.json --only mgmt-hubspot-healthcare:warm
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error
import zipfile
import io
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PACK_SCRIPT = SCRIPT_DIR / "bzapp-pack.py"
VARIANT_SCRIPT = SCRIPT_DIR / "bzapp-variant.py"
CRED_SERVER = "http://localhost:18789"


def _get_api_key() -> str:
    env = os.environ.get("BZ_API_KEY")
    if env:
        return env
    try:
        with urllib.request.urlopen(f"{CRED_SERVER}/credentials/BZ_API_KEY", timeout=3) as r:
            val = json.loads(r.read()).get("value", "")
            if val:
                return val
    except Exception:
        pass
    try:
        bz_home = os.environ.get("BZ_HOME") or os.path.expanduser("~/.boltzbit")
        with open(os.path.join(bz_home, "api_keys.json")) as f:
            val = json.load(f).get("BZ_API_KEY", "")
            if val:
                return val
    except Exception:
        pass
    print("[error] BZ_API_KEY not found", file=sys.stderr)
    sys.exit(1)


def _run(cmd: str, cwd: Path, label: str) -> tuple[bool, str]:
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        return False, result.stderr[:500]
    return True, ""


def _zip_dir(src: Path) -> bytes:
    buf = io.BytesIO()
    skip = {"node_modules", ".git", "dist"}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(src):
            dirs[:] = [d for d in dirs if d not in skip]
            for fname in files:
                fpath = Path(root) / fname
                arcname = fpath.relative_to(src)
                zf.write(fpath, arcname)
    return buf.getvalue()


def _upload(zip_bytes: bytes, name: str, description: str, tags: list[str], api_key: str, boltzhub_url: str) -> str | None:
    """Upload template zip to BoltzHub. Returns template ID or None on failure."""
    import email.mime.multipart
    import email.mime.base
    import email.encoders

    boundary = "BzTemplateBoundary"
    meta = json.dumps({"name": name, "description": description, "tags": tags}).encode()

    body_parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"metadata\"\r\nContent-Type: application/json\r\n\r\n".encode() + meta + b"\r\n",
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"template.zip\"\r\nContent-Type: application/zip\r\n\r\n".encode() + zip_bytes + b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    body = b"".join(body_parts)

    url = f"{boltzhub_url}/bz-appstore-api/v1/creator/apps/templates"
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "X-API-Key": api_key,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": "BoltzTemplatePacker/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
            return data.get("id") or data.get("templateId")
    except urllib.error.HTTPError as e:
        body_err = e.read().decode(errors="replace")[:300]
        print(f"  [upload-err] HTTP {e.code}: {body_err}", file=sys.stderr)
        return None
    except Exception as ex:
        print(f"  [upload-err] {ex}", file=sys.stderr)
        return None


def _entry_key(entry: dict) -> str:
    return f"{entry['vertical']}:{entry['token']}"


def process_entry(
    entry: dict,
    bases_dir: Path,
    variants_dir: Path,
    lingma_root: Path,
    boltzhub_url: str,
    api_key: str,
    dry_run: bool,
    skip_build: bool,
) -> dict:
    """Process one manifest entry end-to-end. Returns updated entry dict."""
    key = _entry_key(entry)
    base_app = entry["base_app"]
    vertical_id = entry["vertical"]
    token_id = entry["token"]
    name = entry["name"]
    description = entry["description"]
    tags = entry.get("tags", [])

    print(f"\n[{key}] Starting")

    # Step 1: pack base (shared across entries with same base_app)
    base_dir = bases_dir / base_app
    if not base_dir.exists():
        lingma_app = lingma_root / base_app
        if not lingma_app.exists():
            print(f"  [{key}] [error] lingma app not found: {lingma_app}", file=sys.stderr)
            entry["status"] = "error:no-source"
            return entry

        pack_cmd = (
            f"python3 {PACK_SCRIPT} "
            f"--source {lingma_app} "
            f"--dest {base_dir} "
            f"--name {base_app!r} "
            f"{'--skip-build' if skip_build else ''}"
        )
        ok, err = _run(pack_cmd, SCRIPT_DIR, f"pack:{base_app}")
        if not ok:
            print(f"  [{key}] [error] pack failed: {err}", file=sys.stderr)
            entry["status"] = "error:pack"
            return entry
        print(f"  [{key}] Base packed: {base_dir.name}")
    else:
        print(f"  [{key}] Base already packed: {base_dir.name}")

    # Step 2: variant
    variant_dir = variants_dir / f"{base_app}-{vertical_id}-{token_id}"
    vertical_file = SCRIPT_DIR / "verticals" / f"{vertical_id}.json"
    token_file = SCRIPT_DIR / "tokens" / f"{token_id}.css"

    variant_cmd = (
        f"python3 {VARIANT_SCRIPT} "
        f"--source {base_dir} "
        f"--dest {variant_dir} "
        f"--vertical {vertical_file} "
        f"--token {token_file} "
        f"--boltzhub-name {name!r} "
        f"--boltzhub-desc {description!r} "
        f"--boltzhub-tags {','.join(tags)!r}"
    )
    ok, err = _run(variant_cmd, SCRIPT_DIR, f"variant:{key}")
    if not ok:
        print(f"  [{key}] [error] variant failed: {err}", file=sys.stderr)
        entry["status"] = "error:variant"
        return entry
    print(f"  [{key}] Variant created: {variant_dir.name}")

    # Step 3: build
    if not skip_build:
        ok, err = _run("pnpm build", variant_dir, f"build:{key}")
        if not ok:
            print(f"  [{key}] [error] build failed: {err}", file=sys.stderr)
            entry["status"] = "error:build"
            return entry
        print(f"  [{key}] Build succeeded")

    if dry_run:
        print(f"  [{key}] [dry-run] Would upload: {name!r}")
        entry["status"] = "dry-run"
        return entry

    # Step 4: zip + upload
    print(f"  [{key}] Zipping…")
    zip_bytes = _zip_dir(variant_dir)
    print(f"  [{key}] Uploading ({len(zip_bytes)//1024}KB)…")
    template_id = _upload(zip_bytes, name, description, tags, api_key, boltzhub_url)
    if template_id:
        entry["id"] = template_id
        entry["status"] = "published"
        print(f"  [{key}] Published → id={template_id}")
    else:
        entry["status"] = "error:upload"
        print(f"  [{key}] [error] Upload failed", file=sys.stderr)

    return entry


def main():
    parser = argparse.ArgumentParser(description="Batch generate and publish BoltzHub templates")
    parser.add_argument("--manifest", default="manifest.json")
    parser.add_argument("--workspace", default="/tmp/bzapp-template-workspace", help="Working directory for packed bases and variants")
    parser.add_argument("--dry-run", action="store_true", help="Pack and build but do not upload")
    parser.add_argument("--skip-build", action="store_true", help="Skip pnpm build (faster, less safe)")
    parser.add_argument("--filter", default=None, help="key=value filter e.g. category=management")
    parser.add_argument("--only", default=None, help="Comma-separated vertical:token keys to process")
    parser.add_argument("--limit", default=None, type=int, help="Max number of entries to process")
    parser.add_argument("--workers", default=2, type=int, help="Parallel workers (default 2; limited by pnpm build I/O)")
    args = parser.parse_args()

    manifest_path = Path(args.manifest).resolve()
    manifest = json.loads(manifest_path.read_text())
    lingma_root = Path(manifest["lingma_root"])
    boltzhub_url = manifest.get("boltzhub_url", "https://boltzhub.com")

    workspace = Path(args.workspace)
    bases_dir = workspace / "bases"
    variants_dir = workspace / "variants"
    bases_dir.mkdir(parents=True, exist_ok=True)
    variants_dir.mkdir(parents=True, exist_ok=True)

    api_key = "" if args.dry_run else _get_api_key()

    entries = manifest["templates"]

    # Apply filters
    if args.filter:
        k, v = args.filter.split("=", 1)
        entries = [e for e in entries if str(e.get(k, "")) == v]
    if args.only:
        keys = set(args.only.split(","))
        entries = [e for e in entries if _entry_key(e) in keys]
    # Skip already published
    entries = [e for e in entries if not e.get("id")]
    if args.limit:
        entries = entries[:args.limit]

    print(f"[batch] Processing {len(entries)} templates (workers={args.workers}, dry_run={args.dry_run})")

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(
                process_entry,
                dict(e), bases_dir, variants_dir, lingma_root, boltzhub_url,
                api_key, args.dry_run, args.skip_build,
            ): e
            for e in entries
        }
        for fut in as_completed(futures):
            original = futures[fut]
            try:
                updated = fut.result()
            except Exception as ex:
                updated = {**original, "status": f"error:{ex}"}
            results.append(updated)

    # Write updated IDs back to manifest
    result_map = {_entry_key(r): r for r in results}
    for entry in manifest["templates"]:
        key = _entry_key(entry)
        if key in result_map:
            updated = result_map[key]
            if updated.get("id"):
                entry["id"] = updated["id"]
            entry["status"] = updated.get("status", "")

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    # Summary
    published = [r for r in results if r.get("status") == "published"]
    errors = [r for r in results if r.get("status", "").startswith("error")]
    dry = [r for r in results if r.get("status") == "dry-run"]
    print(f"\n[batch] Done: {len(published)} published, {len(dry)} dry-run, {len(errors)} errors")
    for e in errors:
        print(f"  [fail] {_entry_key(e)}: {e.get('status')}", file=sys.stderr)


if __name__ == "__main__":
    main()
