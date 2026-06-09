# Project & Agent Domain Model — Discussion

## Context

The workspace backend is the agent host for bzcode inside LXC containers. As we move beyond the skeleton (health + WebSocket bridge), we need a proper domain model for projects and agents. This document captures the current discussion and proposed design, including open questions for the bzcode side.

## Current State

### What bzcode supports today

- **Session = one working directory.** The session header stores `workingDir`, sessions are scoped to a cwd.
- **No "project" concept** — the cwd IS the project.
- **Configuration is directory-based**, living in `.boltzbit/` inside the project directory:
  - `settings.json` — permissions, MCP servers, model, hooks
  - `IDENTITY.md` — agent identity/persona
  - `AGENTS.md` — project instructions (also `./AGENTS.md` at repo root)
  - `MEMORY.md` — persistent context
  - `skills/{name}/SKILL.md` — custom skills
  - `agents/{name}/AGENT.md` — custom sub-agent types (used internally by bzcode)
- **Configuration hierarchy**: Project `.boltzbit/` > User `~/.boltzbit/` > Built-in defaults
- **Identity is overridable** via `--identity <text>` flag at startup
- **Skills are path-filtered** — a skill can declare `paths: [src/**]` and only activate when matching files exist

### What the workspace backend does today

- Spawns `bzcode --stdio` as child processes, one per agent
- Bridges WebSocket ↔ bzcode stdin/stdout (NDJSON protocol)
- Tracks running agents in-memory, reads stopped sessions from `~/.boltzbit/sessions/*.jsonl`
- No concept of "project" — agents are flat, each has a `projectDir`

## Proposed Domain Model

### Requirements

1. **Projects as first-class resource** — users manage projects, not just raw directory paths
2. **One project → many agents** — multiple bzcode sessions running in the same project
3. **Future: general agents** — not just coding agents; different agent types/presets
4. **Per-agent config** — identity, mode, model; separate from project-level config

### Projects

A project is **folder-bound** — it's a registered directory with metadata layered on top.

```
Project
  ├── id          (generated, e.g. "proj_abc123")
  ├── name        (display name, e.g. "My React App")
  ├── path        (absolute directory path — the real identity)
  ├── createdAt
  └── agents[]    (running + stopped sessions in this directory)
```

**Why folder-bound, not purely logical:**
- bzcode's entire config discovery is directory-relative (`.boltzbit/`, `AGENTS.md`, skills)
- Making it logical would mean duplicating bzcode's config machinery at our level
- The directory IS the project from bzcode's perspective — we just add a name and grouping

**Storage**: Simple JSON file at `~/.boltzbit/workspace/projects.json` (or workspace backend's data dir). Projects are lightweight pointers to directories, not copies of config.

### Agents

An agent = a running (or previously run) bzcode session.

```
Agent
  ├── id          (= bzcode sessionId, e.g. "bright-rolling-tower")
  ├── projectId   (FK → project)
  ├── status      (running / stopped / error)
  ├── preset      (future: which agent type — "coder", "reviewer", etc.)
  └── config      (per-agent overrides — see below)
```

**Naming note**: bzcode uses `.boltzbit/agents/{name}/AGENT.md` for its internal sub-agent types (Explore, code-reviewer, etc.). These are a completely different concept — they're persona templates used *inside* a single bzcode session. Our "agent" is a running bzcode process. No file-level conflict.

### API Endpoints (proposed)

```
POST   /api/projects                    Create/register a project
GET    /api/projects                    List projects
GET    /api/projects/{id}               Get project details
DELETE /api/projects/{id}               Unregister a project

POST   /api/projects/{id}/agents        Start an agent in this project
GET    /api/projects/{id}/agents        List agents for this project
GET    /api/agents/{id}                 Get agent details
DELETE /api/agents/{id}                 Stop an agent
WS     /api/agents/{id}/chat            WebSocket bridge
```

## Config Layering: Project vs Agent

### The problem

If two agents run in the same project directory, they share the same `.boltzbit/settings.json`, `IDENTITY.md`, skills, etc. You can't give one agent different tools or a different persona via project-level config alone.

### Proposed split

| Scope | What it controls | Where it lives | Examples |
|-------|-----------------|----------------|----------|
| **Project config** (shared) | Codebase-level concerns | `.boltzbit/` in the project dir | Tool permissions, MCP servers, skills, project instructions (`AGENTS.md`), memory |
| **Agent config** (per-agent) | Agent role/behavior | Workspace backend's own storage | Identity/persona, mode (default/plan/yolo), model override |

### How per-agent config works today

The workspace backend translates per-agent config into bzcode CLI flags at spawn time:

| Agent config field | bzcode mechanism |
|-------------------|------------------|
| Identity/persona | `--identity <text>` flag (overrides project `IDENTITY.md`) |
| Mode | `setMode` message sent after startup |
| Model | Potentially `--model` flag or env var (not yet supported by bzcode) |

This means:
- **Identity** is fully per-agent today via `--identity`
- **Mode** is per-agent via the `setMode` protocol message
- **Tools/permissions** are per-project (shared via `.boltzbit/settings.json`)
- **Skills** are per-project (shared via `.boltzbit/skills/`)

### What's missing from bzcode for full per-agent config

1. **Per-process settings override** — A flag like `--settings <path>` that lets bzcode load an alternate `settings.json` instead of (or merged with) the project one. This would allow per-agent tool permissions without modifying the shared project config.

2. **Per-process skill filtering** — A way to restrict which skills are available to a specific bzcode instance, beyond the existing path-based filtering.

3. **Model override flag** — A `--model <name>` flag to set the model per agent at startup.

These are nice-to-haves. The current `--identity` + `setMode` covers the primary use case of running different agent roles (coder, reviewer, planner) in the same project.

## Future: Agent Presets

Presets are a workspace-backend concept — templates for agent config:

```json
{
  "presets": {
    "coder": {
      "identity": null,
      "mode": "default"
    },
    "reviewer": {
      "identity": "You are a code reviewer. Focus on correctness, security, and maintainability.",
      "mode": "default"
    },
    "planner": {
      "identity": "You are a project planner. Break down tasks and create implementation plans.",
      "mode": "plan"
    }
  }
}
```

When creating an agent, the user picks a preset. The workspace backend translates it to `bzcode --stdio --identity "..." [--other-flags]`.

## Open Questions

1. **Should bzcode support `--settings <path>`?** This would unlock per-agent tool restrictions without file conflicts. Current workaround: all agents in the same project share tool permissions.

2. **Should bzcode support `--model <model-name>`?** Would allow per-agent model selection at startup without runtime switching.

3. **Should bzcode expose its sub-agent types via the stdio protocol?** The workspace backend could then offer them as preset templates in the UI.

4. **Session resume across restarts** — When the workspace backend restarts, all agents die. Should we support reconnecting to still-running bzcode processes, or is clean restart acceptable?
