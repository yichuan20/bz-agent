# Changelog

All notable changes to the bz-agent server are documented here.

---

## [0.0.3] - 2026-06-26

### Fixed
- `POST /auth` now preserves an existing `refreshToken` in `credentials.json` when the caller does not supply one, preventing mobile short-lived tokens from evicting a valid refresh token written by a prior login.
- `POST /auth` automatically parses `expiresAt` from the JWT `exp` claim and stores it in milliseconds (as bzcode requires), even when the caller omits the field.
- Removed credential write from the WebSocket `?token=` query parameter. `POST /auth` is now the sole writer of `~/.boltzbit/credentials.json`, ensuring both `accessToken` and `refreshToken` are always present when bzcode spawns.

---

## [0.0.2] - 2026-06-26

### Added
- `_write_bzcode_credentials()` helper extracts credential-writing logic into a single reusable function called by both `POST /auth` and (formerly) the WebSocket handler.
- WebSocket handler reads `?token=` from the upgrade URL and writes bzcode credentials synchronously before spawning the bzcode process, eliminating a race condition where bzcode started before credentials were on disk.
- `POST /auth` and `POST /auth/logout` endpoints for mobile and frontend clients to push / clear BoltzHub credentials.
- `GET /api/version` endpoint returns `{"backend": "<version>"}` for version display in the frontend sidebar.

### Changed
- `BACKEND_VERSION` introduced as a single source of truth for the server version string.

---

## [0.0.1] - 2026-06-24

### Added
- Initial production Python server (`server.py`) with aiohttp WebSocket bridge to bzcode.
- Session management: `GET /sessions`, session config directory written before bzcode spawn.
- File API: `GET /files`, `GET /api/file`, `PUT /api/file`, `POST /files/mkdir`.
- Document parsing: `POST /api/doc/parse` (PDF, DOCX, PPTX, XLSX).
- Widget system: `GET/POST /widgets`, canvas persistence.
- WhatsApp webhook integration.
- BoltzHub app creator endpoints (`/boltzhub/*`).
- Static frontend serving from `dist/`.
