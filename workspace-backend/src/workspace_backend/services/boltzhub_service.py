"""BoltzHub service — creator platform integration.

All helper functions and route logic copied verbatim from old server.py + app.py.
The only changes: aiohttp → httpx (already available), and the service class wraps
the module-level functions for FastAPI Depends injection.
"""

from __future__ import annotations

import asyncio
import io
import json
import os
import zipfile
from pathlib import Path
from typing import Any

# ── Constants (from server.py) ────────────────────────────────────────────────

BOLTZHUB_API = "https://boltzhub.com/bz-appstore-api"
BOLTZHUB_AUTH = "https://boltzhub.com"
_PUSH_EXCLUDE = {".git", "node_modules", ".bzhub", "__pycache__", ".venv", "venv"}


# ── Helpers (copied verbatim from server.py) ──────────────────────────────────


def _read_api_keys(bz_home: str) -> dict[str, str]:
    try:
        return json.loads((Path(bz_home) / "api_keys.json").read_text())
    except Exception:
        return {}


def boltzhub_token(bz_home: str) -> str | None:
    """Return an auth token. BZ_API_KEY (non-expiring) takes priority over OAuth JWT."""
    api_keys = _read_api_keys(bz_home)
    api_key = api_keys.get("BZ_API_KEY") or os.environ.get("BZ_API_KEY")
    if api_key:
        return api_key
    try:
        creds = json.loads((Path(bz_home) / "credentials.json").read_text())
        tok = creds.get(BOLTZHUB_AUTH, {}).get("accessToken")
        if tok:
            return tok
    except Exception:
        pass
    return None


def _read_app_config(cwd: str) -> dict[str, Any] | None:
    try:
        return json.loads((Path(cwd) / ".bzhub" / "app_config.json").read_text())
    except Exception:
        return None


def _write_app_config(cwd: str, config: dict[str, Any]) -> None:
    bzhub = Path(cwd) / ".bzhub"
    bzhub.mkdir(parents=True, exist_ok=True)
    (bzhub / "app_config.json").write_text(json.dumps(config, indent=2))


def _sync_env_oauth_client_id(cwd: str, app_id: str) -> None:
    """Ensure VITE_OAUTH_CLIENT_ID in .env matches the app ID from app_config.json."""
    env_path = Path(cwd) / ".env"
    if not env_path.exists():  # noqa: ASYNC240
        return
    lines = env_path.read_text().splitlines(keepends=True)
    new_lines = []
    found = False
    for line in lines:
        if "=" in line and not line.lstrip().startswith("#"):
            key, _, _ = line.partition("=")
            if key.strip() == "VITE_OAUTH_CLIENT_ID":
                new_lines.append(f"VITE_OAUTH_CLIENT_ID={app_id}\n")
                found = True
                continue
        new_lines.append(line)
    if not found:
        new_lines.append(f"VITE_OAUTH_CLIENT_ID={app_id}\n")
    env_path.write_text("".join(new_lines))


def _bz_headers(token: str) -> dict[str, str]:
    if token.startswith("bz_"):
        return {"X-API-Key": token, "Content-Type": "application/json"}
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _bz_auth(token: str) -> dict[str, str]:
    """Auth-only headers (no Content-Type) for multipart/form-data requests."""
    if token.startswith("bz_"):
        return {"X-API-Key": token}
    return {"Authorization": f"Bearer {token}"}


def _emit(step: str, message: str, **kw: Any) -> str:
    return f"data: {json.dumps({'step': step, 'message': message, **kw})}\n\n"


# ── Service ───────────────────────────────────────────────────────────────────


class BoltzHubService:
    """Thin wrapper around the module-level helpers for FastAPI Depends."""

    def __init__(self, bz_home: str, http: Any) -> None:
        self._bz_home = bz_home
        self._http = http  # httpx.AsyncClient

    def token(self) -> str | None:
        return boltzhub_token(self._bz_home)

    # ── check (pure filesystem — no HTTP call) ────────────────────────────────

    def check(self, cwd: str, default_cwd: str) -> dict[str, Any]:
        if not cwd:
            cwd = default_cwd
        token = self.token()
        cfg = _read_app_config(cwd)
        bzhub_dir = Path(cwd) / ".bzhub"
        return {
            "isLoggedIn": bool(token),
            "hasAppConfig": bool(cfg),
            "appConfig": cfg,
            "hasBzhubDir": bzhub_dir.is_dir(),  # noqa: ASYNC240
            "configPath": str(bzhub_dir / "app_config.json"),
            "dirName": Path(cwd).name,
            "cwd": cwd,
        }

    # ── create-app ────────────────────────────────────────────────────────────

    async def create_app(
        self,
        cwd: str,
        default_cwd: str,
        name: str,
        description: str | None,
        visibility: str,
        price_monthly: float | None,
        build_command: str | None,
    ) -> dict[str, Any]:
        token = self.token()
        if not token:
            raise PermissionError("Not logged in to BoltzHub")
        cwd = cwd or default_cwd
        api_body: dict[str, Any] = {"name": name, "visibility": visibility}
        if description:
            api_body["description"] = description
        if price_monthly:
            api_body["priceMonthly"] = price_monthly
        resp = await self._http.post(
            f"{BOLTZHUB_API}/v1/creator/apps",
            json=api_body,
            headers=_bz_headers(token),
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"BoltzHub {resp.status_code}: {resp.text}")
        result = resp.json()
        cfg: dict[str, Any] = {
            "id": result["id"],
            "name": result["name"],
            "description": result.get("description"),
            "visibility": result.get("visibility", "private"),
            "buildCommand": build_command,
            "createdAt": result.get("createdAt"),
        }
        await asyncio.to_thread(_write_app_config, cwd, cfg)
        return {"ok": True, "appConfig": cfg}

    # ── apps ──────────────────────────────────────────────────────────────────

    async def list_apps(self) -> Any:
        token = self.token()
        if not token:
            raise PermissionError("Not logged in")
        resp = await self._http.get(
            f"{BOLTZHUB_API}/v1/creator/apps",
            headers=_bz_auth(token),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"BoltzHub {resp.status_code}: {resp.text}")
        return resp.json()

    # ── versions ──────────────────────────────────────────────────────────────

    async def list_versions(self, app_id: str) -> dict[str, Any]:
        token = self.token()
        if not token:
            raise PermissionError("Not logged in")
        resp = await self._http.get(
            f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/versions",
            headers=_bz_auth(token),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"BoltzHub {resp.status_code}: {resp.text}")
        data = resp.json()
        items: list[dict[str, Any]] = data if isinstance(data, list) else data.get("items", [])
        items.sort(key=lambda v: v.get("createdAt", ""), reverse=True)
        latest = items[0]["versionNumber"] if items else "0.0.0"
        parts = latest.split(".")
        try:
            suggested = f"{parts[0]}.{parts[1]}.{int(parts[2]) + 1}"
        except Exception:
            suggested = "1.0.0"
        return {"versions": items, "suggestedNext": suggested}

    # ── token-usage ───────────────────────────────────────────────────────────

    async def token_usage(self, period: str = "30d") -> Any:
        token = self.token()
        if not token:
            raise PermissionError("Not logged in")
        resp = await self._http.get(
            f"{BOLTZHUB_API}/v1/creator/tokens/usage/history?period={period}&limit=100",
            headers=_bz_auth(token),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"BoltzHub {resp.status_code}: {resp.text}")
        return resp.json()

    # ── publish ───────────────────────────────────────────────────────────────

    async def publish(self, app_id: str) -> Any:
        token = self.token()
        if not token:
            raise PermissionError("Not logged in")
        resp = await self._http.put(
            f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/publish",
            headers=_bz_headers(token),
        )
        result = (
            resp.json() if "application/json" in resp.headers.get("content-type", "") else {"status": resp.status_code}
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(str(result))
        return result

    # ── create-version ────────────────────────────────────────────────────────

    async def create_version(self, app_id: str, release_notes: str | None, version_number: str | None) -> Any:
        token = self.token()
        if not token:
            raise PermissionError("Not logged in")
        resp = await self._http.post(
            f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/versions",
            json={"releaseNotes": release_notes, "versionNumber": version_number},
            headers=_bz_headers(token),
        )
        result = (
            resp.json() if "application/json" in resp.headers.get("content-type", "") else {"status": resp.status_code}
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(str(result))
        return result

    # ── push (SSE) ────────────────────────────────────────────────────────────

    async def push_stream(
        self,
        cwd: str,
        default_cwd: str,
        release_notes: str | None,
        version_number: str | None,
    ):  # type: ignore[return]
        """Yield SSE frames: build → archive → upload → deploy → publish → done/error."""
        cwd = cwd or default_cwd
        token = self.token()

        try:
            if not token:
                yield _emit("error", "Not logged in to BoltzHub")
                return
            cfg = await asyncio.to_thread(_read_app_config, cwd)
            if not cfg:
                yield _emit("error", "No .bzhub/app_config.json found")
                return
            app_id = cfg["id"]
            await asyncio.to_thread(_sync_env_oauth_client_id, cwd, app_id)
            build_cmd = cfg.get("buildCommand") or "pnpm build"
            yield _emit("build", f"Running: {build_cmd}")
            # Cap toolchain resource use on small hosts (1 vCPU / 2 GB): bound Node's
            # heap and stop Rust-based build tools (rayon) from spawning a worker thread
            # per core — thread creation fails with EAGAIN under memory pressure, which
            # surfaces as a ThreadPoolBuildError panic. Only set when unset.
            build_env = os.environ.copy()
            build_env.setdefault("NODE_OPTIONS", "--max-old-space-size=512")
            build_env.setdefault("RAYON_NUM_THREADS", "2")
            build_env.setdefault("UV_THREADPOOL_SIZE", "2")
            proc = await asyncio.create_subprocess_shell(
                build_cmd,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=build_env,
            )
            _, stderr = await proc.communicate()
            if proc.returncode != 0:
                yield _emit("error", f"Build failed: {stderr.decode()[:300]}")
                return

            yield _emit("archive", "Archiving project…")
            bzhub_dir = Path(cwd) / ".bzhub"
            bzhub_dir.mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
            zip_path = bzhub_dir / "project.zip"
            if zip_path.exists():  # noqa: ASYNC240
                zip_path.unlink()  # noqa: ASYNC240
            zip_cmd = f'cd "{cwd}" && zip -r "{zip_path}" . -x "node_modules/*" ".bzhub/*" ".git/*"'
            proc2 = await asyncio.create_subprocess_shell(
                zip_cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            _, zip_err = await proc2.communicate()
            if proc2.returncode not in (0, 12):
                yield _emit("error", f"Archive failed: {zip_err.decode()[:300]}")
                return
            zip_bytes = await asyncio.to_thread(zip_path.read_bytes)

            yield _emit("upload", f"Uploading {len(zip_bytes) // 1024} KB…")
            import httpx as _httpx

            auth_headers = _bz_auth(token)
            async with _httpx.AsyncClient(verify=False) as client:
                # Old code uses aiohttp FormData with field "archiveFile" — replicate
                # with httpx multipart (do NOT set Content-Type manually; httpx sets
                # the multipart boundary automatically when `files=` is used).
                upload_resp = await client.post(
                    f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/code",
                    files={"archiveFile": ("project.zip", zip_bytes, "application/zip")},
                    headers=auth_headers,
                    timeout=120,
                )
                if upload_resp.status_code not in (200, 201):
                    yield _emit("error", f"Upload failed ({upload_resp.status_code}): {upload_resp.text}")
                    return

                yield _emit("deploy", "Deploying…")
                deploy_resp = await client.put(
                    f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/deploy",
                    headers=auth_headers,
                )
                if deploy_resp.status_code not in (200, 201):
                    yield _emit("error", f"Deploy trigger failed: {deploy_resp.text}")
                    return

                service_url = None
                for attempt in range(60):
                    if attempt:
                        await asyncio.sleep(5)
                    st_resp = await client.get(
                        f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/status",
                        headers=auth_headers,
                    )
                    if st_resp.status_code != 200:
                        continue
                    st = st_resp.json()
                    service_url = st.get("serviceUrl")
                    dep_status = st.get("status")
                    yield _emit("deploy", st.get("stepMessage", f"Deploying… ({attempt * 5}s)"))
                    if dep_status == "deployed":
                        break
                    if dep_status == "failed":
                        yield _emit("error", "Deployment failed")
                        return

                yield _emit("publish", "Publishing version…")
                if release_notes:
                    await client.post(
                        f"{BOLTZHUB_API}/v1/creator/apps/{app_id}/versions",
                        json={"releaseNotes": release_notes, "versionNumber": version_number},
                        headers=_bz_headers(token),
                    )

            yield _emit("done", "Deployed!", serviceUrl=service_url or "", appId=app_id)
        except Exception as exc:
            yield _emit("error", str(exc))

    # ── sync (SSE) ────────────────────────────────────────────────────────────

    async def sync_stream(self, cwd: str, default_cwd: str, app_id: str | None):  # type: ignore[return]
        """Yield SSE frames: download → extract → install → done/error."""
        cwd = cwd or default_cwd
        token = self.token()

        try:
            if not token:
                yield _emit("error", "Not logged in to BoltzHub")
                return
            _app_id = app_id
            if not _app_id:
                cfg = await asyncio.to_thread(_read_app_config, cwd)
                if not cfg:
                    yield _emit("error", "No .bzhub/app_config.json found")
                    return
                _app_id = cfg["id"]

            import httpx as _httpx

            async with _httpx.AsyncClient(verify=False) as client:
                yield _emit("download", "Downloading project…")
                dl_resp = await client.get(
                    f"{BOLTZHUB_API}/v1/creator/apps/{_app_id}/code",
                    headers=_bz_auth(token),
                    timeout=120,
                )
                if dl_resp.status_code != 200:
                    yield _emit("error", f"Download failed ({dl_resp.status_code})")
                    return
                zip_bytes = dl_resp.content

            yield _emit("extract", "Extracting files…")
            buf = io.BytesIO(zip_bytes)
            with zipfile.ZipFile(buf) as z:
                await asyncio.to_thread(z.extractall, cwd)

            yield _emit("install", "Installing dependencies…")
            if (Path(cwd) / "package.json").exists():  # noqa: ASYNC240
                lock_pnpm = (Path(cwd) / "pnpm-lock.yaml").exists()  # noqa: ASYNC240
                install_cmd = "pnpm install" if lock_pnpm else "npm install"
                proc = await asyncio.create_subprocess_shell(
                    install_cmd,
                    cwd=cwd,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await proc.wait()

            yield _emit("done", "Project synced successfully!")
        except Exception as exc:
            yield _emit("error", str(exc))
