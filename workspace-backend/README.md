# Workspace Backend

Go backend that runs inside LXC workspace containers, serving as the host for bzcode agent processes. Users interact with agents through a structured chat UI — no raw shell access.

See [design doc](../docs/design/workspace-backend-design.md) for full architecture.

## Quick Start

**Prerequisites:** Go 1.22+, pnpm, [oapi-codegen](https://github.com/oapi-codegen/oapi-codegen), [task](https://taskfile.dev), [golines](https://github.com/segmentio/golines)

```bash
# Install tools (one-time)
go install github.com/deepmap/oapi-codegen/v2/cmd/oapi-codegen@master
go install github.com/go-task/task/v3/cmd/task@latest
go install github.com/segmentio/golines@v0.13.0

# Install UI deps
task ui:install

# Build (generates API code, builds UI, compiles Go binary)
task build

# Cross-compile for Linux (for deployment to LXC containers)
task build GOOS=linux GOARCH=amd64
task build GOOS=linux GOARCH=arm64

# Run
# bzcode must be on PATH (or pass --bzcode /path/to/bzcode)
./workspace-backend
```

## Development

```bash
# Run UI dev server (hot reload, proxies /api to :18789)
task ui:dev

# Regenerate API code after editing openapi.yaml
task gen

# Format Go code (gofmt + golines)
task fmt

# Lint Go code (go vet + format check)
task lint

# Run Go tests
task test

# Lint UI code
task ui:check
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/agents` | Start or resume an agent |
| `GET` | `/api/agents` | List all sessions (running + stopped) |
| `GET` | `/api/agents/{id}` | Get agent details |
| `DELETE` | `/api/agents/{id}` | Stop a running agent |
| `WS` | `/api/agents/{id}/chat` | WebSocket chat bridge |

The API contract is defined in [`openapi.yaml`](openapi.yaml).

### Port Proxy (not yet implemented)

Requests with an `X-Target-Port` header are reverse-proxied to `localhost:{port}`. This is how FlowInfra routes user app previews (React dev servers, APIs) through the single workspace port.

## Architecture

```
workspace-backend/
├── main.go              # entry point, embed, routing, shutdown
├── openapi.yaml         # API contract (source of truth)
├── oapi-codegen.yaml    # codegen config
├── Taskfile.yaml        # build tasks
├── api/
│   ├── generated.go     # oapi-codegen output (DO NOT EDIT)
│   └── handlers.go      # implements StrictServerInterface
├── service/
│   ├── agent.go         # agent lifecycle + session file reader
│   └── bridge.go        # WebSocket ↔ bzcode stdio bridge
└── ui/                  # React frontend (embedded into binary)
    ├── src/routes/      # TanStack Router file-based routes
    └── dist/            # build output (go:embed)
```

## How It Works

1. `POST /api/agents` spawns `bzcode --stdio` as a child process
2. bzcode emits `{"type":"session","sessionId":"..."}` — that becomes the agent ID
3. `GET /api/agents/{id}/chat` upgrades to WebSocket, bridges client ↔ bzcode stdin/stdout
4. `GET /api/agents` scans `~/.boltzbit/sessions/*.jsonl` for all sessions, annotates with `isRunning`
5. The React UI is embedded into the Go binary via `//go:embed` and served at `/`
