# bzcode stdio bridge protocol

Build a frontend for the bzcode coding agent. The `bzcode` binary runs as a child process in `--stdio` mode. Your frontend communicates with it over stdin/stdout using NDJSON (one JSON object per line).

## Quick start

```bash
# Launch the agent in bridge mode
./bzcode --stdio
```

The agent reads JSON messages from stdin and writes JSON messages to stdout. Each message is a single line of JSON terminated by `\n`. stderr is used for debug/log output and should be displayed or ignored, never parsed as JSON.

## Protocol overview

```
Your Frontend (Client)                  bzcode (Server)
       │                                     │
       │◄──── { type: "session", ... } ───────│  session init
       │                                     │
       │──── { type: "user", ... } ─────────►│  send query
       │                                     │
       │◄──── { type: "status", "running" } ─│  agent working
       │◄──── { type: "delta", ... } ────────│  streaming tokens
       │◄──── { type: "delta", ... } ────────│  more tokens...
       │◄──── { type: "assistant", ... } ────│  complete message
       │◄──── { type: "tool", "running" } ───│  tool starting
       │◄──── { type: "prompt", ... } ───────│  needs approval
       │                                     │
       │──── { subtype: "permission" } ─────►│  user approves
       │                                     │
       │◄──── { type: "tool", "done" } ──────│  tool finished
       │◄──── { type: "prompt", "input" } ───│  asks user question
       │                                     │
       │──── { subtype: "input" } ──────────►│  user answers
       │                                     │
       │◄──── { type: "delta", ... } ────────│  more streaming
       │◄──── { type: "assistant", ... } ────│  complete message
       │◄──── { type: "result", "success" } ─│  query complete
       │◄──── { type: "status", "idle" } ────│  ready for input
       │                                     │
```

## Type schemas

### ClientMessage (Client → Server)

```typescript
type ClientMessage = MessageMeta &
  (
    | { type: 'user'; content: string | ContentBlock[] }
    | { type: 'user'; subtype: 'permission'; requestId: string; behavior: 'allow' | 'deny' | 'always'; feedback?: string }
    | { type: 'user'; subtype: 'input'; requestId: string; answers: Record<string, string> }
    | { type: 'abort' }
    | { type: 'setMode'; mode: SessionMode }
  )
```

### ServerMessage (Server → Client)

```typescript
type MessageMeta = { timestamp?: string; sessionId?: string }

type ServerMessage = MessageMeta &
  // Session
  (
    | { type: 'session'; sessionId: string; workingDir: string; commands: CommandInfo[]; modes: SessionMode[]; isLoggedIn: boolean; isCreator: boolean; environment: string; parentSessionId?: string; description?: string; messages?: Message[] }
    | { type: 'status'; status: 'idle' | 'running'; mode?: SessionMode; model?: ModelInfo; thinking?: boolean }
  // Streaming
  | { type: 'delta'; blockIndex: number; blockType: string; field: string; content: string }
  | { type: 'assistant'; content: ContentBlock[]; usage?: TokenUsage; stopReason?: StopReason }
  // Tools
  | { type: 'tool'; toolUseId: string; name: string; status: 'running'; input: unknown }
  | { type: 'tool'; toolUseId: string; name: string; status: 'done'; content: string; isError: boolean }
  | { type: 'tool'; toolUseId: string; name: string; status: 'error'; message: string }
  // Prompts (server asks, client responds via user with requestId)
  | { type: 'prompt'; requestId: string; subtype: 'permission'; tool: string; input: unknown }
  | { type: 'prompt'; requestId: string; subtype: 'input'; message: string; questions?: Question[] }
  // Result
  | { type: 'result'; status: 'success'; output?: string; usage?: TokenUsage }
  | { type: 'result'; status: 'error'; error: string; usage?: TokenUsage }
  | { type: 'result'; status: 'aborted'; usage?: TokenUsage }
  )

type Message =
  | { role: 'user'; content: string | ContentBlock[] }
  | { role: 'assistant'; content: ContentBlock[]; usage?: TokenUsage; stopReason?: StopReason }

type Question = {
  question: string
  header: string
  options: { label: string; description: string }[]
  multi_select?: boolean
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'toolUse'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'toolResult'; toolUseId: string; content: string | ContentBlock[]; isError?: boolean }
  | { type: 'image'; source: { type: 'base64'; mediaType: string; data: string } }

type CommandInfo = { name: string; description: string; aliases?: string[] }
type ModelInfo = { name: string; displayName: string; maxTokens: number; budgetTokens: number; contextWindow: number; tokenScalingFactor: number; vendor: string }
type SessionMode = 'default' | 'plan' | 'yolo'
type StopReason = 'endTurn' | 'maxTokens' | 'stopSequence' | 'toolUse'
type TokenUsage = {
  interactionCount: number
  inputTokens: number
  outputTokens: number
  bzTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}
```

## Message details

### Client → Server (stdin)

#### `user` — Send a query or slash command

```json
{ "type": "user", "content": "Fix the bug in auth.ts" }
```

`content` can be a plain string or an array of content blocks (for structured input like images):

```json
{ "type": "user", "content": [{ "type": "text", "text": "What does this do?" }] }
```

Slash commands are sent as regular user messages with a `/` prefix:

```json
{ "type": "user", "content": "/clear" }
{ "type": "user", "content": "/help" }
```

#### `permission` — Respond to a permission request

```json
{ "type": "user", "subtype": "permission", "requestId": "abc-123", "behavior": "allow" }
```

`behavior` is one of: `"allow"` (once), `"deny"`, `"always"` (allow for this session). When denying, an optional `feedback` string tells the agent what to do differently:

```json
{ "type": "user", "subtype": "permission", "requestId": "abc-123", "behavior": "deny", "feedback": "use a safer command" }
```

#### `input` — Respond to an AskUserQuestion prompt

```json
{ "type": "user", "subtype": "input", "requestId": "req_456", "answers": { "Which database?": "PostgreSQL" } }
```

`answers` is a record mapping each question string to the selected answer. For multi-select questions, answers are comma-separated.

#### `abort` — Cancel the current operation

```json
{ "type": "abort" }
```

Cancels the running query, tool execution, or model stream. The server will send a `{ "type": "result", "status": "aborted" }` when cancellation completes.

#### `setMode` — Set the session mode

```json
{ "type": "setMode", "mode": "plan" }
```

Sets the session mode to the specified value. Valid modes: `"default"`, `"plan"`, `"yolo"`. The server responds with a `status` message containing the new mode. If the mode is already set to the requested value, this is a no-op.

### Server → Client (stdout)

#### `session` — Session initialized

Sent at startup and after mid-session `/resume`. Contains session identity, available commands, and auth state. When resuming a conversation (`--continue`, `--resume`, or `/resume`), includes the restored `messages` array.

`isCreator` indicates whether the authenticated user has creator access. Bridge clients should check this field and block usage for non-creators. The interactive CLI exits automatically when `isCreator` is `false`.

`modes` lists the available session modes. Use these values with the `setMode` client message. The order reflects the cycle rotation used by the interactive CLI's Shift+Tab shortcut.

```json
{
  "type": "session",
  "sessionId": "bright-exploring-forest",
  "workingDir": "/path/to/project",
  "commands": [
    { "name": "clear", "description": "Clear conversation history", "aliases": ["reset"] },
    { "name": "help", "description": "Show available commands" }
  ],
  "modes": ["default", "plan", "yolo"],
  "isLoggedIn": true,
  "isCreator": true,
  "environment": "prod"
}
```

When resuming:

```json
{
  "type": "session",
  "sessionId": "bright-exploring-forest",
  "workingDir": "/path/to/project",
  "commands": [...],
  "modes": ["default", "plan", "yolo"],
  "isLoggedIn": true,
  "isCreator": true,
  "environment": "prod",
  "messages": [
    { "role": "user", "content": "Fix the auth bug" },
    { "role": "assistant", "content": [{ "type": "text", "text": "I'll look into that." }] }
  ]
}
```

#### `status` — Agent status changed

```json
{ "type": "status", "status": "running" }
{ "type": "status", "status": "idle", "mode": "default" }
{ "type": "status", "status": "idle", "mode": "plan" }
{ "type": "status", "status": "idle", "model": { "name": "boltzbit-baryon-1.0", "displayName": "Claude 4.5 Sonnet" } }
```

`running` is sent when the agent starts processing a query. `idle` is sent after the query completes (after `result`). Use this to show/hide a loading spinner.

The optional `mode` field indicates the current session mode. Present on `idle` messages and mid-turn when `EnterPlanMode` or `ExitPlanMode` tools complete. Values: `"default"` (normal operation), `"plan"` (read-only planning mode), or `"yolo"` (auto-allow all tools). Use this to show a mode indicator in your UI.

The optional `model` field contains the current model info. Present on `idle` messages. Use this to update the model display in your UI after a `/model` switch.

The optional `thinking` field indicates whether thinking mode is enabled. Present on `idle` messages. Use this to show a thinking indicator in your UI.

#### `delta` — Streaming content block delta

Sent for each chunk of streaming output. The `blockType` and `field` tell you what kind of content is being streamed.

```json
{ "type": "delta", "blockIndex": 0, "blockType": "thinking", "field": "thinking", "content": "Let me analyze" }
{ "type": "delta", "blockIndex": 0, "blockType": "thinking", "field": "thinking", "content": " this code..." }
{ "type": "delta", "blockIndex": 1, "blockType": "text", "field": "text", "content": "The bug is in" }
{ "type": "delta", "blockIndex": 1, "blockType": "text", "field": "text", "content": " the auth handler." }
```

Common `blockType` + `field` combinations:

| blockType | field | What it is | UI suggestion |
|-----------|-------|------------|---------------|
| `thinking` | `thinking` | Model's internal reasoning | Render dim/collapsed, toggle to expand |
| `thinking` | `signature` | Thinking block signature (binary) | Ignore — not user-visible |
| `text` | `text` | Response text | Render as markdown |
| `toolUse` | `input/*` | Tool input being streamed | Ignore — `tool` message is better for display |

Accumulate `content` per `blockIndex` to build the full content of each block.

#### `assistant` — Complete assistant message

Sent when the model finishes generating. Contains the full content blocks array.

```json
{
  "type": "assistant",
  "content": [
    { "type": "thinking", "thinking": "Let me analyze this code...", "signature": "..." },
    { "type": "text", "text": "The bug is in the auth handler." }
  ],
  "usage": {
    "inputTokens": 1200,
    "outputTokens": 150,
    "cacheCreationInputTokens": 800,
    "cacheReadInputTokens": 400
  },
  "stopReason": "endTurn"
}
```

`stopReason` values: `"endTurn"`, `"maxTokens"`, `"stopSequence"`, `"toolUse"`.

#### `tool` — Tool execution status

A single message type with a `status` discriminant:

**Running** — tool is about to execute:
```json
{
  "type": "tool",
  "toolUseId": "tool_01abc",
  "name": "Bash",
  "status": "running",
  "input": { "command": "npm test" }
}
```

**Done** — tool finished:
```json
{
  "type": "tool",
  "toolUseId": "tool_01abc",
  "name": "Bash",
  "status": "done",
  "content": "3 tests passed",
  "isError": false
}
```

**Error** — tool crashed:
```json
{
  "type": "tool",
  "toolUseId": "tool_01abc",
  "name": "Bash",
  "status": "error",
  "message": "Command timed out"
}
```

#### `prompt` — Agent needs user input

The agent pauses and waits for a response before continuing. Two subtypes:

**Permission prompt** — needs approval to run a tool:
```json
{
  "type": "prompt",
  "requestId": "req_abc123",
  "subtype": "permission",
  "tool": "Bash",
  "input": { "command": "rm -rf dist/" }
}
```

The frontend is responsible for formatting the display from `tool` + `input` (e.g., showing `$ rm -rf dist/` for Bash commands).

Respond with:
```json
{ "type": "user", "subtype": "permission", "requestId": "req_abc123", "behavior": "allow" }
```

When denying, you can optionally include feedback to tell the agent what to do differently:
```json
{ "type": "user", "subtype": "permission", "requestId": "req_abc123", "behavior": "deny", "feedback": "use npm instead of yarn" }
```

**Input prompt** — AskUserQuestion tool asking the user a question:
```json
{
  "type": "prompt",
  "requestId": "req_456",
  "subtype": "input",
  "message": "Which database should we use?",
  "questions": [
    {
      "question": "Which database should we use?",
      "header": "Database",
      "options": [
        { "label": "PostgreSQL", "description": "Relational, battle-tested" },
        { "label": "SQLite", "description": "Embedded, zero config" }
      ]
    }
  ]
}
```

Render the options as a selection UI. An "Other" option for free-text input should be added by the frontend. Respond with:
```json
{ "type": "user", "subtype": "input", "requestId": "req_456", "answers": { "Which database should we use?": "PostgreSQL" } }
```

**Important**: The agent blocks until it receives a response for both prompt types. Always respond.

#### `result` — Query/command finished

Sent once per inbound `user` message, after everything is done. Discriminated by `status`.

The optional `usage` field contains accumulated token usage across all model calls in the agent loop. Present when at least one model call was made. Use this to display cost or token consumption to the user.

**Success**:
```json
{ "type": "result", "status": "success", "usage": { "interactionCount": 3, "inputTokens": 4500, "outputTokens": 800, "bzTokens": 120, "cacheCreationInputTokens": 2000, "cacheReadInputTokens": 1500 } }
```

For slash commands, may include output text (no `usage` since no model call is made):
```json
{ "type": "result", "status": "success", "output": "Conversation cleared." }
```

For `/resume`, the `result` message contains only the text output. The restored conversation history is delivered in a separate `session` message that follows immediately:
```json
{ "type": "result", "status": "success", "output": "Resumed session bright-exploring-forest (12 messages)." }
```
```json
{
  "type": "session",
  "sessionId": "bright-exploring-forest",
  "workingDir": "/path/to/project",
  "commands": [...],
  "isLoggedIn": true,
  "isCreator": true,
  "environment": "prod",
  "messages": [
    { "role": "user", "content": "Fix the auth bug" },
    { "role": "assistant", "content": [{ "type": "text", "text": "I'll look into that." }] }
  ]
}
```

**Error**:
```json
{ "type": "result", "status": "error", "error": "API returned 429: rate limited", "usage": { "interactionCount": 1, "inputTokens": 1200, "outputTokens": 0, "bzTokens": 0, "cacheCreationInputTokens": 0, "cacheReadInputTokens": 0 } }
```

**Aborted** (user cancelled via `abort` message):
```json
{ "type": "result", "status": "aborted", "usage": { "interactionCount": 1, "inputTokens": 1200, "outputTokens": 50, "bzTokens": 10, "cacheCreationInputTokens": 800, "cacheReadInputTokens": 400 } }
```

Use this to re-enable the input field / stop the loading spinner.

## Content block types

Content blocks appear in `assistant` messages and in the `user` client message.

```typescript
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "toolUse"; id: string; name: string; input: Record<string, unknown> }
  | { type: "toolResult"; toolUseId: string; content: string | ContentBlock[]; isError?: boolean }
  | { type: "image"; source: { type: "base64"; mediaType: string; data: string } }
```

## Full example sessions

Below is a complete stdin/stdout exchange. Lines marked `>>>` are stdin (client → server), lines marked `<<<` are stdout (server → client).

### Example 1: Simple question

```
<<< {"type":"session","sessionId":"bright-exploring-forest","workingDir":"/path/to/project","commands":[{"name":"clear","description":"Clear conversation history","aliases":["reset"]},{"name":"help","description":"Show available commands"}],"modes":["default","plan","yolo"],"isLoggedIn":true,"isCreator":true,"environment":"prod"}
>>> {"type":"user","content":"What is 2+2?"}
<<< {"type":"status","status":"running"}
<<< {"type":"delta","blockIndex":0,"blockType":"thinking","field":"thinking","content":"Simple math"}
<<< {"type":"delta","blockIndex":0,"blockType":"thinking","field":"thinking","content":" question."}
<<< {"type":"delta","blockIndex":1,"blockType":"text","field":"text","content":"2 + 2 = 4"}
<<< {"type":"assistant","content":[{"type":"thinking","thinking":"Simple math question."},{"type":"text","text":"2 + 2 = 4"}],"usage":{"interactionCount":1,"inputTokens":50,"outputTokens":10,"bzTokens":5,"cacheCreationInputTokens":30,"cacheReadInputTokens":20},"stopReason":"endTurn"}
<<< {"type":"result","status":"success","usage":{"interactionCount":1,"inputTokens":50,"outputTokens":10,"bzTokens":5,"cacheCreationInputTokens":30,"cacheReadInputTokens":20}}
<<< {"type":"status","status":"idle"}
```

### Example 2: Tool use with permission

```
<<< {"type":"session","sessionId":"calm-brewing-aurora","workingDir":"/path/to/project","commands":[],"modes":["default","plan","yolo"],"isLoggedIn":true,"isCreator":true,"environment":"prod"}
>>> {"type":"user","content":"Run the tests"}
<<< {"type":"status","status":"running"}
<<< {"type":"delta","blockIndex":0,"blockType":"text","field":"text","content":"I'll run the tests for you."}
<<< {"type":"assistant","content":[{"type":"text","text":"I'll run the tests for you."},{"type":"toolUse","id":"tool_01","name":"Bash","input":{"command":"npm test"}}],"stopReason":"toolUse"}
<<< {"type":"tool","toolUseId":"tool_01","name":"Bash","status":"running","input":{"command":"npm test"}}
<<< {"type":"prompt","requestId":"req_001","subtype":"permission","tool":"Bash","input":{"command":"npm test"}}
>>> {"type":"user","subtype":"permission","requestId":"req_001","behavior":"allow"}
<<< {"type":"tool","toolUseId":"tool_01","name":"Bash","status":"done","content":"All 5 tests passed.","isError":false}
<<< {"type":"delta","blockIndex":0,"blockType":"text","field":"text","content":"All 5 tests passed!"}
<<< {"type":"assistant","content":[{"type":"text","text":"All 5 tests passed!"}],"stopReason":"endTurn"}
<<< {"type":"result","status":"success","usage":{"interactionCount":2,"inputTokens":500,"outputTokens":80,"bzTokens":20,"cacheCreationInputTokens":100,"cacheReadInputTokens":400}}
<<< {"type":"status","status":"idle"}
```

### Example 3: Slash command

```
>>> {"type":"user","content":"/clear"}
<<< {"type":"result","status":"success","output":"Conversation cleared."}
<<< {"type":"status","status":"idle"}
```

### Example 4: Deny permission

```
>>> {"type":"user","content":"Delete all temp files"}
<<< {"type":"status","status":"running"}
<<< {"type":"assistant","content":[{"type":"text","text":"I'll clean up the temp files."},{"type":"toolUse","id":"tool_02","name":"Bash","input":{"command":"rm -rf /tmp/myapp/*"}}],"stopReason":"toolUse"}
<<< {"type":"tool","toolUseId":"tool_02","name":"Bash","status":"running","input":{"command":"rm -rf /tmp/myapp/*"}}
<<< {"type":"prompt","requestId":"req_002","subtype":"permission","tool":"Bash","input":{"command":"rm -rf /tmp/myapp/*"}}
>>> {"type":"user","subtype":"permission","requestId":"req_002","behavior":"deny"}
<<< {"type":"tool","toolUseId":"tool_02","name":"Bash","status":"done","content":"Blocked","isError":true}
<<< {"type":"delta","blockIndex":0,"blockType":"text","field":"text","content":"The command was denied. Would you like me to try a safer approach?"}
<<< {"type":"assistant","content":[{"type":"text","text":"The command was denied. Would you like me to try a safer approach?"}],"stopReason":"endTurn"}
<<< {"type":"result","status":"success","usage":{"interactionCount":2,"inputTokens":400,"outputTokens":60,"bzTokens":15,"cacheCreationInputTokens":80,"cacheReadInputTokens":320}}
<<< {"type":"status","status":"idle"}
```

### Example 5: AskUserQuestion

```
>>> {"type":"user","content":"Set up a database"}
<<< {"type":"status","status":"running"}
<<< {"type":"assistant","content":[{"type":"text","text":"Let me ask about your preference."},{"type":"toolUse","id":"tool_03","name":"AskUserQuestion","input":{"questions":[{"question":"Which database should we use?","header":"Database","options":[{"label":"PostgreSQL","description":"Relational, battle-tested"},{"label":"SQLite","description":"Embedded, zero config"}]}]}}],"stopReason":"toolUse"}
<<< {"type":"prompt","requestId":"req_003","subtype":"input","message":"Which database should we use?","questions":[{"question":"Which database should we use?","header":"Database","options":[{"label":"PostgreSQL","description":"Relational, battle-tested"},{"label":"SQLite","description":"Embedded, zero config"}]}]}
>>> {"type":"user","subtype":"input","requestId":"req_003","answers":{"Which database should we use?":"PostgreSQL"}}
<<< {"type":"tool","toolUseId":"tool_03","name":"AskUserQuestion","status":"done","content":"{\"questions\":[...],\"answers\":{\"Which database should we use?\":\"PostgreSQL\"}}","isError":false}
<<< {"type":"delta","blockIndex":0,"blockType":"text","field":"text","content":"Great, I'll set up PostgreSQL."}
<<< {"type":"assistant","content":[{"type":"text","text":"Great, I'll set up PostgreSQL."}],"stopReason":"endTurn"}
<<< {"type":"result","status":"success","usage":{"interactionCount":2,"inputTokens":600,"outputTokens":90,"bzTokens":25,"cacheCreationInputTokens":120,"cacheReadInputTokens":480}}
<<< {"type":"status","status":"idle"}
```

### Example 6: Abort mid-stream

```
>>> {"type":"user","content":"Explain quantum computing in detail"}
<<< {"type":"status","status":"running"}
<<< {"type":"delta","blockIndex":0,"blockType":"text","field":"text","content":"Quantum computing is a type of"}
>>> {"type":"abort"}
<<< {"type":"result","status":"aborted","usage":{"interactionCount":1,"inputTokens":200,"outputTokens":10,"bzTokens":3,"cacheCreationInputTokens":50,"cacheReadInputTokens":150}}
<<< {"type":"status","status":"idle"}
```

### Example 7: Set mode

```
>>> {"type":"setMode","mode":"plan"}
<<< {"type":"status","status":"idle","mode":"plan"}
>>> {"type":"setMode","mode":"yolo"}
<<< {"type":"status","status":"idle","mode":"yolo"}
>>> {"type":"setMode","mode":"default"}
<<< {"type":"status","status":"idle","mode":"default"}
```

### Example 8: Switch model

The `/model` command uses the existing slash command and input prompt flow. No special message types needed.

```
>>> {"type":"user","content":"/model"}
<<< {"type":"prompt","requestId":"req_007","subtype":"input","message":"Which model would you like to use?","questions":[{"question":"Which model would you like to use?","header":"Model","options":[{"label":"Claude 4.5 Sonnet","description":"(current)"},{"label":"Claude 4 Opus","description":"anthropic-claude-4-opus"}]}]}
>>> {"type":"user","subtype":"input","requestId":"req_007","answers":{"Which model would you like to use?":"Claude 4 Opus"}}
<<< {"type":"result","status":"success","output":"Model switched to: Claude 4 Opus (anthropic-claude-4-opus)"}
<<< {"type":"status","status":"idle","model":{"name":"anthropic-claude-4-opus","displayName":"Claude 4 Opus","maxTokens":32000,"budgetTokens":31999,"contextWindow":200000,"tokenScalingFactor":1,"vendor":"anthropic"}}
```

Direct switch (skip the picker):

```
>>> {"type":"user","content":"/model anthropic-claude-4-opus"}
<<< {"type":"result","status":"success","output":"Model switched to: Claude 4 Opus (anthropic-claude-4-opus)"}
<<< {"type":"status","status":"idle","model":{"name":"anthropic-claude-4-opus","displayName":"Claude 4 Opus","maxTokens":32000,"budgetTokens":31999,"contextWindow":200000,"tokenScalingFactor":1,"vendor":"anthropic"}}
```

## Implementation guide for Electron

### Spawning the process

```typescript
import { spawn } from 'child_process'

const agent = spawn('./bzcode', ['--stdio'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: '/path/to/project',
  env: {
    ...process.env,
    BZ_ENV: 'prod',
  },
})
```

### Reading messages

```typescript
import * as readline from 'readline'

const rl = readline.createInterface({ input: agent.stdout })

rl.on('line', (line) => {
  const msg = JSON.parse(line)
  switch (msg.type) {
    case 'session':
      // Session initialized, store commands list, session ID, show UI
      break
    case 'status':
      // Show/hide loading spinner based on msg.status
      break
    case 'delta':
      // Append msg.content to the current block (identified by msg.blockIndex)
      break
    case 'assistant':
      // Finalize the message, render complete content blocks
      break
    case 'tool':
      // Show tool status: running → spinner, done → result, error → error message
      break
    case 'prompt':
      if (msg.subtype === 'permission') {
        // Show permission dialog, respond with permission message
      } else if (msg.subtype === 'input') {
        // Show question UI with options, respond with answers
      }
      break
    case 'result':
      // Query complete: check msg.status for success/error/aborted
      if (msg.status === 'error') showError(msg.error)
      if (msg.status === 'success' && msg.output) showOutput(msg.output)
      break
  }
})

// Log stderr for debugging
agent.stderr.on('data', (data) => console.error(data.toString()))
```

### Sending messages

```typescript
function send(msg: object) {
  agent.stdin.write(JSON.stringify(msg) + '\n')
}

// Send user query
send({ type: 'user', content: 'Fix the login bug' })

// Respond to permission request
send({ type: 'user', subtype: 'permission', requestId: 'req_001', behavior: 'allow' })

// Respond to AskUserQuestion
send({ type: 'user', subtype: 'input', requestId: 'req_002', answers: { 'Which database?': 'PostgreSQL' } })

// Send slash command
send({ type: 'user', content: '/clear' })

// Abort current operation
send({ type: 'abort' })
```

### Streaming rendering

To render streaming content, maintain a map of blocks by `blockIndex`:

```typescript
const streamingBlocks = new Map<number, { type: string; content: string }>()

function handleDelta(msg: { blockIndex: number; blockType: string; field: string; content: string }) {
  const existing = streamingBlocks.get(msg.blockIndex) ?? { type: msg.blockType, content: '' }
  existing.content += msg.content
  streamingBlocks.set(msg.blockIndex, existing)

  // Re-render: show thinking blocks dim, text blocks normal
  renderBlocks(streamingBlocks)
}

function handleAssistant() {
  // Finalize — clear streaming state, render from assistant content blocks
  streamingBlocks.clear()
}
```

## CLI flags

| Flag | Description |
|------|-------------|
| `--stdio` | Run in bridge mode (NDJSON over stdin/stdout) |
| `-c, --continue` | Resume the most recent conversation |
| `-r, --resume <id>` | Resume a conversation by session ID |
| `-f, --fork <id>` | Fork a new session from an existing session ID |
| `-i, --identity <text>` | Override the agent identity prompt |
| `-t, --tools` | List registered tool names |
| `-v, --version` | Show version number |
| `-h, --help` | Show help message |

When resuming, the `session` message includes a `messages` array with the restored conversation history.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BZ_ENV` | `prod` | Environment: `prod` or `test` |

## Session persistence

Conversations are automatically persisted to `~/.boltzbit/sessions/{sessionId}.jsonl` as JSONL. Session files are only created when the first message is sent — quitting before sending anything does not create a file. Each file starts with a `session` header line followed by `Message` entries (the model-facing format, not bridge messages). Messages are appended after each turn.

## Authentication

The agent reads credentials from `~/.boltzbit/credentials.json` at startup. The `session` message's `isLoggedIn` field reflects whether a valid token was found.

### Credential file format

Credentials are keyed by auth URL so prod and test environments coexist:

```json
{
  "https://boltzhub.com": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "dGhpcyBp...",
    "expiresAt": 1718000000000
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `accessToken` | string | JWT access token, sent as `Authorization: Bearer` |
| `refreshToken` | string | Used to obtain a new access token when expired |
| `expiresAt` | number | Expiry as Unix timestamp in milliseconds |

The auth URL key corresponds to the environment: prod uses `https://boltzhub.com`, test uses the test auth URL. The active environment is controlled by `BZ_ENV`.

### Token lifecycle

On each API call the agent checks the stored token's expiry (with a 5-minute buffer). If expired, it refreshes automatically using the refresh token. If the credential file is empty or missing, API calls are made without auth and will fail if the backend requires it.

### Client-managed auth (bridge mode)

Bridge clients that manage their own login flow can write credentials directly to `~/.boltzbit/credentials.json` before launching `bzcode --stdio`. The agent will pick them up at startup and handle token refresh automatically.

To update credentials mid-session, write the new tokens to the credential file. The agent re-reads credentials from disk before each API call, so updated tokens take effect on the next request.

To log out externally, remove the environment's key from the credential file. The agent will stop sending auth headers on subsequent API calls.
