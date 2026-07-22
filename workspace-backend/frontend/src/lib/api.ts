/**
 * API translation layer — the ONLY file that changes when migrating from the old
 * backend to the new `workspace-backend` (`/api/v1/*`).
 *
 * Two exports:
 *   HTTP_BASE   — unified base URL constant (replaces ~20 inline derivations)
 *   HTTP_BASE_WS — WebSocket variant
 *
 * All shim functions translate old endpoint paths / request-response shapes to
 * the new backend without touching any component code. Components call the shims
 * as if they were the old backend; this file does the translation invisibly.
 *
 * Endpoints the new backend doesn't implement yet (docs, excel, ppt, canvas,
 * widgets, boltzhub, proxy, shell, sql, …) are NOT shimmed — the raw
 * `HTTP_BASE` + old path will produce a 404, which is handled by existing error
 * branches in the UI. See `workspace-backend/docs/missing-backend-apis.md` for
 * the full list.
 */

// ── Unified base URL ─────────────────────────────────────────────────────────
// Dev: blank → Vite proxy forwards /api/* and /healthz to :18789 (same-origin).
// Prod: blank → same-origin (backend serves the SPA).
// Override: set VITE_AGENT_HTTP_URL for split-deploy or direct access without proxy.

export const HTTP_BASE: string =
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ||
  (import.meta.env.PROD ? window.location.origin : '');

export const HTTP_BASE_WS: string =
  (import.meta.env.VITE_AGENT_WS_URL as string | undefined) ||
  (window.location.protocol === 'https:' ? `wss://${window.location.host}` : `ws://${window.location.host}`);

// ── Error type ───────────────────────────────────────────────────────────────

/** Thrown by all shims on a non-2xx response. Carries the HTTP status so callers
 *  can branch on 401 (needs login) vs other errors. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ── Minimal fetch helpers ────────────────────────────────────────────────────

async function jsonGet<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new ApiError(r.status, `${r.status} ${r.statusText} — ${url}`);
  return r.json() as Promise<T>;
}

async function jsonPost<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, `${r.status} ${r.statusText} — ${url}`);
  return r.json() as Promise<T>;
}

async function jsonPut<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, `${r.status} ${r.statusText} — ${url}`);
  return r.json() as Promise<T>;
}

async function jsonPatch<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, `${r.status} ${r.statusText} — ${url}`);
  return r.json() as Promise<T>;
}

async function jsonDelete(url: string): Promise<void> {
  const r = await fetch(url, { method: 'DELETE' });
  if (!r.ok) throw new ApiError(r.status, `${r.status} ${r.statusText} — ${url}`);
}

// ── Types (old camelCase shapes the UI expects) ───────────────────────────────

export type SessionInfo = {
  sessionId: string;
  workingDir: string;
  dirName: string;
  messageCount: number;
  title: string;
  lastMessage: string;
  lastModified: number; // epoch ms
  created: string;
  isDefault?: boolean;
  mode?: string;
};

export type OldConnectResponse = {
  sessionId: string;
  messages: Array<{ role: string; content: unknown; isMeta?: boolean }>;
  cwd: string;
  mode: string;
  sessionMode?: string;
  agentStatus?: string;
  modes?: string[];
  commands?: Array<{ name: string; description: string; aliases?: string[] }>;
};

// ── Auth / API key ────────────────────────────────────────────────────────────

/**
 * POST /agent-key {name, value} → PUT /api/v1/auth/api-key {value}
 * Returns the raw Response so callers can check .ok (matches old usage).
 */
export async function setApiKey(base: string, value: string): Promise<Response> {
  return fetch(`${base}/api/v1/auth/api-key`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
}

/**
 * DELETE /agent-key/{name} → DELETE /api/v1/auth/api-key
 */
export async function deleteApiKey(base: string): Promise<Response> {
  return fetch(`${base}/api/v1/auth/api-key`, { method: 'DELETE' });
}

/**
 * GET /api/apikey-status → GET /api/v1/auth/api-key
 * Returns {present: boolean} — same field name, no translation needed.
 */
export async function getApiKeyStatus(base: string): Promise<{ present: boolean }> {
  return jsonGet(`${base}/api/v1/auth/api-key`);
}

/**
 * POST /auth/logout → DELETE /api/v1/auth/api-key
 * (The new backend dropped OAuth; logout = clear the API key.)
 */
export async function logout(base: string): Promise<void> {
  await fetch(`${base}/api/v1/auth/api-key`, { method: 'DELETE' });
}

// ── User identity ─────────────────────────────────────────────────────────────

/**
 * GET /api/user/me → GET /api/v1/user
 * Translates snake_case {display_name} → camelCase {displayName}.
 */
export async function getUserMe(
  base: string,
): Promise<{ displayName?: string; email?: string } | null> {
  const r = await fetch(`${base}/api/v1/user`);
  if (!r.ok) return null;
  const d = (await r.json()) as { display_name?: string; email?: string; present?: boolean };
  if (!d.present) return null;
  return { displayName: d.display_name, email: d.email };
}

// ── Sessions (= agents in the new backend) ────────────────────────────────────

/** New agent summary shape (snake_case from /api/v1/agents) */
type NewAgentSummary = {
  id: string;
  working_dir: string;
  mode: string;
  title: string;
  message_count: number;
  last_message: string;
  last_modified: number; // epoch seconds
  is_default: boolean;
};

function agentToSession(a: NewAgentSummary): SessionInfo {
  return {
    sessionId: a.id,
    workingDir: a.working_dir,
    dirName: a.working_dir.split('/').filter(Boolean).pop() ?? a.working_dir,
    messageCount: a.message_count,
    title: a.title || '(empty)',
    lastMessage: a.last_message,
    lastModified: Math.round(a.last_modified * 1000), // seconds → ms
    created: '',
    isDefault: a.is_default,
    mode: a.mode,
  };
}

/**
 * GET /sessions?cwd= → GET /api/v1/agents?cwd=
 * Returns {sessions: SessionInfo[]} — same outer shape, fields translated.
 */
export async function listSessions(
  base: string,
  cwd?: string,
): Promise<{ sessions: SessionInfo[] }> {
  const url = cwd ? `${base}/api/v1/agents?cwd=${encodeURIComponent(cwd)}` : `${base}/api/v1/agents`;
  const d = await jsonGet<{ agents: NewAgentSummary[] }>(url);
  return { sessions: (d.agents ?? []).map(agentToSession) };
}

/**
 * DELETE /sessions/{id} → DELETE /api/v1/agents/{id}
 */
export async function deleteSession(base: string, sessionId: string): Promise<void> {
  return jsonDelete(`${base}/api/v1/agents/${encodeURIComponent(sessionId)}`);
}

/**
 * POST /sessions/{id}/title {title} → PATCH /api/v1/agents/{id} {title}
 */
export async function renameSession(
  base: string,
  sessionId: string,
  title: string,
): Promise<void> {
  await jsonPatch(`${base}/api/v1/agents/${encodeURIComponent(sessionId)}`, { title });
}

/**
 * POST /session-default {cwd, sessionId} → PUT /api/v1/defaults {cwd, agent_id}
 */
export async function setDefaultSession(
  base: string,
  cwd: string,
  sessionId: string,
): Promise<void> {
  await jsonPut(`${base}/api/v1/defaults`, { cwd, agent_id: sessionId });
}

// ── Pool connect (the complex fusion) ─────────────────────────────────────────

/**
 * POST /api/pool/connect {cwd, mode, sessionId?} → [create +] connect + messages
 *
 * The old backend did this in one call; the new backend splits it into three:
 *   1. POST /api/v1/agents {cwd, mode}           — create (when no sessionId)
 *   2. POST /api/v1/agents/{id}/connect {}        — start/attach runtime
 *   3. GET  /api/v1/agents/{id}/messages           — load committed history
 *
 * Returns the old response shape so agent.tsx needs no changes.
 */
export async function connectSession(
  base: string,
  params: { cwd: string; mode: string; sessionId?: string },
): Promise<OldConnectResponse> {
  let id = params.sessionId;

  // 1. Create if no existing sessionId
  if (!id) {
    const created = await jsonPost<{ id: string }>(`${base}/api/v1/agents`, {
      cwd: params.cwd,
      mode: params.mode,
    });
    id = created.id;
  }

  // 2. Connect (start or re-attach the runtime)
  const conn = await jsonPost<{
    id: string;
    cwd: string;
    mode: string;
    runtime_status: string;
    session_mode: string;
    pid: number | null;
    modes: string[];
    commands: Array<{ name: string; description: string; aliases?: string[] }>;
  }>(`${base}/api/v1/agents/${id}/connect`, {});

  // 3. Load committed history (equivalent to the `messages` that used to come from connect)
  let messages: Array<{ role: string; content: unknown; isMeta?: boolean }> = [];
  try {
    const hist = await jsonGet<{ messages: typeof messages }>(
      `${base}/api/v1/agents/${id}/messages`,
    );
    messages = hist.messages ?? [];
  } catch {
    // Non-fatal: agent may have no transcript yet
  }

  // 4. Fuse into the old response shape
  return {
    sessionId: id,
    messages,
    cwd: conn.cwd,
    mode: conn.mode,
    sessionMode: conn.session_mode,
    agentStatus: conn.runtime_status,
    modes: conn.modes ?? [],
    commands: conn.commands ?? [],
  };
}

// ── Home config ───────────────────────────────────────────────────────────────

/**
 * GET /api/home → GET /api/v1/home
 * Returns {home, defaultCwd}.
 */
export async function getHomeConfig(base: string): Promise<{ home?: string; defaultCwd?: string }> {
  try {
    return await jsonGet(`${base}/api/v1/home`);
  } catch {
    return {};
  }
}

// ── SSE stream ────────────────────────────────────────────────────────────────

/**
 * Old: GET /api/pool/{sid}/stream
 * New: GET /api/v1/agents/{id}/events
 * Opens the SSE stream and returns the raw Response for the caller to read.
 */
export async function openEventsStream(
  base: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<Response> {
  const url = `${base}/api/v1/agents/${encodeURIComponent(sessionId)}/events`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new ApiError(r.status, `${r.status} ${r.statusText} — ${url}`);
  return r;
}

/** @deprecated Use openEventsStream directly. Left for any remaining URL-only callers. */
export function sseStreamUrl(base: string, sessionId: string): string {
  return `${base}/api/v1/agents/${encodeURIComponent(sessionId)}/events`;
}

// ── Send message ──────────────────────────────────────────────────────────────

/**
 * Old: POST /api/pool/{sid}/send {…}
 * New: POST /api/v1/agents/{id}/messages {…}
 * Message body format is identical — no field translation needed.
 */
export async function sendMessage(
  base: string,
  sessionId: string,
  body: unknown,
): Promise<void> {
  await jsonPost(`${base}/api/v1/agents/${encodeURIComponent(sessionId)}/messages`, body);
}

// ── Modes / models ────────────────────────────────────────────────────────────

/**
 * GET /agent-modes → GET /api/v1/modes
 * New: {default, modes:[{id,label,icon,description}]}
 * Old ModeSelector reads: {modes: Record<string, ModeConfig>}
 * We reconstruct the old dict shape from the new list.
 */
export async function getAgentModes(
  base: string,
): Promise<{ modes: Record<string, { label: string; icon: string; description: string }> }> {
  const d = await jsonGet<{
    default: string;
    modes: Array<{ id: string; label: string; icon: string; description: string }>;
  }>(`${base}/api/v1/modes`);
  const modes: Record<string, { label: string; icon: string; description: string }> = {};
  for (const m of d.modes ?? []) {
    modes[m.id] = { label: m.label, icon: m.icon, description: m.description };
  }
  return { modes };
}

/**
 * POST /api/classify-mode {message} → POST /api/v1/modes/classify {message}
 * Response shape is identical: {mode}
 */
export async function classifyMode(
  base: string,
  message: string,
): Promise<{ mode: string }> {
  return jsonPost(`${base}/api/v1/modes/classify`, { message });
}

/**
 * GET /api/models?session_id= → GET /api/v1/models?agentId=
 * Response shape is identical: {models, current}
 */
export async function listModels(
  base: string,
  sessionId?: string,
): Promise<{ models: Array<{ id: string; displayName: string }>; current: string }> {
  const qs = sessionId ? `?agentId=${encodeURIComponent(sessionId)}` : '';
  return jsonGet(`${base}/api/v1/models${qs}`);
}

/**
 * GET /api/version → GET /api/v1/version
 * New: {backend}. Old code also reads bzcode/bzcode_latest (returns undefined → ignored).
 */
export async function getVersion(base: string): Promise<{
  backend?: string;
  bzcode?: string | null;
  bzcode_latest?: string | null;
}> {
  return jsonGet(`${base}/api/v1/version`);
}

// ── Credentials (widget secrets) ──────────────────────────────────────────────

/**
 * GET /credentials → GET /api/v1/secrets
 * Old shape: {keys?: string[]}. New shape: {keys: string[]}. Same!
 */
export async function listCredentials(base: string): Promise<{ keys?: string[] }> {
  return jsonGet(`${base}/api/v1/secrets`);
}

/**
 * POST /credentials {key, value} → PUT /api/v1/secrets {key, value}
 */
export async function setCredential(base: string, key: string, value: string): Promise<void> {
  await jsonPut(`${base}/api/v1/secrets`, { key, value });
}

/**
 * DELETE /credentials/{key} → DELETE /api/v1/secrets/{key}
 */
export async function deleteCredential(base: string, key: string): Promise<void> {
  return jsonDelete(`${base}/api/v1/secrets/${encodeURIComponent(key)}`);
}

// ── Files ─────────────────────────────────────────────────────────────────────

type NewFileEntry = {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number;
};

type OldFsEntry = { name: string; path: string; isDir: boolean };

/**
 * GET /files?path= → GET /api/v1/files?path=
 * Old FolderTree shape: Array<{name, path, isDir}>.
 * agent.tsx DirPickerPanel also uses this shape.
 */
export async function listFiles(base: string, path?: string): Promise<OldFsEntry[]> {
  const qs = path ? `?path=${encodeURIComponent(path)}` : '';
  const d = await jsonGet<{ entries: NewFileEntry[] }>(`${base}/api/v1/files${qs}`);
  return (d.entries ?? []).map(e => ({ name: e.name, path: e.path, isDir: e.is_dir }));
}

/**
 * GET /api/file?path= → GET /api/v1/files/content?path=
 * Returns {content: string}.
 */
export async function readFile(base: string, path: string): Promise<{ content: string }> {
  return jsonGet(`${base}/api/v1/files/content?path=${encodeURIComponent(path)}`);
}

/**
 * PUT /api/file {path, content} → PUT /api/v1/files {path, content}
 * Returns the raw Response so callers can check .ok.
 */
export async function writeFile(
  base: string,
  path: string,
  content: string,
): Promise<Response> {
  return fetch(`${base}/api/v1/files`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
}

/**
 * DELETE /api/file?path= → DELETE /api/v1/files?path=
 */
export async function deleteFile(base: string, path: string): Promise<Response> {
  return fetch(`${base}/api/v1/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
}

/**
 * POST /files/mkdir {parent, name} → POST /api/v1/files/mkdir {parent, name}
 * Returns {path: string}.
 */
export async function makeDir(
  base: string,
  parent: string,
  name: string,
): Promise<{ path: string }> {
  return jsonPost(`${base}/api/v1/files/mkdir`, { parent, name });
}

/**
 * POST /api/file/rename {path, newName} → POST /api/v1/files/rename {path, new_name}
 */
export async function renameFile(
  base: string,
  path: string,
  newName: string,
): Promise<{ path: string }> {
  return jsonPost(`${base}/api/v1/files/rename`, { path, new_name: newName });
}

/**
 * POST /api/file/duplicate {path} → POST /api/v1/files/duplicate {path}
 */
export async function duplicateFile(base: string, path: string): Promise<{ path: string }> {
  return jsonPost(`${base}/api/v1/files/duplicate`, { path });
}

/**
 * POST /api/file/upload (FormData) → POST /api/v1/files/upload (FormData)
 * Passes FormData through unchanged (path rewire only).
 */
export function uploadFileUrl(base: string): string {
  return `${base}/api/v1/files/upload`;
}

/**
 * GET /api/file/download?path= → GET /api/v1/files/download?path=
 * Anchor href — just return the new URL string.
 */
export function downloadFileUrl(base: string, path: string): string {
  return `${base}/api/v1/files/download?path=${encodeURIComponent(path)}`;
}

/**
 * GET /api/file/view?path= → GET /api/v1/files/view?path=
 * Iframe src — just return the new URL string.
 */
export function viewFileUrl(base: string, path: string): string {
  return `${base}/api/v1/files/view?path=${encodeURIComponent(path)}`;
}

// ── Settings ──────────────────────────────────────────────────────────────────

/**
 * GET /settings/resources → GET /api/v1/settings/resources
 */
export async function getResources(base: string): Promise<unknown> {
  return jsonGet(`${base}/api/v1/settings/resources`);
}

/**
 * DELETE /settings/sessions/clear → DELETE /api/v1/settings/sessions/clear
 */
export async function clearSessions(
  base: string,
  olderThanDays?: number,
): Promise<{ deleted: number }> {
  const qs = olderThanDays !== undefined ? `?olderThanDays=${olderThanDays}` : '';
  const r = await fetch(`${base}/api/v1/settings/sessions/clear${qs}`, { method: 'DELETE' });
  if (!r.ok) throw new ApiError(r.status, `${r.status} ${r.statusText}`);
  return r.json() as Promise<{ deleted: number }>;
}

/**
 * GET /api/server/log?lines= → GET /api/v1/settings/log?lines=
 */
export async function getServerLog(base: string, lines?: number): Promise<unknown> {
  const qs = lines !== undefined ? `?lines=${lines}` : '';
  return jsonGet(`${base}/api/v1/settings/log${qs}`);
}
