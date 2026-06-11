# Backend Integration Guide

How to manage bzcode agents from an external backend. This covers session lifecycle, per-agent configuration, and the communication model. For the full stdin/stdout message protocol, see [stdio-bridge-protocol.md](stdio-bridge-protocol.md).

## Overview

bzcode is a coding agent that runs as a child process. The backend's role is to:

1. Create a session config directory with the agent's identity, tools, and behavior
2. Spawn `bzcode --stdio --resume {sessionId}` as a child process
3. Bridge user messages to bzcode's stdin and stream responses from stdout (NDJSON)
4. Kill the process to stop, re-spawn with the same ID to resume

Each agent = one bzcode process = one session ID.

## Quick start

```bash
# 1. Pick a session ID (any string — no format restrictions)
SESSION_ID="agent-coder-abc123"

# 2. Create config directory
mkdir -p ~/.boltzbit/sessions/$SESSION_ID

# 3. (Optional) Write config files
echo '{"tools": {"exclude": ["Bash"]}}' > ~/.boltzbit/sessions/$SESSION_ID/settings.json
cat > ~/.boltzbit/sessions/$SESSION_ID/IDENTITY.md << 'EOF'
# Identity
You are a code reviewer. Focus on correctness, security, and maintainability.
EOF

# 4. Spawn bzcode (in the project's working directory)
cd /path/to/project
bzcode --stdio --resume $SESSION_ID
```

If the `.jsonl` conversation log doesn't exist yet, bzcode starts a fresh session with that ID. If it does exist, bzcode resumes the conversation. Either way, config from the session directory is loaded.

## Authentication

Set `BZ_API_KEY` in the environment to bypass interactive login:

```bash
BZ_API_KEY=your-key-here bzcode --stdio --resume $SESSION_ID
```

Without this, bzcode will attempt interactive login which fails in headless/stdio mode.

## Session directory structure

```
~/.boltzbit/sessions/
  {sessionId}.jsonl                    ← conversation log (managed by bzcode, don't touch)
  {sessionId}/                         ← session config (managed by the backend)
    settings.json                      ← model, tools, permissions, MCP servers
    IDENTITY.md                        ← who the agent is
    SOUL.md                            ← how the agent behaves (tone, style, approach)
    AGENTS.md                          ← project instructions for this agent
    skills/{name}/SKILL.md             ← session-specific skills
    agents/{name}/AGENT.md             ← session-specific sub-agent types
```

All files are optional — only include what you want to override. The backend writes them before spawning bzcode; bzcode only reads them.

**Important**: the `.jsonl` file is bzcode's internal state. Don't write to it, parse it, or delete it while bzcode is running. To clear conversation history, delete the `.jsonl` while the process is stopped.

## Config priority

Session config overrides project and user config. CLI `--identity` is the only thing that beats session level.

| Priority | Source | Location |
|----------|--------|----------|
| 1 (highest) | CLI flags | `--identity` |
| 2 | Session | `~/.boltzbit/sessions/{id}/` |
| 3 | Project | `{cwd}/.boltzbit/` |
| 4 | User | `~/.boltzbit/` |
| 5 (lowest) | Built-in | Hardcoded defaults |

If the session directory doesn't exist, bzcode falls back to project/user/default — no behavior change from a normal session.

## settings.json reference

```json
{
  "model": "boltzbit-baryon-1.0",
  "thinking": true,
  "mode": "yolo",
  "permissions": {
    "allow": ["Bash(command:ls *)", "FileRead"],
    "deny": ["Bash(command:rm *)"]
  },
  "mcp": {
    "my-server": {
      "command": "npx",
      "args": ["my-mcp-server"],
      "env": { "API_KEY": "..." }
    }
  },
  "tools": {
    "exclude": ["Bash", "FileWrite"]
  }
}
```

All fields are optional.

### Tool filtering

Controls which tools are available to the agent. Use `tools.include` (whitelist) or `tools.exclude` (blacklist) — not both. If both are set, `include` takes precedence.

- **`include`**: only these tools are registered. Everything else is removed.
- **`exclude`**: all tools are registered except these.

Available tool names:

| Tool | Purpose |
|------|---------|
| `Bash` | Shell command execution |
| `FileRead` | Read file contents |
| `FileEdit` | Edit files (search & replace) |
| `FileWrite` | Create or overwrite files |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents (ripgrep) |
| `TodoWrite` | Track task progress |
| `AskUserQuestion` | Ask the user a question |
| `EnterPlanMode` | Switch to planning mode |
| `ExitPlanMode` | Exit planning mode |
| `Skill` | Invoke a skill |
| `WebFetch` | Fetch a URL |
| `Agent` | Spawn a sub-agent |
| `mcp__*` | MCP server tools (prefixed with server name) |

### Settings merge rules

When session, project, and user settings coexist:

- **Scalars** (`model`, `thinking`): highest-priority source wins
- **Maps** (`mcp`): merged — `{...user, ...project, ...session}` — session overrides conflicting keys
- **Hooks**: concatenated from all sources
- **Permissions**: concatenated from all sources
- **Tools filter**: session only (not merged — session defines the complete filter)

## IDENTITY.md

Defines who the agent is — its role and capabilities. Replaces the project/user identity.

```markdown
# Identity

You are a code reviewer. Focus on correctness, security, and maintainability. Do not make changes — only report findings.
```

## SOUL.md

Defines how the agent behaves — coding style, tone, output format. Replaces the project/user soul. See `.boltzbit/SOUL.md` in the bzcode repo for the default.

## AGENTS.md

Project instructions for this agent. Unlike user/project AGENTS.md (which concatenate), a session-level AGENTS.md **replaces** them entirely. This lets the backend define the complete instruction set for each agent role without inheriting unrelated project instructions.

## Communication

bzcode uses NDJSON (newline-delimited JSON) over stdin/stdout. See [stdio-bridge-protocol.md](stdio-bridge-protocol.md) for the full message schema.

**Basic flow:**
```
Backend                              bzcode
  │                                    │
  │  spawn: bzcode --stdio --resume X  │
  │                                    │
  │◄── {"type":"session", ...}  ───────│  init (session ID, model, commands)
  │                                    │
  │─── {"type":"user", "content":"…"}─►│  send user message
  │                                    │
  │◄── {"type":"status","status":"…"} ─│  running / idle
  │◄── {"type":"delta", ...}  ─────────│  streaming tokens
  │◄── {"type":"assistant", ...} ──────│  complete response
  │◄── {"type":"tool", ...} ───────────│  tool execution events
  │◄── {"type":"prompt", ...} ─────────│  permission / input requests
  │◄── {"type":"result", ...} ─────────│  query complete
  │                                    │
```

**Key points:**
- The first message from bzcode is always `type: "session"` with session metadata
- Send `type: "user"` messages to submit queries
- Handle `type: "prompt"` messages — these require a response (permission approval or user input)
- `type: "result"` signals the end of a query — the agent is idle and ready for the next input
- stderr contains debug output — log it but don't parse it as JSON

## Agent lifecycle

### Create and start

```
1. Generate session ID
2. mkdir ~/.boltzbit/sessions/{id}/
3. Write config files (settings.json, IDENTITY.md, etc.)
4. cd {projectDir}
5. Spawn: BZ_API_KEY=... bzcode --stdio --resume {id}
6. Read the "session" init message from stdout
7. Bridge user messages ↔ stdin/stdout
```

### Stop

Kill the bzcode process. The conversation is already persisted to the `.jsonl` file after each turn.

### Resume

Re-spawn with the same command: `bzcode --stdio --resume {id}`. The conversation history and config are both restored. The backend can update config files between stops and resumes — changes take effect on next start.

### Delete

1. Stop the process (if running)
2. Remove `~/.boltzbit/sessions/{id}.jsonl`
3. Remove `~/.boltzbit/sessions/{id}/`

## Example: different agent roles

### Read-only reviewer

```
~/.boltzbit/sessions/reviewer-001/
  settings.json     {"tools": {"include": ["FileRead", "Glob", "Grep"]}}
  IDENTITY.md       "You are a code reviewer..."
```

### Full coder with custom identity

```
~/.boltzbit/sessions/coder-001/
  IDENTITY.md       "You are a senior engineer working on the auth module..."
```

### Planner (limited tools)

```
~/.boltzbit/sessions/planner-001/
  settings.json     {"tools": {"include": ["TodoWrite", "FileRead", "Glob", "Grep"]}}
  IDENTITY.md       "You are a project planner. Break down tasks into steps."
```

### Yolo agent (auto-approve everything)

```
~/.boltzbit/sessions/yolo-001/
  settings.json     {"mode": "yolo"}
  IDENTITY.md       "You are an autonomous coding agent..."
```

Available modes: `default`, `plan`, `yolo`. Can also be changed at runtime via `setMode` message — see [stdio-bridge-protocol.md](stdio-bridge-protocol.md).
