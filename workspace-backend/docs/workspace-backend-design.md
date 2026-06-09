# Workspace Backend — Design

## 1. Background

The workspace implementation plan establishes the infrastructure layer: FlowInfra provisions GCE VMs running Incus, creates LXC containers per user, and proxies WebSocket connections so users can interact with a shell remotely.

As we designed the networking layer — specifically, how users preview web apps (React dev servers, APIs) running inside their workspace — two problems emerged:

1. **Port management complexity.** Without an in-container gateway, every port a developer uses (3000, 5000, 8080) requires FlowInfra to create an Incus proxy device, allocate a unique host port, and track it in the database. When a developer switches ports, FlowInfra must react with Incus API calls and DB updates. This creates an operational coupling between developer behavior and infrastructure state.

2. **Path-based proxying breaks web apps.** Routing via URL paths (`/proxy/3000/index.html`) breaks React apps because they emit absolute asset paths (`/static/js/main.js`) that don't include the prefix. Subdomain-based routing (`ws-abc-3000.workspaces.example.com`) solves this, but still needs something inside the container to receive requests and proxy them to the right local port.

The workspace backend solves both problems by shifting routing into the container. FlowInfra allocates exactly **one host port per workspace**. All traffic — agent chat sessions, management API, and user app previews — flows through a single in-container process that handles internal routing.

This also aligns with a broader goal: the workspace backend is the **agent host** for bzcode. Users don't get a raw shell — they interact with bzcode agents through a structured chat UI. The agents have full access to the container's filesystem and can run commands internally, but the user's interface is conversational, not a terminal emulator.

## 2. UX Flow

### 2.1 Creating a Workspace and Starting an Agent

```
1. User clicks "Create Workspace" in the platform UI
2. Platform calls FlowInfra: POST /v1/workspaces { name: "my-project" }
3. FlowInfra provisions an LXC container (auto-provisioning a VM host if needed)
4. Container boots with workspace backend pre-installed (baked into base image)
5. Workspace backend starts automatically via systemd, listens on port 18789
6. FlowInfra creates one Incus proxy device: host:{allocated_port} → container:18789
7. FlowInfra marks workspace as "ready"

8. User opens the workspace UI (served by workspace backend)
9. User starts a bzcode agent for a project: POST /api/agents { projectDir: "/home/user/my-app" }
10. Workspace backend spawns a bzcode process and establishes a bridge connection
11. User chats with the agent via WebSocket: wss://ws-abc.workspaces.example.com/api/agents/{id}/chat
12. Agent can read/write files, run commands inside the container, respond with structured messages
```

### 2.2 Previewing a Web App

```
1. User tells the agent: "start the React dev server"
2. Agent runs `npm start` internally → React dev server starts on port 3000
3. Workspace backend detects port 3000 via periodic ss polling
4. Workspace backend pushes event over the agent chat WebSocket:
   { "type": "port_opened", "port": 3000 }
5. UI shows a notification: "Port 3000 detected — Open in browser?"
6. User clicks → new browser tab opens: https://ws-abc-3000.workspaces.example.com

7. Browser sends request (session cookie attached automatically via .example.com domain)
8. FlowInfra authenticates, parses subdomain: workspace=ws-abc, port=3000
9. FlowInfra proxies to host:{allocated_port} with header: X-Target-Port: 3000
10. Workspace backend reads X-Target-Port, reverse-proxies to localhost:3000
11. React app renders — assets, HMR WebSocket, API proxy all work as if local
```

### 2.3 Managing Agent Sessions

```
1. User has multiple projects: /home/user/my-app, /home/user/my-api
2. UI calls: POST /api/agents { projectDir: "/home/user/my-app" }  → starts agent #1
3. UI calls: POST /api/agents { projectDir: "/home/user/my-api" }  → starts agent #2
4. User can switch between agents in the UI, each has its own chat history
5. UI shows running agents: GET /api/agents
6. User can stop an agent: DELETE /api/agents/{id}
```

### 2.4 Multi-Port / Full-Stack Development

```
User runs:
  - React frontend on port 3000
  - Express API on port 8080
  - PostgreSQL on port 5432

React's vite.config.js has:
  proxy: { "/api": "http://localhost:8080" }

When user previews at https://ws-abc-3000.workspaces.example.com:
  - Browser loads React app (proxied through workspace backend to localhost:3000)
  - React app calls fetch("/api/users") — relative path, same origin
  - Vite dev server proxies /api to localhost:8080 inside the container
  - No CORS issues, no multi-port exposure needed
  - The API and database ports are never exposed outside the container
```

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    LXC Container                             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │           Workspace Backend (:18789)                   │  │
│  │                                                        │  │
│  │  ┌── HTTP Router ───────────────────────────────────┐  │  │
│  │  │                                                  │  │  │
│  │  │  Request with X-Target-Port header?              │  │  │
│  │  │  ├─ YES → reverse proxy to localhost:{port}      │  │  │
│  │  │  └─ NO  → route to API handlers:                 │  │  │
│  │  │          /api/health         → health check      │  │  │
│  │  │          /api/agents         → agent CRUD        │  │  │
│  │  │          /api/agents/:id/chat→ WS agent bridge   │  │  │
│  │  │          /api/projects       → project CRUD      │  │  │
│  │  │          /api/files          → file up/download  │  │  │
│  │  │          /api/ports          → detected ports    │  │  │
│  │  │          /*                  → embedded UI       │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │  ┌── Background Workers ────────────────────────────┐  │  │
│  │  │  Port watcher  — polls ss, pushes events         │  │  │
│  │  │  Agent manager — tracks bzcode processes         │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  localhost:3000  ← user's React app (agent started)          │
│  localhost:8080  ← user's API server (agent started)         │
│  bzcode process  ← managed by workspace backend              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 Request Routing

The workspace backend serves two fundamentally different types of traffic on the same port. FlowInfra distinguishes them by subdomain and signals the intent via a header:

| Subdomain pattern | X-Target-Port | Workspace backend behavior |
|---|---|---|
| `ws-abc.workspaces.example.com` | (absent) | Routes to API handlers |
| `ws-abc-3000.workspaces.example.com` | `3000` | Reverse-proxies to `localhost:3000` |

```go
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    if port := r.Header.Get("X-Target-Port"); port != "" {
        s.portProxy(w, r, port)
        return
    }
    s.apiRouter.ServeHTTP(w, r)
}
```

The port proxy is a standard `httputil.ReverseProxy` targeting `localhost:{port}`. It must handle WebSocket upgrades (for HMR, hot reload) by detecting `Connection: Upgrade` and hijacking the connection.

**Host header rewriting is critical.** Modern dev servers (Vite, Webpack, Next.js) reject requests where the `Host` header doesn't match `localhost`. The proxy must overwrite the host before forwarding:

```go
proxy.Director = func(req *http.Request) {
    req.URL.Scheme = "http"
    req.URL.Host = net.JoinHostPort("127.0.0.1", port)
    req.Host = net.JoinHostPort("127.0.0.1", port) // bypasses dev server host check
}
```

Without this, Vite/Webpack will return "Invalid Host Header" because the original `Host` is the public subdomain (`ws-abc-3000.workspaces.example.com`).

### 3.2 Agent Bridge

WebSocket endpoint at `/api/agents/{id}/chat` that connects the user's browser to a running bzcode agent via a structured JSON protocol.

**Protocol:** Each WebSocket message is a JSON envelope:

```json
// User → Agent
{ "type": "message", "content": "add a login page to the React app" }

// Agent → User
{ "type": "message", "content": "I'll create a login component..." }
{ "type": "tool_use", "tool": "file_write", "path": "src/Login.tsx", "status": "running" }
{ "type": "tool_result", "tool": "file_write", "path": "src/Login.tsx", "status": "done" }
{ "type": "message", "content": "Done. I've created src/Login.tsx and updated the router." }

// System events (pushed by workspace backend)
{ "type": "port_opened", "port": 3000 }
{ "type": "port_closed", "port": 3000 }
```

The workspace backend bridges this WebSocket to the bzcode process. The agent runs commands and modifies files internally — the user never gets a raw shell. Multiple agents can run simultaneously (one per project), each with its own chat WebSocket.

### 3.3 Port Watcher

Background goroutine that detects listening ports:

```go
func (s *Server) watchPorts(ctx context.Context) {
    known := map[int]bool{}
    for {
        select {
        case <-ctx.Done():
            return
        case <-time.After(2 * time.Second):
            current := detectListeningPorts() // parses ss -tln4 --no-header
            for _, port := range current {
                if !known[port] {
                    known[port] = true
                    s.broadcastEvent(PortOpenedEvent{Port: port})
                }
            }
            for port := range known {
                if !slices.Contains(current, port) {
                    delete(known, port)
                    s.broadcastEvent(PortClosedEvent{Port: port})
                }
            }
        }
    }
}
```

Excludes the workspace backend's own port (18789) and system ports from detection.

**Note on `ss` flags:** Use `ss -tln4` (without `-p`) rather than `ss -tlnp4`. The `-p` flag requires `CAP_NET_ADMIN` to show process names, and the workspace backend runs as a non-root user. The port number alone is sufficient for the UI toast ("Port 3000 detected — Open in browser?"). Process name detection can be added later by granting `AmbientCapabilities=CAP_NET_ADMIN` in the systemd unit if needed.

### 3.4 Port Proxy

Reverse-proxies HTTP and WebSocket traffic to `localhost:{port}`:

- Uses `httputil.ReverseProxy` for HTTP requests
- Detects `Connection: Upgrade` header and hijacks the connection for WebSocket pass-through (needed for HMR / hot reload)
- If nothing is listening on the target port, returns 502 Bad Gateway
- No state tracking needed — each request is independently proxied based on the header

### 3.5 Agent Manager

Manages bzcode agent instances as child processes:

| Endpoint | Description |
|---|---|
| `POST /api/agents` | Start a bzcode agent for a project directory |
| `GET /api/agents` | List running agents (id, project, status) |
| `GET /api/agents/{id}` | Get status of a specific agent |
| `GET /api/agents/{id}/chat` | WebSocket — structured JSON chat with the agent |
| `DELETE /api/agents/{id}` | Stop an agent (SIGTERM, then SIGKILL) |

Each agent runs as a child process in its own working directory. The agent manager:
- Spawns bzcode processes and establishes the bridge protocol connection
- Bridges user WebSocket ↔ bzcode process via structured JSON messages
- Tracks process health and restarts if needed
- Cleans up all agents on workspace shutdown

### 3.6 File Operations

| Endpoint | Description |
|---|---|
| `POST /api/files/upload` | Upload file(s) to a path in the workspace |
| `GET /api/files/download?path=...` | Download a file from the workspace |
| `GET /api/files/list?path=...` | List directory contents |

Used for getting code into/out of the workspace without git.

## 4. Lifecycle

### 4.1 Startup

The workspace backend is baked into the LXC base image and starts automatically:

```ini
# /etc/systemd/system/workspace-backend.service
[Unit]
Description=Workspace Backend
After=network.target

[Service]
ExecStart=/usr/local/bin/workspace-backend
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Systemd auto-restarts the backend if it crashes, ensuring agent access is restored within seconds.

### 4.2 Health Check

FlowInfra can verify workspace readiness by calling `GET /api/health` through the Incus proxy device. This replaces checking Incus container state — a container is "ready" when its workspace backend responds to health checks.

### 4.3 Shutdown

On workspace stop/delete:
1. FlowInfra calls Incus to stop the container
2. Systemd sends SIGTERM to workspace backend
3. Workspace backend gracefully shuts down: closes agent WebSocket connections, sends SIGTERM to bzcode processes, exits
4. Container stops

## 5. Security

The workspace backend does **not** perform its own authentication. It trusts that FlowInfra has authenticated the request before proxying it. This is safe because:

- The container's port 18789 is only reachable via the Incus proxy device on the host
- The host port is only reachable from within the VPC
- FlowInfra is the only service with network access to the host
- All requests pass through FlowInfra's auth middleware before reaching the container

The workspace backend runs as a non-root user inside an unprivileged LXC container. It has no special host access. Container isolation (UID mapping, blocked metadata service, blocked inter-container traffic) is handled by the host-level Incus configuration as described in the workspace implementation plan.

## 6. Trade-offs

### Agent access depends on workspace backend health

If the workspace backend crashes, users lose access to their agent sessions until systemd restarts it (typically 2-3 seconds). In-flight agent work (a command the agent was running) may be interrupted.

**Mitigation:** systemd `Restart=always` with `RestartSec=2`. For debugging a broken workspace backend, FlowInfra can fall back to Incus exec as an emergency escape hatch (admin-only).

### WebSocket proxying through two layers

Both FlowInfra and the workspace backend need WebSocket-aware proxying. Go's `httputil.ReverseProxy` does not handle WebSocket upgrades natively. Both layers must detect `Connection: Upgrade` and hijack the connection. This is a well-solved problem (libraries exist, or ~50 lines of custom code per layer), but must be explicitly implemented and tested.

## 7. Repository

The workspace backend is a separate binary from FlowInfra — it runs inside user containers, not as part of the control plane. It lives in its own repository, not in the bz-backend monorepo.

```
workspace-backend/
├── main.go
├── go.mod
├── ui/                     # React frontend (embedded into binary)
│   ├── package.json
│   ├── src/
│   └── dist/               # build output, embedded via //go:embed
├── agent/                  # bzcode agent manager + WebSocket bridge
├── portproxy/              # reverse proxy for user apps
├── portwatcher/            # ss polling + event broadcast
└── files/                  # file upload/download
```

The workspace backend is a standalone Go repository (not part of the bz-backend monorepo).

Go is chosen for single-binary deployment: the compiled binary has zero runtime dependencies — no interpreter, no virtualenv, no package manager. The core workload (process supervision, WebSocket bridging, HTTP proxying) maps naturally to Go's `os/exec`, `syscall`, and goroutine model.

**Frontend UI embedded in the binary.** The workspace backend includes a web UI (React) for chatting with agents, managing agent sessions, and previewing forwarded ports. Using Go's `embed` package, the built frontend assets are compiled directly into the binary:

```go
//go:embed ui/dist/*
var uiFiles embed.FS
```

Build pipeline:
```
1. cd ui/ && npm run build        → produces ui/dist/ (static HTML/JS/CSS)
2. go build -o workspace-backend  → embeds ui/dist/ via //go:embed
3. Copy single binary into LXC base image
```

The result is one file that serves the API, agent WebSocket bridge, port proxy, and frontend UI. Nothing else to install or configure inside the container.

The binary is cross-compiled for Linux (the LXC container target) and baked into the base LXC image during image build.

### Base Image Pre-Loading

Common development runtimes (Node.js, Python, Go, git, common CLIs) should be baked into the base LXC image at image build time — not installed on-demand when a user runs their first command. The workspace backend health check (`/api/health`) should be fast and lightweight (just "is the process up"), not gated on runtime installation. This ensures that `npm start` or `python app.py` works immediately when a workspace becomes ready, without a cold-start penalty for installing toolchains.
