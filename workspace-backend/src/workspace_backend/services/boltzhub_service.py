"""BoltzHub service — creator platform integration.

Proxies calls to ``https://boltzhub.com/bz-appstore-api``, authenticated via the
stored BZ_API_KEY.  Local app config lives in ``<cwd>/.bzhub/app_config.json``.

The two SSE pipeline methods (push, sync) yield ``{step, message, …}`` dicts as an
async generator; routes consume them with a ``StreamingResponse``.
"""

from __future__ import annotations

import asyncio
import io
import json
import zipfile
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

import httpx

_API = "https://boltzhub.com/bz-appstore-api"
_TIMEOUT = 30.0

# Files excluded when zipping a project for push
_ZIP_EXCLUDE = {".git", "node_modules", ".bzhub", ".venv", "__pycache__", "dist"}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _read_app_config(cwd: str) -> dict[str, Any] | None:
    cfg = Path(cwd) / ".bzhub" / "app_config.json"
    if not cfg.exists():
        return None
    try:
        return json.loads(cfg.read_text(encoding="utf-8"))
    except OSError, json.JSONDecodeError:
        return None


def _write_app_config(cwd: str, data: dict[str, Any]) -> None:
    cfg_dir = Path(cwd) / ".bzhub"
    cfg_dir.mkdir(parents=True, exist_ok=True)
    (cfg_dir / "app_config.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _headers(token: str) -> dict[str, str]:
    return {"X-API-Key": token, "Content-Type": "application/json"}


def _zip_project(cwd: str) -> bytes:
    buf = io.BytesIO()
    root = Path(cwd)
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in root.rglob("*"):
            if any(part in _ZIP_EXCLUDE for part in p.parts):
                continue
            if p.is_file():
                zf.write(p, p.relative_to(root))
    return buf.getvalue()


def _suggest_next_version(versions: list[dict[str, Any]]) -> str:
    if not versions:
        return "1.0.0"
    latest = versions[0].get("versionNumber", "0.0.0")
    parts = str(latest).split(".")
    try:
        parts[-1] = str(int(parts[-1]) + 1)
    except ValueError, IndexError:
        parts = ["1", "0", "0"]
    return ".".join(parts)


def _sse_event(step: str, message: str, **extra: Any) -> str:
    payload = {"step": step, "message": message, **extra}
    return f"data: {json.dumps(payload)}\n\n"


# ── Service ───────────────────────────────────────────────────────────────────


class BoltzHubService:
    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    # ── Local config ──────────────────────────────────────────────────────────

    def check(self, cwd: str, token: str | None) -> dict[str, Any]:
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

    # ── Read-only API calls ───────────────────────────────────────────────────

    async def list_apps(self, token: str) -> Any:
        resp = await self._http.get(f"{_API}/v1/creator/apps", headers=_headers(token), timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    async def list_versions(self, token: str, app_id: str) -> dict[str, Any]:
        resp = await self._http.get(
            f"{_API}/v1/creator/apps/{app_id}/versions",
            headers=_headers(token),
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        versions = sorted(resp.json(), key=lambda v: v.get("createdAt", ""), reverse=True)
        return {"versions": versions, "suggestedNext": _suggest_next_version(versions)}

    async def token_usage(self, token: str, period: str = "30d") -> Any:
        resp = await self._http.get(
            f"{_API}/v1/creator/tokens/usage/history",
            params={"period": period, "limit": "100"},
            headers=_headers(token),
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()

    # ── Write API calls ───────────────────────────────────────────────────────

    async def create_app(
        self,
        token: str,
        cwd: str,
        name: str,
        description: str | None = None,
        visibility: str = "private",
        build_command: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"name": name, "visibility": visibility}
        if description:
            body["description"] = description
        resp = await self._http.post(f"{_API}/v1/creator/apps", json=body, headers=_headers(token), timeout=_TIMEOUT)
        resp.raise_for_status()
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

    async def publish(self, token: str, app_id: str) -> Any:
        resp = await self._http.put(
            f"{_API}/v1/creator/apps/{app_id}/publish",
            headers=_headers(token),
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()

    # ── SSE pipelines ─────────────────────────────────────────────────────────

    async def push(
        self,
        token: str,
        cwd: str,
        release_notes: str | None = None,
        version_number: str | None = None,
    ) -> AsyncGenerator[str]:
        """Build → zip → upload → deploy → (publish). Yields SSE frames."""
        cfg = await asyncio.to_thread(_read_app_config, cwd)
        if not cfg or not cfg.get("id"):
            yield _sse_event("error", "No app config found. Run create-app first.")
            return
        app_id = cfg["id"]
        build_cmd = cfg.get("buildCommand") or "pnpm build"

        # 1. Build
        yield _sse_event("build", f"Running {build_cmd}…")
        try:
            proc = await asyncio.create_subprocess_shell(
                build_cmd,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=300.0)
            if proc.returncode != 0:
                yield _sse_event("error", f"Build failed:\n{stdout.decode(errors='replace')[-2000:]}")
                return
        except TimeoutError:
            yield _sse_event("error", "Build timed out after 5 minutes.")
            return

        # 2. Archive
        yield _sse_event("archive", "Creating project archive…")
        try:
            zip_bytes = await asyncio.to_thread(_zip_project, cwd)
        except Exception as exc:
            yield _sse_event("error", f"Archive failed: {exc}")
            return

        # 3. Upload code
        yield _sse_event("upload", "Uploading to BoltzHub…")
        try:
            resp = await self._http.post(
                f"{_API}/v1/creator/apps/{app_id}/code",
                content=zip_bytes,
                headers={**_headers(token), "Content-Type": "application/zip"},
                timeout=120.0,
            )
            resp.raise_for_status()
        except Exception as exc:
            yield _sse_event("error", f"Upload failed: {exc}")
            return

        # 4. Deploy
        yield _sse_event("deploy", "Deploying…")
        try:
            resp = await self._http.put(
                f"{_API}/v1/creator/apps/{app_id}/deploy",
                headers=_headers(token),
                timeout=30.0,
            )
            resp.raise_for_status()
        except Exception as exc:
            yield _sse_event("error", f"Deploy failed: {exc}")
            return

        # 5. Poll until deployed (up to 5 min)
        for _ in range(60):
            await asyncio.sleep(5)
            try:
                st = await self._http.get(
                    f"{_API}/v1/creator/apps/{app_id}/status", headers=_headers(token), timeout=10.0
                )
                if st.json().get("status") == "deployed":
                    break
            except Exception:
                pass

        # 6. Publish version
        if release_notes or version_number:
            yield _sse_event("publish", "Publishing version…")
            try:
                pub_body: dict[str, Any] = {}
                if release_notes:
                    pub_body["releaseNotes"] = release_notes
                if version_number:
                    pub_body["versionNumber"] = version_number
                await self._http.post(
                    f"{_API}/v1/creator/apps/{app_id}/versions",
                    json=pub_body,
                    headers=_headers(token),
                    timeout=30.0,
                )
            except Exception:
                pass

        yield _sse_event("done", "Deploy complete.")

    async def sync(self, token: str, cwd: str, app_id: str | None = None) -> AsyncGenerator[str]:
        """Download → extract → install. Yields SSE frames."""
        if not app_id:
            cfg = await asyncio.to_thread(_read_app_config, cwd)
            app_id = cfg.get("id") if cfg else None
        if not app_id:
            yield _sse_event("error", "No app_id and no local app config found.")
            return

        # 1. Download zip
        yield _sse_event("download", "Downloading app from BoltzHub…")
        try:
            resp = await self._http.get(
                f"{_API}/v1/creator/apps/{app_id}/code",
                headers=_headers(token),
                timeout=120.0,
            )
            resp.raise_for_status()
            zip_bytes = resp.content
        except Exception as exc:
            yield _sse_event("error", f"Download failed: {exc}")
            return

        # 2. Extract
        yield _sse_event("extract", "Extracting…")
        try:
            cwd_path = Path(cwd)

            def _extract() -> None:
                cwd_path.mkdir(parents=True, exist_ok=True)
                with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                    zf.extractall(str(cwd_path))

            await asyncio.to_thread(_extract)
        except Exception as exc:
            yield _sse_event("error", f"Extract failed: {exc}")
            return

        # 3. Install deps
        if (Path(cwd) / "package.json").exists():  # noqa: ASYNC240
            yield _sse_event("install", "Installing dependencies…")
            from .dev_server_service import _detect_pkg_manager  # local import avoids circular

            pkg = _detect_pkg_manager(Path(cwd))
            try:
                proc = await asyncio.create_subprocess_shell(
                    f"{pkg} install",
                    cwd=cwd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                )
                await asyncio.wait_for(proc.communicate(), timeout=180.0)
            except Exception as exc:
                yield _sse_event("error", f"Install failed: {exc}")
                return

        yield _sse_event("done", "Sync complete.")
