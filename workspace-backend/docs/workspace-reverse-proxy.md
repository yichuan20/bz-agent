# Workspace Reverse Proxy

How the subdomain-based reverse proxy routes traffic from the browser to workspace containers.

## Architecture

```
Browser
  │
  │  https://ws_abc123.workspaces.boltzhub.com/some/path
  │
  ▼
┌──────────────────────────────────────────────────┐
│  Ingress / Load Balancer                         │
│  Routes *.workspaces.boltzhub.com → port 8081    │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│  FlowInfra Proxy Server (Echo, port 8081)        │
│                                                  │
│  1. AuthMiddleware    — validate JWT, set cookie │
│  2. HandleSubdomainProxy                         │
│     a. Parse subdomain → workspace ID + port     │
│     b. Look up workspace → get host IP + port    │
│     c. Proxy HTTP or WebSocket to container      │
└──────────────────────┬───────────────────────────┘
                       │
                       │  http://{host_external_ip}:{host_port}/some/path
                       │  + X-Target-Port header (if port in subdomain)
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│  GCE VM Host                                     │
│  Incus proxy device:                             │
│    host:{host_port} → container:18789            │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│  LXC Container                                   │
│  workspace-backend on port 18789                 │
│                                                  │
│  X-Target-Port present?                          │
│  ├─ YES → reverse proxy to localhost:{port}      │
│  └─ NO  → route to API (terminal, files, etc.)   │
└──────────────────────────────────────────────────┘
```

## Components

### Proxy Server (port 8081)

FlowInfra runs a separate Echo server dedicated to workspace proxying. It is independent from the main API server on port 8080.

**Source:** `flowinfra/main.go:250-270`

```
Main API server (:8080)  — REST API for CRUD operations on workspaces
Proxy server    (:8081)  — reverse proxy for all workspace subdomain traffic
```

Both run in the same process. The proxy port is configurable via `WORKSPACE_PROXY_PORT` (default `8081`).

### Subdomain Parsing

Every request to the proxy server has its `Host` header parsed to extract the workspace ID and optional target port.

**Source:** `flowinfra/internal/workspace/proxy.go:290-320`

| Host                                | Workspace ID | Target Port |
|-------------------------------------|-------------|-------------|
| `ws_abc123.workspaces.boltzhub.com` | `ws_abc123` | 0 (default) |
| `ws_abc123-3000.workspaces.boltzhub.com` | `ws_abc123` | 3000 |
| `my-workspace.workspaces.boltzhub.com` | `my-workspace` | 0 |

Rules:
- The host must end with `.{WORKSPACE_SUBDOMAIN_SUFFIX}`
- Everything before the suffix is the label
- If the label ends with `-{number}` (1-65535), that number is the target port and the rest is the workspace ID
- A non-numeric trailing segment is treated as part of the workspace ID

### Authentication

**Source:** `flowinfra/internal/workspace/proxy.go:41-107`

The `AuthMiddleware` runs on every request before proxying. It extracts a JWT from one of three sources (in priority order):

1. `Authorization: Bearer <jwt>` header
2. `?token=<jwt>` query parameter
3. `ws_auth` cookie

After validation:
- A `ws_auth` cookie is set on `.{subdomain_suffix}` so it works across all workspace subdomains
- If the token came from the query parameter, the middleware responds with a **302 redirect** to the same URL without `?token=` — this strips the JWT from the browser's address bar
- The user ID and roles from the JWT claims are injected into the request context

### Request Routing

**Source:** `flowinfra/internal/workspace/proxy.go:109-156`

`HandleSubdomainProxy` is the catch-all handler (`proxyEcho.Any("/*", ...)`):

1. Parse subdomain → workspace ID + target port
2. Verify the authenticated user owns the workspace
3. Look up the workspace's host (GCE VM external IP + allocated host port)
4. Detect if the request is a WebSocket upgrade
5. Proxy to the workspace container

### HTTP Proxying

**Source:** `flowinfra/internal/workspace/proxy.go:158-183`

Uses Go's `httputil.ReverseProxy` with `Rewrite`:
- Rewrites the URL to `http://{host_ip}:{host_port}`
- Overwrites the `Host` header to the target address
- Sets `X-Target-Port: {port}` if a port was extracted from the subdomain

The workspace-backend inside the container uses `X-Target-Port` to decide whether to handle the request as an API call or reverse-proxy it to a user's dev server (e.g. `localhost:3000`).

#### Container-side proxy (implemented)

The container-side hop is a Starlette HTTP middleware, `preview_proxy_middleware`
(`src/workspace_backend/api/preview_proxy.py`), registered ahead of all routing in
`app.py`:

- When `X-Target-Port` is **absent**, it is a no-op pass-through — normal API/SPA routing
  (and local backend dev) is unaffected.
- When present, it reverse-proxies the request to `http://127.0.0.1:{port}`, rewriting the
  `Host` header to `localhost:{port}` so dev servers with host allow-listing (e.g. Vite's
  `allowedHosts`) accept it. The upstream status and body are relayed back.

**Scope: HTTP only.** WebSocket/HMR is intentionally not proxied — dev-server previews
rely on **manual refresh** (the frontend's `↺ Reload` button), so live hot-reload does not
propagate to the browser. Proxying the HMR WebSocket is a possible future enhancement.

**Preview URL is built by the frontend.** `POST /api/v1/dev-server/start` returns only the
`port`. The browser-facing preview URL (`https://{wsid}-{port}.{suffix}`) is constructed
client-side from `window.location` (`devServerPreviewUrl` in `frontend/src/lib/api.ts`),
because behind this proxy the backend never sees the public hostname — flowinfra rewrites
the `Host` header to the internal target address before the request arrives. This also makes
HTTPS automatic (the protocol comes from `window.location`).

### WebSocket Proxying

**Source:** `flowinfra/internal/workspace/proxy.go:185-265`

WebSocket connections (detected via `Connection: Upgrade` + `Upgrade: websocket` headers) are handled separately:

1. Dial the backend WebSocket at `ws://{host_ip}:{host_port}{original_path}`
2. Forward `Authorization`, `Cookie`, and `Sec-WebSocket-Protocol` headers
3. Set `X-Target-Port` if applicable
4. Upgrade the client connection
5. Bidirectionally relay messages between client and backend until either side disconnects

This is used for terminal sessions (xterm.js) and dev server hot reload (HMR/WebSocket).

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `WORKSPACE_SUBDOMAIN_SUFFIX` | `workspaces.boltzhub.com` | Domain suffix for workspace subdomains |
| `WORKSPACE_PROXY_PORT` | `8081` | Port the proxy server listens on |

## Request Flow Examples

### Opening a workspace (first visit)

```
1. Frontend constructs: https://ws_abc123.workspaces.boltzhub.com/?token=<jwt>
2. Ingress routes *.workspaces.boltzhub.com → FlowInfra :8081
3. AuthMiddleware:
   - No Authorization header
   - Finds ?token=<jwt> → validates JWT
   - Sets ws_auth cookie on .workspaces.boltzhub.com
   - 302 redirect to https://ws_abc123.workspaces.boltzhub.com/ (token stripped)
4. Browser follows redirect, sends ws_auth cookie
5. AuthMiddleware validates cookie
6. HandleSubdomainProxy:
   - Parses "ws_abc123" from host, no target port
   - Looks up workspace → host IP 10.0.0.5, host port 32100
   - httputil.ReverseProxy → http://10.0.0.5:32100/ (no X-Target-Port)
7. Incus proxy device on VM: :32100 → container:18789
8. workspace-backend: no X-Target-Port → serves API/frontend
```

### Previewing a dev server on port 3000

```
1. Browser opens: https://ws_abc123-3000.workspaces.boltzhub.com/
   (ws_auth cookie sent automatically — same parent domain)
2. AuthMiddleware validates cookie
3. HandleSubdomainProxy:
   - Parses "ws_abc123" + port 3000
   - httputil.ReverseProxy → http://10.0.0.5:32100/
   - Sets header: X-Target-Port: 3000
4. Incus proxy device: :32100 → container:18789
5. workspace-backend reads X-Target-Port: 3000
   → reverse-proxies to localhost:3000 inside container
6. User's React/Vite app responds
```

### Terminal WebSocket

```
1. Browser opens: wss://ws_abc123.workspaces.boltzhub.com/ws?cwd=/home/user
2. AuthMiddleware validates cookie
3. HandleSubdomainProxy detects WebSocket upgrade
4. proxyWebSocket:
   - Dials ws://10.0.0.5:32100/ws?cwd=/home/user
   - Upgrades client connection
   - Relays frames bidirectionally
5. workspace-backend spawns PTY, bridges to WebSocket
```

## Infrastructure Requirements

For the proxy to work, these must be in place:

- **DNS**: Wildcard `*.{subdomain_suffix}` → ingress IP
- **TLS**: Wildcard certificate for `*.{subdomain_suffix}`
- **Ingress**: Route `*.{subdomain_suffix}` to FlowInfra port 8081 (not 8080)
- **Ingress WebSocket**: Ensure the ingress supports WebSocket upgrades (timeouts, connection upgrade headers)
- **GCE firewall**: Allow FlowInfra to reach VM host ports (the allocated `host_port` range)
