# BoltzAgent Server — API Reference for Mobile / Third-Party Clients

A mobile app (or any HTTP/WebSocket client) can connect directly to the same server that the web app uses. No separate endpoint set is required.

---

## Overview

| Transport | Base URL |
|-----------|----------|
| HTTP      | `http://<host>:18789` (local) |
| HTTP      | `https://<workspace_id>.workspaces.boltzhub.com` (remote) |
| WebSocket | `ws://<host>:18789/ws` (local) |
| WebSocket | `wss://<workspace_id>.workspaces.boltzhub.com/ws` (remote) |

All endpoints return `Access-Control-Allow-Origin: *`. There is no per-request token validation on the bz-agent server itself — but when reaching it through the BoltzHub workspace gateway, the gateway enforces its own JWT check before proxying the request through.

---

## Two-Layer Authentication

There are **two separate auth concerns** that are easy to confuse:

| Layer | What it is | Where it runs | How to satisfy it |
|-------|------------|---------------|-------------------|
| **Gateway auth** | Proves you are allowed to access this workspace | BoltzHub workspace gateway (before your request reaches the server) | `Authorization: Bearer <jwt>` header on every request |
| **Agent auth** | Gives the bzcode agent an Anthropic / BoltzHub token to call AI APIs | bz-agent server, stored on disk | `POST /auth` body — call once at login |

### Gateway auth (remote URL only)

When using the workspace URL (`https://<workspace_id>.workspaces.boltzhub.com`), every request — including `POST /auth` — must carry the user's BoltzHub JWT in the `Authorization` header. The gateway validates this before forwarding anything to the server. If the workspace is not running or the ID is wrong, the gateway returns **404**; if the JWT is missing or expired, it returns **401**.

```http
POST https://ws_<id>.workspaces.boltzhub.com/auth
Authorization: Bearer <boltzhub_jwt>
Content-Type: application/json
```

> **Troubleshooting gateway 404:** `rpc error: code = NotFound desc = not found` means the gateway could not locate the workspace container. Check that the workspace is started and the workspace ID matches exactly.

When using the local URL (`http://localhost:18789`) the gateway layer does not exist — no `Authorization` header is needed on any request.

---

## Recommended Client Workflow

```
# Remote (workspace URL)
1. Obtain BoltzHub JWT (user login via BoltzHub OAuth)
2. POST /auth  + Authorization header  — push token to the agent server
3. GET  /sessions  + Authorization header  — list sessions
4. WS   /ws?cwd=&mode=  + Authorization header  — open/resume session
5. Send/receive JSON over the WebSocket

# Local (localhost:18789)
1. POST /auth  (no Authorization header needed)
2. GET  /sessions
3. WS   /ws?cwd=&mode=
```

---

## Agent Auth — Push credentials to the server

The underlying `bzcode` process needs a valid BoltzHub JWT to call Anthropic APIs. Push it once after the user logs in. This is separate from the gateway `Authorization` header.

### Push credentials

```http
POST /auth
Authorization: Bearer <boltzhub_jwt>   ← always include; gateway requires it on remote URL
Content-Type: application/json
```

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accessToken` | string | Yes | BoltzHub JWT access token |
| `refreshToken` | string | No | Refresh token (if available) |
| `expiresAt` | number | No | Token expiry as Unix timestamp (seconds) |
| `authUrl` | string | No | Auth origin. Defaults to `https://boltzhub.com` |

**Example**
```json
{
  "accessToken":  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9…",
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9…",
  "expiresAt":    1734567890,
  "authUrl":      "https://boltzhub.com"
}
```

**Response `200 OK`**
```json
{ "ok": true }
```

### Clear credentials

```http
POST /auth/logout
Content-Type: application/json

{ "authUrl": "https://boltzhub.com" }
```

> **Note — remote URL:** Every HTTP request and WebSocket connection to `https://<workspace_id>.workspaces.boltzhub.com` must include `Authorization: Bearer <jwt>`. The examples below omit it for brevity; add it to all requests when using the remote URL.

---

## Sessions

### List sessions

```http
GET /sessions
GET /sessions?cwd=/home/user/projects/myapp   (filter to one working directory)
```

**Response**
```json
{
  "sessions": [
    {
      "sessionId":    "bz-a1b2c3d4e5f6",
      "workingDir":   "/home/user/projects/trading-app",
      "dirName":      "trading-app",
      "mode":         "general",
      "title":        "Trading Portfolio Dashboard",
      "messageCount": 23,
      "lastMessage":  "Add a Sharpe ratio card…",
      "lastModified": 1734500000,
      "created":      1734400000,
      "isActive":     true,
      "isRunning":    false,
      "isDefault":    false
    }
  ]
}
```

### Update session title

```http
POST /sessions/{sessionId}/title
Content-Type: application/json

{ "title": "My new title" }
```

**Response** `{ "ok": true }`

### Delete session

```http
DELETE /sessions/{sessionId}
```

**Response** `{ "ok": true }`

### Get available agent modes

```http
GET /agent-modes
```

Returns the list of modes and their metadata (label, description, color, identity prompt, etc.). Use this to populate a mode picker in the mobile UI.

---

## WebSocket — Agent Chat

**Endpoint:** `GET /ws` (WebSocket upgrade)

### Query parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `cwd` | Yes (new session) | Absolute path to the working directory on the server |
| `sessionId` | No | Resume an existing session by its ID. If the session file does not exist the server creates a new session with this ID. If omitted, a new ID `bz-<12-hex>` is generated automatically |
| `mode` | No | Agent mode: `general` (default), `widget`, `worker`, `coder` |

**Examples**
```
ws://localhost:18789/ws?cwd=/home/user/projects/myapp&mode=general
wss://ws_abc123.workspaces.boltzhub.com/ws?cwd=/home/user/myapp&sessionId=bz-a1b2c3d4e5f6
```

---

### Messages you send → server

All frames are **text frames** containing a single JSON object. A trailing `\n` is appended by the server automatically if missing.

#### Plain text message

```json
{ "type": "user", "content": "Analyse the Q3 sales data and write a report" }
```

#### Message with an image attachment

Images are sent **inline as base64** in a `content` array. Read the file on the client, base64-encode it, and include it alongside the text block.

```json
{
  "type": "user",
  "content": [
    {
      "type": "text",
      "text": "What does this chart show?"
    },
    {
      "type": "image",
      "source": {
        "type":      "base64",
        "mediaType": "image/jpeg",
        "data":      "/9j/4AAQSkZJRgABAQAAAQABAAD…"
      }
    }
  ]
}
```

Supported `mediaType` values: `image/jpeg`, `image/png`, `image/gif`, `image/webp`.

Multiple images can be included by appending more `image` blocks to the `content` array.

#### Message with a document attachment (PDF / DOCX / XLSX / PPTX)

Documents are **not** sent over the WebSocket. Instead:

1. **Parse the document** via `POST /api/doc/parse` (see [Document Parsing](#document-parsing)) to get its extracted text content.
2. **Append the content as plain text** in the user message. The convention used by the web client:

```json
{
  "type": "user",
  "content": [
    {
      "type": "text",
      "text": "Summarise this report.\n\n---\n📄 **Q3_Report.pdf** (PDF, 12 pages, 4,320 words)\n\n<extracted text content here>"
    }
  ]
}
```

#### Set permission mode

Controls whether the agent asks for approval before running tools.

```json
{ "type": "setMode", "mode": "yolo" }
```

| Mode | Behaviour |
|------|-----------|
| `"default"` | Agent asks permission before each tool call |
| `"plan"` | Agent produces a plan and waits for approval before executing |
| `"yolo"` | Agent auto-approves all tool calls without asking |

---

### Messages server sends → you

The server relays every stdout line from the `bzcode` process as a JSON text frame.

#### Agent text / thinking

```json
{
  "type": "assistant",
  "content": [
    { "type": "text", "text": "I'll analyse the data now…" }
  ]
}
```

The `content` array may contain multiple blocks:

| Block type | Description |
|------------|-------------|
| `text` | Plain text or markdown from the model |
| `thinking` | Extended thinking (visible reasoning before the answer) |
| `tool_use` | The agent is about to call a tool |

#### Tool call

```json
{
  "type": "assistant",
  "content": [
    {
      "type":  "tool_use",
      "id":    "toolu_01XYZabc",
      "name":  "Bash",
      "input": { "command": "python3 analyse.py" }
    }
  ]
}
```

#### Tool result

```json
{
  "type":        "tool_result",
  "tool_use_id": "toolu_01XYZabc",
  "content":     "Revenue: $2.4M\nOrders: 1,508\n"
}
```

#### Status — agent idle (ready for next message)

```json
{ "type": "status", "status": "idle" }
```

Wait for this before sending the next user message.

#### Session result — agent finished

```json
{ "type": "result", "status": "success" }
```

Or on error:

```json
{ "type": "result", "status": "error", "error": "bzcode exited unexpectedly" }
```

#### Token usage (emitted periodically)

```json
{
  "type":         "token-usage",
  "inputTokens":  12400,
  "outputTokens": 3800,
  "bzTokens":     0
}
```

#### Auth error — token expired mid-session

```json
{
  "type":    "system",
  "event":   "auth-error",
  "message": "token is expired"
}
```

Re-run `POST /auth` with a fresh token and reconnect.

---

## File System

### List directory

```http
GET /files?path=/home/user/projects
```

**Response**
```json
{
  "path": "/home/user/projects",
  "entries": [
    { "name": "trading-app", "path": "/home/user/projects/trading-app", "isDir": true,  "size": 0,    "modified": 1734500000 },
    { "name": "README.md",   "path": "/home/user/projects/README.md",   "isDir": false, "size": 1240, "modified": 1734490000 }
  ]
}
```

### Read a text file

```http
GET /api/file?path=/home/user/projects/README.md
```

**Response**
```json
{ "path": "/home/user/projects/README.md", "content": "# My Project\n…" }
```

### Write a text file

```http
PUT /api/file
Content-Type: application/json

{ "path": "/home/user/projects/notes.md", "content": "# Notes\n…" }
```

**Response** `{ "ok": true, "path": "/home/user/projects/notes.md" }`

### Download a binary file

```http
GET /api/file/download?path=/home/user/projects/report.pdf
```

Returns the raw file bytes with `Content-Disposition: attachment; filename="report.pdf"`.

### Rename a file or directory

```http
POST /api/file/rename
Content-Type: application/json

{ "path": "/home/user/projects/old-name.md", "newName": "new-name.md" }
```

**Response** `{ "ok": true, "path": "/home/user/projects/new-name.md" }`

### Duplicate a file

```http
POST /api/file/duplicate
Content-Type: application/json

{ "path": "/home/user/projects/report.md" }
```

**Response** `{ "ok": true, "path": "/home/user/projects/report (copy).md" }`

### Create a directory

```http
POST /files/mkdir
Content-Type: application/json

{ "parent": "/home/user/projects", "name": "new-folder" }
```

**Response** `{ "path": "/home/user/projects/new-folder" }`

---

## Document Parsing

Parse a document file to extract its text content. Call this before attaching a document to a WebSocket message.

```http
POST /api/doc/parse
Content-Type: multipart/form-data

file=<binary file data>
```

Or, to parse a file already on the server:

```http
POST /api/doc/parse
Content-Type: application/json

{ "path": "/home/user/documents/Q3_Report.pdf" }
```

**Supported file types:** PDF, DOCX, XLSX, PPTX

**Response**
```json
{
  "filename":  "Q3_Report.pdf",
  "type":      "pdf",
  "pages":     12,
  "wordCount": 4320,
  "truncated": false,
  "content":   "Executive Summary\n\nQ3 revenue reached $2.4M…"
}
```

| Field | Description |
|-------|-------------|
| `type` | `pdf`, `docx`, `xlsx`, or `pptx` |
| `pages` | Page / sheet count |
| `wordCount` | Approximate word count of extracted text |
| `truncated` | `true` if the document was too large and content was cut |
| `content` | Extracted plain text, ready to embed in a WebSocket message |

---

## Canvas & Widgets

### Get canvas layout for a session

```http
GET /canvas?sessionId=bz-a1b2c3d4e5f6&cwd=/home/user/projects/myapp
```

**Response**
```json
{
  "widgets": [
    {
      "canvasId": "cw-abc123def456",
      "widgetId": "cw-abc123def456",
      "kind":     "custom",
      "title":    "Portfolio Allocation",
      "x": 24, "y": 24, "w": 380, "h": 280
    }
  ]
}
```

### Get widget JavaScript code

```http
GET /custom-widgets/{canvasId}?sessionId=bz-a1b2c3d4e5f6
```

**Response**
```json
{ "canvasId": "cw-abc123def456", "code": "// widget JS…" }
```

### Widget data rows

```http
GET /db/widget/{canvasId}/rows?sessionId=bz-a1b2c3d4e5f6&limit=100&offset=0
```

Query parameters: `limit`, `offset`, `order` (column name), `dir` (`asc`/`desc`), `filter` (JSON object of column→value pairs).

**Response**
```json
{
  "rows":   [{ "id": 1, "symbol": "AAPL", "price": 182.5 }],
  "total":  4,
  "limit":  100,
  "offset": 0
}
```

---

## Token Usage

```http
GET /token-stats
```

**Response**
```json
{ "input": 120400, "output": 38000, "total": 158400 }
```

---

## Error Responses

All endpoints return standard HTTP status codes. Error bodies follow this shape:

```json
{ "error": "human-readable description" }
```

| Code | Meaning |
|------|---------|
| 400  | Bad request — missing or invalid parameters |
| 404  | Resource not found |
| 500  | Internal server error |
| 502  | Bad gateway (X-Target-Port proxy path) |

---

## Troubleshooting — Gateway Errors

When using the remote workspace URL, errors may come from the BoltzHub gateway rather than the bz-agent server. Gateway errors have this distinctive shape:

```json
{ "error": "rpc error: code = NotFound desc = not found" }
```

This is a gRPC-style response from the Go gateway, **not** from the Python bz-agent server.

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `404` + `rpc error: code = NotFound` | Workspace container not running, or workspace ID wrong | Start the workspace from the BoltzHub dashboard; verify the workspace ID in the URL |
| `401` or `403` on any request | Missing or expired `Authorization` header | Re-obtain the BoltzHub JWT and include it as `Authorization: Bearer <jwt>` on every request |
| `404` on a valid endpoint (e.g. `/auth`) when using local URL | bz-agent server not running | Start the server: `uvicorn server:make_http_app --port 18789` |
| `502` from gateway | Container is running but bz-agent server inside it is not responding on port 18789 | SSH into the container and restart the server |

### Distinguishing gateway vs server errors

| Source | Typical error body | `content-type` |
|--------|-------------------|----------------|
| BoltzHub gateway | `{"error": "rpc error: code = ... desc = ..."}` | `application/json; charset=utf-8` |
| bz-agent server | `{"error": "plain description"}` | `application/json` |
| Cloudflare | HTML page or `{"error": "1010"}` | `text/html` |

### Using localhost for development

To avoid gateway issues during development, point your mobile app at the local server directly:

```
http://localhost:18789        (if on the same machine)
http://<local-network-ip>:18789   (if on the same WiFi, with firewall open)
```

No `Authorization` header is required on any endpoint in this mode.

---

## Security Note

The bz-agent server performs no per-request authentication checks. For any deployment where the server is reachable from outside a trusted network, restrict access at the network layer (VPN, firewall, the BoltzHub workspace gateway) or add an API key middleware to `server.py`.
