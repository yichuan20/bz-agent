import { parseMarkdownToHTML } from '@boltzbit/md-utils';
import { IframeWidget } from '#/components/IframeWidget';
import { WIDGET_REGISTRY, REGISTRY_MAP, type WidgetKind } from '#/lib/widgetRegistry';
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  CaretDownIcon,
  ChartBarIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  CloudArrowDownIcon,
  CloudArrowUpIcon,
  LightningIcon,
  ListChecksIcon,
  PaperclipIcon,
  PlusIcon,
  SparkleIcon,
  SquaresFourIcon,
  SpinnerIcon,
  SquareIcon,
  TrashIcon,
  TerminalIcon,
  WarningCircleIcon,
  XCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const Route = createFileRoute('/_app/agent')({
  component: AgentPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionMode = 'default' | 'plan' | 'yolo';
type AssistantBlock = { type: 'text' | 'thinking'; text: string };
type Attachment = { name: string; mediaType: string; data: string };

type PushStep = 'build' | 'archive' | 'upload' | 'deploy' | 'publish' | 'done' | 'error';
type SyncStep = 'download' | 'extract' | 'install' | 'done' | 'error';

type DisplayItem =
  | { id: string; kind: 'user'; text: string; attachments?: Attachment[] }
  | { id: string; kind: 'assistant'; blocks: AssistantBlock[] }
  | { id: string; kind: 'tool'; toolUseId: string; name: string; status: 'running' | 'done' | 'error'; input: unknown; output?: string; isError?: boolean }
  | { id: string; kind: 'push-progress'; step: PushStep; message: string; serviceUrl?: string; appId?: string }
  | { id: string; kind: 'sync-progress'; step: SyncStep; message: string };

type BzHubModal =
  | { type: 'create-app'; cwd: string }
  | { type: 'release-notes'; cwd: string; appId: string; appName: string }
  | { type: 'sync'; cwd: string }
  | { type: 'token-usage'; period: string; summary?: { inputTokens: number; outputTokens: number; totalTokensConsumed: number; totalCost: number }; trends?: { date: string; tokensConsumed: number }[] };

type PermissionPrompt = {
  requestId: string;
  tool: string;
  input: unknown;
};

type InputPromptData = {
  requestId: string;
  message: string;
  questions: Question[];
};

type Question = {
  question: string;
  options: { label: string; description: string }[];
  multi_select?: boolean;
};

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  bzTokens?: number;
};

type SlashCommand = {
  id: string;
  label: string;
  description: string;
  iconType: 'sparkle' | 'cloud-up' | 'cloud-down' | 'chart' | 'terminal';
  iconColor: string;
  action: () => void;
};
type SlashCommandGroup = { title: string; commands: SlashCommand[] };

type StreamingBlocks = Map<number, { type: string; content: string }>;
type ConnectionStatus = 'connecting' | 'connected' | 'error' | 'disconnected';

const WS_BASE   = (import.meta.env.VITE_AGENT_WS_URL   as string | undefined) ?? 'ws://localhost:8765';
const HTTP_BASE  = (import.meta.env.VITE_AGENT_HTTP_URL  as string | undefined) ?? 'http://localhost:8766';

const MODE_META: Record<SessionMode, { label: string; description: string; color: string }> = {
  default: { label: 'Default', description: 'Normal operation', color: 'var(--accent-blue)' },
  plan:    { label: 'Plan',    description: 'Read-only planning mode', color: '#e67e22' },
  yolo:    { label: 'YOLO',   description: 'Auto-allow all tools', color: '#e74c3c' },
};

// ── BoltzBit logo (blue theme, 10 paths, matches VSCode plugin) ──────────────

function BoltzbitLogo({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 790 790"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
      style={{ color: 'var(--accent-blue)' }}
    >
      <path d="M283.442 0H184.313C171.645 0 161.375 10.2697 161.375 22.9381V122.067C161.375 134.735 171.645 145.005 184.313 145.005H283.442C296.11 145.005 306.38 134.735 306.38 122.067V22.9381C306.38 10.2697 296.11 0 283.442 0Z" fill="currentColor"/>
      <path d="M283.442 161.375H184.313C171.645 161.375 161.375 171.645 161.375 184.313V283.442C161.375 296.11 171.645 306.38 184.313 306.38H283.442C296.11 306.38 306.38 296.11 306.38 283.442V184.313C306.38 171.645 296.11 161.375 283.442 161.375Z" fill="currentColor"/>
      <path d="M444.918 161.375H345.789C333.121 161.375 322.851 171.645 322.851 184.313V283.442C322.851 296.11 333.121 306.38 345.789 306.38H444.918C457.586 306.38 467.856 296.11 467.856 283.442V184.313C467.856 171.645 457.586 161.375 444.918 161.375Z" fill="currentColor"/>
      <path d="M606.293 161.375H507.164C494.496 161.375 484.226 171.645 484.226 184.313V283.442C484.226 296.11 494.496 306.38 507.164 306.38H606.293C618.961 306.38 629.231 296.11 629.231 283.442V184.313C629.231 171.645 618.961 161.375 606.293 161.375Z" fill="currentColor"/>
      <path d="M122.067 322.75H22.9381C10.2697 322.75 0 333.02 0 345.688V444.817C0 457.485 10.2697 467.755 22.9381 467.755H122.067C134.735 467.755 145.005 457.485 145.005 444.817V345.688C145.005 333.02 134.735 322.75 122.067 322.75Z" fill="currentColor"/>
      <path d="M283.442 322.75H184.313C171.645 322.75 161.375 333.02 161.375 345.688V444.817C161.375 457.485 171.645 467.755 184.313 467.755H283.442C296.11 467.755 306.38 457.485 306.38 444.817V345.688C306.38 333.02 296.11 322.75 283.442 322.75Z" fill="currentColor"/>
      <path d="M606.293 322.75H507.164C494.496 322.75 484.226 333.02 484.226 345.688V444.817C484.226 457.485 494.496 467.755 507.164 467.755H606.293C618.961 467.755 629.231 457.485 629.231 444.817V345.688C629.231 333.02 618.961 322.75 606.293 322.75Z" fill="currentColor"/>
      <path d="M767.062 322.75H667.933C655.265 322.75 644.995 333.02 644.995 345.688V444.817C644.995 457.485 655.265 467.755 667.933 467.755H767.062C779.73 467.755 790 457.485 790 444.817V345.688C790 333.02 779.73 322.75 767.062 322.75Z" fill="currentColor"/>
      <path d="M283.442 484.226H184.313C171.645 484.226 161.375 494.496 161.375 507.164V606.293C161.375 618.962 171.645 629.231 184.313 629.231H283.442C296.11 629.231 306.38 618.962 306.38 606.293V507.164C306.38 494.496 296.11 484.226 283.442 484.226Z" fill="currentColor"/>
      <path d="M444.918 484.226H345.789C333.121 484.226 322.851 494.496 322.851 507.164V606.293C322.851 618.962 333.121 629.231 345.789 629.231H444.918C457.586 629.231 467.856 618.962 467.856 606.293V507.164C467.856 494.496 457.586 484.226 444.918 484.226Z" fill="currentColor"/>
      <path d="M606.293 484.226H507.164C494.496 484.226 484.226 494.496 484.226 507.164V606.293C484.226 618.962 494.496 629.231 507.164 629.231H606.293C618.961 629.231 629.231 618.962 629.231 606.293V507.164C629.231 494.496 618.961 484.226 606.293 484.226Z" fill="currentColor"/>
      <path d="M444.918 644.995H345.789C333.121 644.995 322.851 655.265 322.851 667.933V767.062C322.851 779.73 333.121 790 345.789 790H444.918C457.586 790 467.856 779.73 467.856 767.062V667.933C467.856 655.265 457.586 644.995 444.918 644.995Z" fill="currentColor"/>
    </svg>
  );
}

// ── SVG icons (matching bzcode VSCode plugin) ─────────────────────────────────

function BlockDot({ size = 10 }: { size?: number }) {
  const gap = Math.round(size * 0.18);
  const cell = Math.floor((size - gap) / 2);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden>
      <rect x={0}          y={0}          width={cell} height={cell} rx={1} fill="currentColor" />
      <rect x={cell + gap} y={0}          width={cell} height={cell} rx={1} fill="currentColor" />
      <rect x={0}          y={cell + gap} width={cell} height={cell} rx={1} fill="currentColor" />
      <rect x={cell + gap} y={cell + gap} width={cell} height={cell} rx={1} fill="currentColor" />
    </svg>
  );
}

function TriangleCubes({ className }: { className?: string }) {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden className={className}>
      <rect x="0" y="0" width="4" height="4" rx="0.8" fill="currentColor" />
      <rect x="0" y="5" width="4" height="4" rx="0.8" fill="currentColor" />
      <rect x="5" y="2.5" width="4" height="4" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function SlashIcon({ type, color }: { type: SlashCommand['iconType']; color: string }) {
  const props = { size: 15, color } as const;
  switch (type) {
    case 'sparkle':   return <SparkleIcon       {...props} weight="fill" />;
    case 'cloud-up':  return <CloudArrowUpIcon   {...props} />;
    case 'cloud-down':return <CloudArrowDownIcon {...props} />;
    case 'chart':     return <ChartBarIcon       {...props} />;
    case 'terminal':  return <TerminalIcon       {...props} />;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2); }

function streamingToBlocks(map: StreamingBlocks): AssistantBlock[] {
  const result: AssistantBlock[] = [];
  for (const [, b] of [...map.entries()].sort(([a], [c]) => a - c)) {
    if ((b.type === 'text' || b.type === 'thinking') && b.content) {
      result.push({ type: b.type, text: b.content });
    }
  }
  return result;
}

function bzBlocksToAssistantBlocks(content: unknown[]): AssistantBlock[] {
  const result: AssistantBlock[] = [];
  for (const b of content as Array<{ type: string; text?: string; thinking?: string }>) {
    if (b.type === 'text' && b.text) result.push({ type: 'text', text: b.text });
    else if (b.type === 'thinking' && b.thinking) result.push({ type: 'thinking', text: b.thinking });
  }
  return result;
}

function formatNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Command list output parser (handles /help, /skills, and similar outputs) ──

type CommandEntry = { name: string; description: string; isSkill: boolean; aliases?: string[] };
type CommandListResult = { kind: string; entries: CommandEntry[] };

function parseCommandListOutput(text: string): CommandListResult | null {
  const trimmed = text.trim();
  // Match header: "Available commands:" or "Available skills:"
  const headerMatch = trimmed.match(/^Available ([\w\s]+):\s*\n/i);
  if (!headerMatch) return null;
  const kind = headerMatch[1]!.toLowerCase(); // "commands" | "skills"
  const rest = trimmed.slice(headerMatch[0].length);
  const entries: CommandEntry[] = [];

  for (const line of rest.split('\n')) {
    // Format: "  /name [(alias1, alias2)] — description [(/path)]"
    const m = line.match(/^\s+\/([\w-]+)(?:\s+\(([^)]+)\))?\s+—\s+(.+)$/);
    if (!m) continue;
    const name = m[1]!;
    const aliasRaw = m[2];
    let description = m[3]!.trim();

    // Strip trailing "(/some/path)" from skills
    description = description.replace(/\s*\([^)]*\/[^)]*\)\s*$/, '').trim();
    const isSkill = description.startsWith('(skill)');
    if (isSkill) description = description.slice('(skill)'.length).trim();

    const aliases = aliasRaw ? aliasRaw.split(',').map(a => a.trim()) : undefined;
    entries.push({ name, description, isSkill, aliases });
  }

  return entries.length > 0 ? { kind, entries } : null;
}

// ── BoltzHub push/sync progress bar ──────────────────────────────────────────

// Push progress — Boltzbit cube-grid style
const PUSH_CUBE_STEPS = [
  { id: 'build'   as PushStep, label: 'Build',   color: '#60a5fa' },
  { id: 'archive' as PushStep, label: 'Archive', color: '#818cf8' },
  { id: 'upload'  as PushStep, label: 'Upload',  color: '#a78bfa' },
  { id: 'deploy'  as PushStep, label: 'Deploy',  color: '#f59e0b' },
  { id: 'publish' as PushStep, label: 'Publish', color: '#34d399' },
] as const;

// Render enough cubes to always overflow — CSS auto-fill + overflow:hidden trims to exactly 2 rows
const CUBE_POOL = 40;

function PushCubeGrid({ color, state }: { color: string; state: 'pending' | 'active' | 'done' | 'error' }) {
  const fill = state === 'error' ? 'var(--accent-red)' : state !== 'pending' ? color : undefined;
  return (
    <div className="bzhub-cube-grid">
      {Array.from({ length: CUBE_POOL }).map((_, i) => (
        <div key={i} className={`bzhub-cube${state === 'active' ? ' bzhub-cube--active' : ''}`}
          style={fill ? { background: fill } : undefined} />
      ))}
    </div>
  );
}

function PushProgressCard({ item }: { item: Extract<DisplayItem, { kind: 'push-progress' }> }) {
  const isDone  = item.step === 'done';
  const isError = item.step === 'error';
  const currentIdx = PUSH_CUBE_STEPS.findIndex(s => s.id === item.step);
  const label = isError ? `Push failed — ${item.message}` : isDone ? 'Push: Published' : `Push: ${item.message}`;

  return (
    <div className="agent-msg-row">
      <span className="agent-block-icon"><BoltzbitLogo size={10} /></span>
      <div className="bzhub-progress-card">
        <div className="bzhub-progress-label">{label}</div>
        <div className="bzhub-cube-steps">
          {PUSH_CUBE_STEPS.map((step, i) => {
            const state = isError && i === currentIdx ? 'error'
                        : isDone || i < currentIdx    ? 'done'
                        : !isDone && i === currentIdx ? 'active'
                        : 'pending';
            return (
              <div key={step.id} className="bzhub-cube-step">
                <PushCubeGrid color={step.color} state={state} />
                <span className="bzhub-cube-label" style={state !== 'pending' ? { color: step.color } : undefined}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
        {isDone && item.serviceUrl && (
          <div className="bzhub-done-row">
            <a className="bzhub-done-btn" href={item.serviceUrl} target="_blank" rel="noopener noreferrer">
              <ArrowSquareOutIcon size={13} />
              Review app
            </a>
            {item.appId && (
              <button type="button" className="bzhub-done-btn bzhub-done-btn--publish"
                onClick={() => {
                  fetch(`${AGENT_HTTP_BASE}/boltzhub/publish`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ appId: item.appId }),
                  }).catch(() => null);
                }}>
                <CloudArrowUpIcon size={13} />
                Publish app
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const SYNC_STEPS_ORDERED: SyncStep[] = ['download', 'extract', 'install'];

function SyncProgressCard({ item }: { item: Extract<DisplayItem, { kind: 'sync-progress' }> }) {
  const isDone  = item.step === 'done';
  const isError = item.step === 'error';
  const currentIdx = SYNC_STEPS_ORDERED.indexOf(item.step as typeof SYNC_STEPS_ORDERED[number]);
  const barColor = isDone ? 'var(--accent-green)' : isError ? 'var(--accent-red)' : 'var(--accent-blue)';
  const label = isError ? `Sync: Failed — ${item.message}` : isDone ? item.message : `Sync: ${item.message}`;

  return (
    <div className="agent-msg-row">
      <span className="agent-block-icon"><BoltzbitLogo size={10} /></span>
      <div className="bzhub-progress-card">
        <div className="bzhub-progress-label">{label}</div>
        <div className="bzhub-progress-bar">
          {SYNC_STEPS_ORDERED.map((s, j) => {
            const done    = isDone ? true : j < currentIdx;
            const current = !isDone && !isError && j === currentIdx;
            return (
              <div key={s} className={`bzhub-progress-seg${done ? ' bzhub-progress-seg--done' : current ? ' bzhub-progress-seg--cur' : ''}`}
                style={done || current ? { background: barColor } : undefined} />
            );
          })}
        </div>
        <div className="bzhub-progress-steps">
          {SYNC_STEPS_ORDERED.map((s, j) => {
            const done    = isDone ? true : j < currentIdx;
            const current = !isDone && !isError && j === currentIdx;
            return (
              <span key={s} className={`bzhub-progress-step-label${done ? ' bzhub-progress-step-label--done' : current ? ' bzhub-progress-step-label--cur' : ''}`}
                style={done || current ? { color: barColor } : undefined}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── BoltzHub modals ───────────────────────────────────────────────────────────

function CreateAppModal({ cwd, agentHttp, onClose, onCreated }: {
  cwd: string; agentHttp: string;
  onClose: () => void;
  onCreated: (cfg: { id: string; name: string }) => void;
}) {
  const [name,       setName]       = useState('My App');
  const [desc,       setDesc]       = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [buildCmd,   setBuildCmd]   = useState('');
  const [showAdv,    setShowAdv]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  async function handleSubmit() {
    if (!name.trim()) return;
    setSaving(true); setError('');
    try {
      const r = await fetch(`${agentHttp}/boltzhub/create-app`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, name: name.trim(), description: desc.trim() || undefined, visibility, buildCommand: buildCmd.trim() || undefined }),
      });
      const d = await r.json() as { ok?: boolean; appConfig?: { id: string; name: string }; error?: string };
      if (!r.ok || !d.ok) { setError(d.error ?? 'Failed to create app'); setSaving(false); return; }
      onCreated(d.appConfig!);
    } catch (e) { setError(String(e)); setSaving(false); }
  }

  return (
    <div className="bzhub-modal-overlay" onClick={onClose}>
      <div className="bzhub-modal" onClick={e => e.stopPropagation()}>
        <div className="bzhub-modal-header">
          <BoltzbitLogo size={16} />
          <span className="bzhub-modal-title">Create App</span>
          <button type="button" className="canvas-widget-close" onClick={onClose}><XIcon size={13} /></button>
        </div>
        <p className="bzhub-modal-hint">No .bzhub config found. Set up your app to push to BoltzHub.</p>

        <label className="bzhub-form-label">Name *
          <input className="bzhub-form-input" value={name} onChange={e => setName(e.target.value)} placeholder="My App" autoFocus />
        </label>
        <label className="bzhub-form-label">Description
          <textarea className="bzhub-form-textarea" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What does your app do?" rows={3} />
        </label>

        <div className="bzhub-visibility-row">
          <span className="bzhub-form-label" style={{ marginBottom: 0 }}>Visibility</span>
          <div className="bzhub-visibility-toggle">
            <button type="button" className={`bzhub-vis-btn${visibility === 'private' ? ' bzhub-vis-btn--active' : ''}`} onClick={() => setVisibility('private')}>Private</button>
            <button type="button" className={`bzhub-vis-btn${visibility === 'public' ? ' bzhub-vis-btn--active' : ''}`} onClick={() => setVisibility('public')}>Public</button>
          </div>
        </div>

        <button type="button" className="bzhub-adv-toggle" onClick={() => setShowAdv(v => !v)}>
          ▶ Advanced options {showAdv ? '▲' : '▼'}
        </button>
        {showAdv && (
          <label className="bzhub-form-label">Build command
            <input className="bzhub-form-input" value={buildCmd} onChange={e => setBuildCmd(e.target.value)} placeholder="pnpm build" />
          </label>
        )}

        {error && <p className="bzhub-modal-error">{error}</p>}

        <div className="bzhub-modal-actions">
          <button type="button" className="bzhub-btn bzhub-btn--primary" onClick={() => void handleSubmit()} disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : 'Create & Push'}
          </button>
          <button type="button" className="bzhub-btn" onClick={onClose}>Cancel</button>
        </div>
        <p className="bzhub-modal-esc">Esc to cancel</p>
      </div>
    </div>
  );
}

function ReleaseNotesModal({ appName, appId, onClose, onPush }: {
  appName: string;
  appId: string;
  onClose: () => void;
  onPush: (notes?: string, version?: string) => void;
}) {
  const [stage,     setStage]     = useState<'choice' | 'write'>('choice');
  const [notes,     setNotes]     = useState('');
  const [version,   setVersion]   = useState('');
  const [versions,  setVersions]  = useState<{ versionNumber: string }[]>([]);
  const agentHttp = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:5081';

  useEffect(() => {
    fetch(`${agentHttp}/boltzhub/versions?appId=${encodeURIComponent(appId)}`)
      .then(r => r.json())
      .then((d: { versions?: { versionNumber: string }[]; suggestedNext?: string }) => {
        setVersions(d.versions ?? []);
        if (d.suggestedNext) setVersion(d.suggestedNext);
      })
      .catch(() => {});
  }, [appId, agentHttp]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (stage === 'choice') {
        if (e.key === '1') setStage('write');
        if (e.key === '2') onPush();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, stage, onPush]);

  return (
    <div className="bzhub-modal-overlay" onClick={onClose}>
      <div className="bzhub-modal" onClick={e => e.stopPropagation()}>
        <div className="bzhub-modal-header">
          <CloudArrowUpIcon size={16} color="var(--accent-blue)" />
          <span className="bzhub-modal-title">Push to BoltzHub</span>
          <button type="button" className="canvas-widget-close" onClick={onClose}><XIcon size={13} /></button>
        </div>
        <p className="bzhub-modal-hint">Would you like to add release notes to this version?</p>

        {stage === 'choice' ? (
          <>
            <div className="bzhub-choice-list">
              <button type="button" className="bzhub-choice-item" onClick={() => setStage('write')}>
                <span className="bzhub-choice-num">1</span><span>Write my own</span>
              </button>
              <button type="button" className="bzhub-choice-item" onClick={() => onPush()}>
                <span className="bzhub-choice-num">2</span><span>Skip and push</span>
              </button>
            </div>

            {versions.length > 0 && (
              <div className="bzhub-version-history">
                <div className="bzhub-version-history-label">Previous Releases</div>
                {versions.map(v => (
                  <div key={v.versionNumber} className="bzhub-version-tag">{v.versionNumber}</div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <label className="bzhub-form-label">Release notes
              <textarea className="bzhub-form-textarea" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="What changed in this version?" rows={4} autoFocus />
            </label>
            <label className="bzhub-form-label" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              Version
              <input className="bzhub-form-input" style={{ flex: 1 }} value={version}
                onChange={e => setVersion(e.target.value)} placeholder="1.0.0" />
            </label>
            <div className="bzhub-modal-actions">
              <button type="button" className="bzhub-btn bzhub-btn--primary"
                onClick={() => onPush(notes || undefined, version || undefined)}>Push</button>
              <button type="button" className="bzhub-btn" onClick={() => setStage('choice')}>Back</button>
            </div>
          </>
        )}

        <p className="bzhub-modal-esc">1–2 to select · Enter to confirm · Esc to cancel</p>
      </div>
    </div>
  );
}

function SyncModal({ agentHttp, onClose, onSync }: {
  agentHttp: string;
  onClose: () => void;
  onSync: (appId?: string) => void;
}) {
  const [stage,   setStage]   = useState<'choice' | 'enter-id' | 'fetching' | 'select'>('choice');
  const [appId,   setAppId]   = useState('');
  const [apps,    setApps]    = useState<{ id: string; name: string }[]>([]);
  const [error,   setError]   = useState('');

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function fetchApps() {
    setStage('fetching'); setError('');
    try {
      const r = await fetch(`${agentHttp}/boltzhub/apps`);
      const d = await r.json() as { apps?: { id: string; name: string }[]; error?: string } | { id: string; name: string }[];
      const list = Array.isArray(d) ? d : (d as { apps?: { id: string; name: string }[] }).apps ?? [];
      setApps(list);
      setStage('select');
    } catch (e) { setError(String(e)); setStage('choice'); }
  }

  return (
    <div className="bzhub-modal-overlay" onClick={onClose}>
      <div className="bzhub-modal" onClick={e => e.stopPropagation()}>
        <div className="bzhub-modal-header">
          <CloudArrowDownIcon size={16} color="var(--accent-blue)" />
          <span className="bzhub-modal-title">Sync project</span>
          <button type="button" className="canvas-widget-close" onClick={onClose}><XIcon size={13} /></button>
        </div>

        {stage === 'choice' && (
          <div className="bzhub-choice-list">
            <button type="button" className="bzhub-choice-item" onClick={() => onSync()}>
              <span className="bzhub-choice-num">1</span><span>Sync current app</span>
            </button>
            <button type="button" className="bzhub-choice-item" onClick={() => setStage('enter-id')}>
              <span className="bzhub-choice-num">2</span><span>Enter app ID</span>
            </button>
            <button type="button" className="bzhub-choice-item" onClick={() => void fetchApps()}>
              <span className="bzhub-choice-num">3</span><span>Fetch my apps from BoltzHub</span>
            </button>
          </div>
        )}

        {stage === 'enter-id' && (
          <>
            <label className="bzhub-form-label">App ID
              <input className="bzhub-form-input" value={appId} onChange={e => setAppId(e.target.value)}
                placeholder="app_xxxxxxxx" autoFocus onKeyDown={e => e.key === 'Enter' && appId.trim() && onSync(appId.trim())} />
            </label>
            <div className="bzhub-modal-actions">
              <button type="button" className="bzhub-btn bzhub-btn--primary" onClick={() => onSync(appId.trim())} disabled={!appId.trim()}>Sync</button>
              <button type="button" className="bzhub-btn" onClick={() => setStage('choice')}>Back</button>
            </div>
          </>
        )}

        {stage === 'fetching' && <p className="bzhub-modal-hint">Fetching apps…</p>}

        {stage === 'select' && (
          <div className="bzhub-choice-list">
            {apps.length === 0 && <p className="bzhub-modal-hint">No apps found.</p>}
            {apps.map(app => (
              <button key={app.id} type="button" className="bzhub-choice-item" onClick={() => onSync(app.id)}>
                <span className="bzhub-choice-num bzhub-choice-num--dot" />
                <span>{app.name} <span style={{ opacity: 0.5, fontSize: 11 }}>{app.id}</span></span>
              </button>
            ))}
          </div>
        )}

        {error && <p className="bzhub-modal-error">{error}</p>}
        <p className="bzhub-modal-esc">Esc to cancel</p>
      </div>
    </div>
  );
}

function TokenUsageModal({ data, onClose }: {
  data: Extract<BzHubModal, { type: 'token-usage' }>;
  onClose: () => void;
}) {
  const PERIODS = [{ id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: '90d', label: '90 days' }, { id: '1y', label: '1 year' }];
  const [period, setPeriod] = useState(data.period);
  const [loading, setLoading] = useState(!data.summary);
  const [summary, setSummary] = useState(data.summary);
  const [trends,  setTrends]  = useState(data.trends ?? []);
  const [error,   setError]   = useState('');
  const agentHttp = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:5081';

  async function fetchUsage(p: string) {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${agentHttp}/boltzhub/token-usage?period=${p}`);
      const d = await r.json() as { summary?: typeof summary; trends?: typeof trends; error?: string };
      if (!r.ok) { setError(d.error ?? 'Failed to fetch'); return; }
      setSummary(d.summary); setTrends(d.trends ?? []);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void fetchUsage(period); }, [period]);

  const recentTrends = trends.slice(-7);
  const maxTokens = Math.max(...recentTrends.map(t => t.tokensConsumed), 1);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="bzhub-modal-overlay" onClick={onClose}>
      <div className="bzhub-modal" onClick={e => e.stopPropagation()}>
        <div className="bzhub-modal-header">
          <ChartBarIcon size={16} color="#a78bfa" />
          <span className="bzhub-modal-title">Token Usage</span>
          <button type="button" className="canvas-widget-close" onClick={onClose}><XIcon size={13} /></button>
        </div>

        <div className="bzhub-period-row">
          {PERIODS.map(p => (
            <button key={p.id} type="button"
              className={`bzhub-period-btn${period === p.id ? ' bzhub-period-btn--active' : ''}`}
              onClick={() => setPeriod(p.id)}>{p.label}</button>
          ))}
        </div>

        {loading && <p className="bzhub-modal-hint">Loading…</p>}
        {error   && <p className="bzhub-modal-error">{error}</p>}
        {!loading && summary && (
          <>
            <div className="bzhub-usage-grid">
              <div><span className="bzhub-usage-key">Total</span><span className="bzhub-usage-val">{summary.totalTokensConsumed.toLocaleString()}</span></div>
              <div><span className="bzhub-usage-key">Input</span><span className="bzhub-usage-val">{summary.inputTokens.toLocaleString()}</span></div>
              <div><span className="bzhub-usage-key">Output</span><span className="bzhub-usage-val">{summary.outputTokens.toLocaleString()}</span></div>
            </div>
            {summary.totalCost > 0 && (
              <p className="bzhub-usage-cost">Estimated cost: <strong>${summary.totalCost.toFixed(4)}</strong></p>
            )}
            {recentTrends.length > 0 && (
              <div className="bzhub-trend">
                <div className="bzhub-trend-label">Daily (last {recentTrends.length} days)</div>
                <div className="bzhub-trend-bars">
                  {recentTrends.map(t => (
                    <div key={t.date} className="bzhub-trend-bar-col" title={`${t.date}: ${t.tokensConsumed.toLocaleString()}`}>
                      <div className="bzhub-trend-bar" style={{ height: `${Math.max(2, Math.round((t.tokensConsumed / maxTokens) * 48))}px` }} />
                    </div>
                  ))}
                </div>
                <div className="bzhub-trend-dates">
                  <span>{recentTrends[0]?.date?.slice(5)}</span>
                  <span>{recentTrends[recentTrends.length - 1]?.date?.slice(5)}</span>
                </div>
              </div>
            )}
          </>
        )}

        <div className="bzhub-modal-actions">
          <button type="button" className="bzhub-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CommandListDisplay({ result }: { result: CommandListResult }) {
  const label = result.kind === 'skills' ? 'Available Skills' : 'Available Commands';
  return (
    <div className="skills-result">
      <div className="skills-result-header">{label} {result.entries.length}</div>
      <div className="skills-result-list">
        {result.entries.map(e => (
          <div key={e.name} className="skills-card">
            <div className="skills-card-name" style={e.isSkill ? { color: '#a78bfa' } : undefined}>
              /{e.name}
              {e.aliases?.map(a => (
                <span key={a} className="skills-card-alias">{a}</span>
              ))}
            </div>
            <div className="skills-card-desc">{e.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CollapsibleOutput({ text, isError }: { text: string; isError?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split('\n');
  const PREVIEW = 4;
  const shown = expanded ? lines : lines.slice(0, PREVIEW);
  const hidden = lines.length - PREVIEW;

  return (
    <div>
      <pre className={`agent-inout-pre${isError ? ' agent-inout-pre--err' : ''}`}>
        {shown.join('\n')}
        {!expanded && hidden > 0 && <span className="agent-inout-ellipsis">…</span>}
      </pre>
      {hidden > 0 && (
        <button
          type="button"
          className="agent-inout-toggle"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? '▲ Show less' : `▼ Show ${hidden} more line${hidden === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}

function ToolCard({ item }: { item: Extract<DisplayItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(true);

  const inputStr = item.input == null
    ? ''
    : typeof item.input === 'object'
    ? Object.entries(item.input as Record<string, string>)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : String(item.input);

  const statusIcon = {
    running: <SpinnerIcon size={11} className="agent-tool-spin" />,
    done:    item.isError
               ? <XCircleIcon size={11} weight="fill" color="var(--accent-red)" />
               : <CheckCircleIcon size={11} weight="fill" color="var(--accent-green)" />,
    error:   <WarningCircleIcon size={11} weight="fill" color="var(--accent-red)" />,
  }[item.status];

  return (
    <div className="agent-msg-row">
      {/* Left column: BlockDot icon */}
      <span className="agent-block-icon agent-block-icon--tool"><BlockDot size={10} /></span>

      {/* Right column: header + IN/OUT card */}
      <div className="agent-tool-content">
        <button type="button" className="agent-tool-name-row" onClick={() => setOpen(o => !o)}>
          <TerminalIcon size={11} weight="bold" />
          <span className="agent-tool-name">{item.name}</span>
          <span className="agent-tool-status-icon">{statusIcon}</span>
          <CaretDownIcon size={10} className={`agent-tool-caret${open ? ' agent-tool-caret--open' : ''}`} />
        </button>

        {open && (
          <div className="agent-inout-card">
            {/* IN row */}
            <div className="agent-inout-row agent-inout-row--in">
              <span className="agent-inout-badge agent-inout-badge--in">IN</span>
              <pre className="agent-inout-content">{inputStr || '(no input)'}</pre>
            </div>

            {/* OUT row */}
            {(item.output !== undefined || item.status === 'running') && (
              <div className="agent-inout-row agent-inout-row--out">
                <span className="agent-inout-badge agent-inout-badge--out">OUT</span>
                {item.status === 'running'
                  ? <span className="agent-inout-running">running…</span>
                  : <CollapsibleOutput text={item.output ?? ''} isError={item.isError} />
                }
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PermissionCard({
  prompt,
  mode,
  onRespond,
  onDismiss,
}: {
  prompt: PermissionPrompt;
  mode: SessionMode;
  onRespond: (requestId: string, behavior: 'allow' | 'deny' | 'always') => void;
  onDismiss: () => void;
}) {
  const inputStr = prompt.input == null
    ? ''
    : typeof prompt.input === 'object'
    ? Object.values(prompt.input as Record<string, string>).join(' ')
    : String(prompt.input);

  return (
    <div className="agent-prompt-card animate-slide-in" style={{ '--mode-color': MODE_META[mode].color } as React.CSSProperties}>
      <div className="agent-prompt-card-header">
        <TerminalIcon size={13} weight="bold" />
        <span>Allow <strong>{prompt.tool}</strong> to run?</span>
        <button type="button" className="agent-prompt-dismiss" onClick={onDismiss} aria-label="Dismiss">
          <XIcon size={12} />
        </button>
      </div>
      {inputStr && <pre className="agent-prompt-pre">{inputStr}</pre>}
      <div className="agent-prompt-actions">
        <button type="button" className="agent-prompt-btn agent-prompt-btn--allow"
          style={{ background: MODE_META[mode].color }}
          onClick={() => onRespond(prompt.requestId, 'allow')}>
          Allow once
        </button>
        <button type="button" className="agent-prompt-btn agent-prompt-btn--always"
          onClick={() => onRespond(prompt.requestId, 'always')}>
          Always allow
        </button>
        <button type="button" className="agent-prompt-btn agent-prompt-btn--deny"
          onClick={() => onRespond(prompt.requestId, 'deny')}>
          Deny
        </button>
      </div>
    </div>
  );
}

function InputPromptCard({
  prompt,
  mode,
  onAnswer,
  onDismiss,
}: {
  prompt: InputPromptData;
  mode: SessionMode;
  onAnswer: (requestId: string, answers: Record<string, string>) => void;
  onDismiss: () => void;
}) {
  const [step, setStep] = useState(0);
  const q = prompt.questions[step];
  const [selected, setSelected] = useState<string | null>(null);
  const isLast = step === prompt.questions.length - 1;

  function confirm() {
    if (!selected) return;
    if (isLast) {
      const answers: Record<string, string> = {};
      for (const q2 of prompt.questions) answers[q2.question] = selected;
      onAnswer(prompt.requestId, answers);
    } else {
      setStep(s => s + 1);
      setSelected(null);
    }
  }

  if (!q) return null;

  return (
    <div className="agent-prompt-card animate-slide-in" style={{ '--mode-color': MODE_META[mode].color } as React.CSSProperties}>
      <div className="agent-prompt-card-header">
        <span>{q.question}</span>
        {prompt.questions.length > 1 && (
          <span className="agent-prompt-step">{step + 1} / {prompt.questions.length}</span>
        )}
        <button type="button" className="agent-prompt-dismiss" onClick={onDismiss} aria-label="Dismiss">
          <XIcon size={12} />
        </button>
      </div>
      <div className="agent-prompt-options">
        {q.options.map((opt, i) => (
          <button
            key={opt.label}
            type="button"
            className={`agent-prompt-option${selected === opt.label ? ' agent-prompt-option--selected' : ''}`}
            style={selected === opt.label ? { borderColor: MODE_META[mode].color } as React.CSSProperties : undefined}
            onClick={() => setSelected(opt.label)}
          >
            <span className="agent-prompt-option-key">{i + 1}</span>
            <span>
              <span className="agent-prompt-option-label">{opt.label}</span>
              {opt.description && <span className="agent-prompt-option-desc"> — {opt.description}</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="agent-prompt-actions">
        <button
          type="button"
          className="agent-prompt-btn agent-prompt-btn--allow"
          style={{ background: selected ? MODE_META[mode].color : undefined }}
          disabled={!selected}
          onClick={confirm}
        >
          {isLast ? 'Confirm' : 'Next'}
        </button>
      </div>
    </div>
  );
}

function ModeDropdown({
  mode,
  availableModes,
  onSelect,
  onClose,
}: {
  mode: SessionMode;
  availableModes: SessionMode[];
  onSelect: (m: SessionMode) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="agent-mode-dropdown">
      {availableModes.map(m => (
        <button
          key={m}
          type="button"
          className={`agent-mode-option${m === mode ? ' agent-mode-option--active' : ''}`}
          onClick={() => { onSelect(m); onClose(); }}
        >
          <span className="agent-mode-dot" style={{ background: MODE_META[m].color }} />
          <span>
            <span className="agent-mode-label">{MODE_META[m].label}</span>
            <span className="agent-mode-desc">{MODE_META[m].description}</span>
          </span>
          {m === mode && <CheckCircleIcon size={13} weight="fill" color={MODE_META[m].color} />}
        </button>
      ))}
    </div>
  );
}

// ── Sticky last prompt ────────────────────────────────────────────────────────

function StickyLastPrompt({ text, attachments }: { text: string; attachments?: Attachment[] }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncate = text.split('\n').length > 2 || text.length > 120;

  return (
    <div className="agent-sticky-card">
      {attachments && attachments.length > 0 && (
        <div className="agent-attach-chips">
          {attachments.map((att, i) => (
            <span key={i} className="agent-attach-chip">
              <img src={`data:${att.mediaType};base64,${att.data}`} alt={att.name} className="agent-attach-thumb" />
              <span className="agent-attach-name">{att.name}</span>
            </span>
          ))}
        </div>
      )}
      <div className="agent-sticky-body">
        <div className={`agent-sticky-text${!expanded && needsTruncate ? ' agent-sticky-text--clamped' : ''}`}>
          {text}
        </div>
        {needsTruncate && (
          <button type="button" className="agent-sticky-toggle" onClick={() => setExpanded(v => !v)}>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Canvas widget system ──────────────────────────────────────────────────────

// WidgetKind imported from registry; code field optional (used for 'custom' widgets)
type WidgetData = { id: string; kind: WidgetKind; title: string; x: number; y: number; w: number; h: number; code?: string };

// ── Overlap resolver ─────────────────────────────────────────────────────────

const OVERLAP_PAD = 14; // minimum gap between widgets

function resolveOverlaps(widgets: WidgetData[], fixedId?: string): WidgetData[] {
  const PAD = OVERLAP_PAD;
  // Work on a mutable copy; objects are re-created on write so downstream reads see updated positions.
  const result = widgets.map(w => ({ ...w }));

  for (let iter = 0; iter < 60; iter++) {
    let anyOverlap = false;

    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i]!;
        const b = result[j]!;

        // Quick separating-axis reject
        if (
          a.x + a.w + PAD <= b.x || b.x + b.w + PAD <= a.x ||
          a.y + a.h + PAD <= b.y || b.y + b.h + PAD <= a.y
        ) continue;

        anyOverlap = true;
        const aFixed = a.id === fixedId;
        const bFixed = b.id === fixedId;
        if (aFixed && bFixed) continue;

        // Minimum push distance in each of the 4 directions
        const pushRight = (a.x + a.w + PAD) - b.x;  // separate by moving b right
        const pushLeft  = (b.x + b.w + PAD) - a.x;  // separate by moving a right
        const pushDown  = (a.y + a.h + PAD) - b.y;  // separate by moving b down
        const pushUp    = (b.y + b.h + PAD) - a.y;  // separate by moving a down
        const min = Math.min(pushRight, pushLeft, pushDown, pushUp);

        // Key: always apply the FULL separation to exactly ONE widget.
        // When neither is fixed we push j (later index), giving i priority.
        // This makes the push chain propagate: fixed→A→B→C without oscillation.
        if (min === pushRight) {
          if (!bFixed) result[j] = { ...result[j]!, x: result[j]!.x + min };
          else         result[i] = { ...result[i]!, x: Math.max(0, result[i]!.x - min) };
        } else if (min === pushLeft) {
          if (!aFixed) result[i] = { ...result[i]!, x: result[i]!.x + min };
          else         result[j] = { ...result[j]!, x: Math.max(0, result[j]!.x - min) };
        } else if (min === pushDown) {
          if (!bFixed) result[j] = { ...result[j]!, y: result[j]!.y + min };
          else         result[i] = { ...result[i]!, y: Math.max(0, result[i]!.y - min) };
        } else {
          if (!aFixed) result[i] = { ...result[i]!, y: result[i]!.y + min };
          else         result[j] = { ...result[j]!, y: Math.max(0, result[j]!.y - min) };
        }
      }
    }

    if (!anyOverlap) break;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const RESIZE_HANDLES: ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const MIN_W = 160;
const MIN_H = 80;

function CanvasWidget({
  data,
  onDragStart,
  onDrop,
  onResize,
  onClose,
  onShowCode,
}: {
  data: WidgetData;
  onDragStart: (id: string) => void;
  onDrop: (id: string, x: number, y: number) => void;
  onResize: (id: string, x: number, y: number, w: number, h: number) => void;
  onClose: (id: string) => void;
  onShowCode: (title: string, code: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);

  // ── Drag ──────────────────────────────────────────────────────────────────
  function handleDragMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    onDragStart(data.id);
    const startX = e.clientX - data.x;
    const startY = e.clientY - data.y;

    function onMouseMove(ev: MouseEvent) {
      const nx = Math.max(0, ev.clientX - startX);
      const ny = Math.max(0, ev.clientY - startY);
      if (elRef.current) { elRef.current.style.left = `${nx}px`; elRef.current.style.top = `${ny}px`; }
    }
    function onMouseUp(ev: MouseEvent) {
      onDrop(data.id, Math.max(0, ev.clientX - startX), Math.max(0, ev.clientY - startY));
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  function handleResizeMouseDown(e: React.MouseEvent, handle: ResizeHandle) {
    e.preventDefault();
    e.stopPropagation();   // don't trigger drag
    onDragStart(data.id);  // show the grid while resizing too

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const { x: sx, y: sy, w: sw, h: sh } = data;

    function calc(ev: MouseEvent) {
      const dx = ev.clientX - startMouseX;
      const dy = ev.clientY - startMouseY;
      let nx = sx, ny = sy, nw = sw, nh = sh;

      if (handle.includes('e')) { nw = Math.max(MIN_W, sw + dx); }
      if (handle.includes('s')) { nh = Math.max(MIN_H, sh + dy); }
      if (handle.includes('w')) { nw = Math.max(MIN_W, sw - dx); nx = Math.max(0, sx + sw - nw); }
      if (handle.includes('n')) { nh = Math.max(MIN_H, sh - dy); ny = Math.max(0, sy + sh - nh); }
      return { nx, ny, nw, nh };
    }

    function onMouseMove(ev: MouseEvent) {
      const { nx, ny, nw, nh } = calc(ev);
      if (elRef.current) {
        elRef.current.style.left   = `${nx}px`;
        elRef.current.style.top    = `${ny}px`;
        elRef.current.style.width  = `${nw}px`;
        elRef.current.style.height = `${nh}px`;
      }
    }
    function onMouseUp(ev: MouseEvent) {
      const { nx, ny, nw, nh } = calc(ev);
      onResize(data.id, nx, ny, nw, nh);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // Resolve the JS code: custom widgets carry their own code, builtins come from the registry
  const agentHttp = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:5081';
  const code = data.code ?? REGISTRY_MAP[data.kind]?.code ?? '';
  const content = <IframeWidget code={code} agentHttpBase={agentHttp} refreshKey={data.id} />;

  return (
    <div ref={elRef} className="canvas-widget" style={{ left: data.x, top: data.y, width: data.w, height: data.h }}>
      {/* Resize handles */}
      {RESIZE_HANDLES.map(h => (
        <div key={h} className={`canvas-resize-handle canvas-resize-handle--${h}`}
          onMouseDown={e => handleResizeMouseDown(e, h)} />
      ))}

      <div className="canvas-widget-header" onMouseDown={handleDragMouseDown}>
        <span className="canvas-widget-title">{data.title}</span>

        <button type="button" className="canvas-widget-code-btn"
          onClick={e => { e.stopPropagation(); onShowCode(data.title, code); }}
          title="View source code" aria-label="View source code">
          {'</>'}
        </button>

        <button type="button" className="canvas-widget-close" onClick={() => onClose(data.id)} aria-label="Close">
          <XIcon size={11} />
        </button>
      </div>

      <div className="canvas-widget-body">{content}</div>
    </div>
  );
}

// ── Widget API client ─────────────────────────────────────────────────────────

type WidgetRecord = {
  id:          string;
  kind:        string;
  label:       string;
  emoji:       string;
  defaultW:    number;
  defaultH:    number;
  code:        string;
  keywords?:   string[];
  description?: string;
  meta?:       Record<string, string>;
  isBuiltin:   boolean;
  archived:    boolean;
  createdAt:   string;
  updatedAt:   string;
};

const AGENT_HTTP_BASE =
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:5081';

// Canvas persistence — one .bzcanvas.json per working directory
type CanvasEntry = {
  canvasId: string;   // unique ID on this canvas instance
  widgetId: string;   // ID in the widget registry
  kind:     string;
  title:    string;
  x: number; y: number; w: number; h: number;
};

const canvasApi = {
  load: (cwd: string) =>
    fetch(`${AGENT_HTTP_BASE}/canvas?cwd=${encodeURIComponent(cwd)}`)
      .then(r => r.json()) as Promise<{ widgets: CanvasEntry[] }>,

  save: (cwd: string, widgets: CanvasEntry[]) =>
    fetch(`${AGENT_HTTP_BASE}/canvas?cwd=${encodeURIComponent(cwd)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, widgets }),
    }).then(r => r.json()),
};

const widgetApi = {
  list:   () =>
    fetch(`${AGENT_HTTP_BASE}/widgets`).then(r => r.json()) as Promise<{ widgets: WidgetRecord[] }>,

  upsert: (w: Omit<WidgetRecord, 'archived' | 'createdAt' | 'updatedAt'>) =>
    fetch(`${AGENT_HTTP_BASE}/widgets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(w),
    }).then(r => r.json()) as Promise<WidgetRecord>,

  seed: (widgets: Omit<WidgetRecord, 'archived' | 'createdAt' | 'updatedAt'>[]) =>
    fetch(`${AGENT_HTTP_BASE}/widgets/seed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgets }),
    }).then(r => r.json()) as Promise<{ seeded: number }>,

  archive: (id: string) =>
    fetch(`${AGENT_HTTP_BASE}/widgets/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(r => r.json()) as Promise<{ ok: boolean }>,
};

// ── Code drawer ───────────────────────────────────────────────────────────────

import MonacoEditor from '@monaco-editor/react';

function CodeDrawer({
  title,
  initialCode,
  onApply,
  onClose: onCloseDrawer,
}: {
  title:       string;
  initialCode: string;
  onApply:     (code: string) => void;
  onClose:     () => void;
}) {
  const [code,    setCode]    = useState(initialCode);
  const [copied,  setCopied]  = useState(false);
  const [applied, setApplied] = useState(false);

  // Mirror the app theme into Monaco's theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  function handleCopy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleApply() {
    onApply(code);
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  }

  return (
    <>
      <div className="code-drawer-backdrop" onClick={onCloseDrawer} />
      <div className="code-drawer">
        <div className="code-drawer-header">
          <span className="code-drawer-title">&lt;/&gt; {title}</span>

          <button type="button" className="canvas-code-copy-btn" onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button type="button"
            className={`code-drawer-apply-btn${applied ? ' code-drawer-apply-btn--done' : ''}`}
            onClick={handleApply}>
            {applied ? '✓ Applied' : '▶ Apply'}
          </button>
          <button type="button" className="canvas-widget-close" onClick={onCloseDrawer} aria-label="Close">
            <XIcon size={13} />
          </button>
        </div>

        <div className="code-drawer-editor">
          <MonacoEditor
            language="javascript"
            theme={isDark ? 'vs-dark' : 'light'}
            value={code}
            onChange={v => setCode(v ?? '')}
            options={{
              fontSize:           13,
              fontFamily:         "'Martian Mono', 'Cascadia Code', 'Fira Code', monospace",
              lineHeight:         22,
              minimap:            { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap:           'on',
              tabSize:            2,
              padding:            { top: 12, bottom: 12 },
              scrollbar:          { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
              renderLineHighlight:'gutter',
              bracketPairColorization: { enabled: true },
            }}
          />
        </div>
      </div>
    </>
  );
}

// ── Custom widget editor ──────────────────────────────────────────────────────

type CustomWidgetDef = {
  id:          string;
  name:        string;
  code:        string;
  keywords:    string;   // comma-separated string in the UI
  description: string;
  meta:        string;   // free-form JSON or plain text
};

function CustomWidgetEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: CustomWidgetDef;
  onSave: (def: CustomWidgetDef) => void;
  onCancel: () => void;
}) {
  const [name,        setName]        = useState(initial?.name        ?? 'My Widget');
  const [keywords,    setKeywords]    = useState(initial?.keywords    ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [meta,        setMeta]        = useState(initial?.meta        ?? '');
  const [code,        setCode]        = useState(initial?.code        ?? REGISTRY_MAP['custom']?.code ?? '');
  const [refreshKey,  setRefreshKey]  = useState(0);

  const agentHttp = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:5081';

  function handleSave() {
    onSave({ id: initial?.id ?? uid(), name, keywords, description, meta, code });
  }

  return (
    <div className="cwe-overlay">
      <div className="cwe-panel animate-slide-in">
        <div className="cwe-header">
          <input className="cwe-name-input" value={name} onChange={e => setName(e.target.value)} placeholder="Widget name *" />
          <button type="button" className="cwe-run-btn" onClick={() => setRefreshKey(k => k + 1)}>▶ Run</button>
          <button type="button" className="cwe-save-btn" onClick={handleSave} disabled={!name.trim() || !code.trim()}>Save</button>
          <button type="button" className="cwe-cancel-btn" onClick={onCancel}><XIcon size={14} /></button>
        </div>

        {/* Metadata row */}
        <div className="cwe-meta-row">
          <input className="cwe-meta-input" value={keywords}    onChange={e => setKeywords(e.target.value)}    placeholder="Keywords (comma-separated)" />
          <input className="cwe-meta-input cwe-meta-input--wide" value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description" />
          <input className="cwe-meta-input" value={meta}        onChange={e => setMeta(e.target.value)}        placeholder='Meta (e.g. {"category":"utility"})' />
        </div>

        <div className="cwe-body">
          <textarea className="cwe-editor" value={code} onChange={e => setCode(e.target.value)} spellCheck={false} placeholder="// JavaScript code…" />
          <div className="cwe-preview">
            <IframeWidget code={code} agentHttpBase={agentHttp} refreshKey={refreshKey} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Credential Manager ────────────────────────────────────────────────────────

function CredentialManager({ agentHttp, onClose }: { agentHttp: string; onClose: () => void }) {
  const [keys,    setKeys]    = useState<string[]>([]);
  const [newKey,  setNewKey]  = useState('');
  const [newVal,  setNewVal]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  function refresh() {
    fetch(`${agentHttp}/credentials`)
      .then(r => r.json())
      .then((d: { keys?: string[] }) => setKeys(d.keys ?? []))
      .catch(() => setError('Cannot reach server'));
  }

  useEffect(() => { refresh(); }, [agentHttp]);

  async function handleAdd() {
    if (!newKey.trim() || !newVal.trim()) return;
    setSaving(true);
    try {
      await fetch(`${agentHttp}/credentials`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey.trim(), value: newVal.trim() }),
      });
      setNewKey(''); setNewVal('');
      refresh();
    } catch { setError('Save failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(key: string) {
    await fetch(`${agentHttp}/credentials/${encodeURIComponent(key)}`, { method: 'DELETE' })
      .catch(() => {});
    refresh();
  }

  return (
    <div className="cwe-overlay">
      <div className="cred-panel animate-slide-in">
        <div className="cred-header">
          <span className="cred-title">🔑 Credentials</span>
          <button type="button" className="cwe-cancel-btn" onClick={onClose}><XIcon size={14} /></button>
        </div>
        <p className="cred-hint">
          Stored in <code>server_data/credentials.json</code>.
          Credentials are <strong>never sent to widgets</strong> — use
          the proxy with <code>{'{{KEY}}'}</code> placeholders instead:
        </p>
        <pre className="cred-example">{`fetch(window.__agentHttpBase__ + '/proxy', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({
    url:    'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: {'Authorization':'Bearer {{OPENAI_API_KEY}}'},
    body:   JSON.stringify({model:'gpt-4o-mini', messages:[...]})
  })
})`}</pre>
        {error && <p className="cred-error">{error}</p>}

        <div className="cred-list">
          {keys.length === 0 && <p className="cred-empty">No credentials saved yet.</p>}
          {keys.map(k => (
            <div key={k} className="cred-row">
              <code className="cred-key">{k}</code>
              <span className="cred-masked">••••••••</span>
              <button type="button" className="cred-delete" onClick={() => void handleDelete(k)}>Delete</button>
            </div>
          ))}
        </div>

        <div className="cred-add-row">
          <input className="cred-input" placeholder="KEY_NAME" value={newKey}
            onChange={e => setNewKey(e.target.value)} />
          <input className="cred-input cred-input--val" placeholder="value" type="password"
            value={newVal} onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void handleAdd()} />
          <button type="button" className="code-drawer-apply-btn" onClick={() => void handleAdd()}
            disabled={saving || !newKey.trim() || !newVal.trim()}>
            {saving ? '…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Canvas panel ──────────────────────────────────────────────────────────────

function CanvasPanel({ cwd }: { cwd?: string }) {
  const [canvasWidgets, setCanvasWidgets] = useState<WidgetData[]>([]);
  const [dragging,      setDragging]      = useState(false);
  const [apiWidgets,    setApiWidgets]    = useState<WidgetRecord[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [editingDef,    setEditingDef]    = useState<CustomWidgetDef | null>(null);
  const [showNewEditor,    setShowNewEditor]    = useState(false);
  const [showCredManager,  setShowCredManager]  = useState(false);
  const [widgetSearch,     setWidgetSearch]     = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [codeDrawer,    setCodeDrawer]    = useState<{ id: string; title: string; code: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load saved canvas layout for this working directory
  useEffect(() => {
    if (!cwd) return;
    canvasApi.load(cwd)
      .then(({ widgets: entries }) => {
        if (!entries?.length) return;
        // Reconstruct WidgetData from saved CanvasEntry records
        // Code comes from the widget registry / API (not stored in the canvas file)
        setCanvasWidgets(entries.map(e => ({
          id:    e.canvasId,
          kind:  e.kind as WidgetKind,
          title: e.title,
          x: e.x, y: e.y, w: e.w, h: e.h,
          // code will be resolved by CanvasWidget from REGISTRY_MAP or API
        })));
      })
      .catch(() => { /* canvas file missing or server offline — start blank */ });
  }, [cwd]);

  // Debounced save: whenever the canvas layout changes, persist to <cwd>/.bzcanvas.json
  useEffect(() => {
    if (!cwd || canvasWidgets.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const entries: CanvasEntry[] = canvasWidgets.map(w => ({
        canvasId: w.id,
        widgetId: w.code ? w.id : w.kind,  // custom widgets use their unique id
        kind:     w.kind,
        title:    w.title,
        x: w.x, y: w.y, w: w.w, h: w.h,
      }));
      canvasApi.save(cwd, entries).catch(() => { /* silent — offline */ });
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [cwd, canvasWidgets]);

  // On mount: seed built-ins then fetch the full list from the API
  useEffect(() => {
    const seedPayload = WIDGET_REGISTRY.map(w => ({
      id:          w.kind,
      kind:        w.kind,
      label:       w.label,
      emoji:       w.emoji,
      defaultW:    w.defaultW,
      defaultH:    w.defaultH,
      code:        w.code,
      keywords:    w.keywords,
      description: w.description,
      meta:        w.meta,
      isBuiltin:   true,
    }));

    widgetApi.seed(seedPayload)
      .catch(() => { /* server offline — continue with registry fallback */ })
      .finally(() => {
        widgetApi.list()
          .then(({ widgets }) => setApiWidgets(widgets))
          .catch(() => { /* server offline — toolbar falls back to WIDGET_REGISTRY */ })
          .finally(() => setLoading(false));
      });
  }, []);

  // Toolbar entries: prefer API list; fall back to local registry if server is offline
  const toolbarEntries: { id: string; kind: string; label: string; emoji: string;
                           defaultW: number; defaultH: number; code: string; isBuiltin: boolean }[] =
    apiWidgets.length > 0
      ? apiWidgets
      : WIDGET_REGISTRY.map(w => ({ id: w.kind, kind: w.kind, label: w.label,
          emoji: w.emoji, defaultW: w.defaultW, defaultH: w.defaultH,
          code: w.code, isBuiltin: true }));

  function spawnWidget(entry: typeof toolbarEntries[number]) {
    setCanvasWidgets(prev => {
      const next = [...prev, {
        id: uid(), kind: entry.kind as WidgetKind,
        title: entry.label, code: entry.code,
        x: 32 + (prev.length % 6) * 20,
        y: 32 + (prev.length % 6) * 20,
        w: entry.defaultW, h: entry.defaultH,
      }];
      return resolveOverlaps(next);
    });
  }

  async function handleSaveCustom(def: CustomWidgetDef) {
    let parsedMeta: Record<string, string> = {};
    try { parsedMeta = JSON.parse(def.meta) as Record<string, string>; } catch { /* plain text → store as-is */ }

    const record = await widgetApi.upsert({
      id: def.id, kind: 'custom', label: def.name, emoji: '⚡',
      defaultW: 340, defaultH: 280, code: def.code, isBuiltin: false,
      keywords:    def.keywords.split(',').map(k => k.trim()).filter(Boolean),
      description: def.description,
      meta:        Object.keys(parsedMeta).length ? parsedMeta : { note: def.meta },
    }).catch(() => null);

    // Refresh API list (or add locally if offline)
    if (record) {
      setApiWidgets(prev => {
        const exists = prev.find(w => w.id === def.id);
        return exists ? prev.map(w => w.id === def.id ? record : w) : [...prev, record];
      });
    }

    // Spawn on canvas
    setCanvasWidgets(prev => {
      const next = [...prev, {
        id: uid(), kind: 'custom' as WidgetKind, title: def.name, code: def.code,
        x: 32 + (prev.length % 6) * 20, y: 32 + (prev.length % 6) * 20, w: 340, h: 280,
      }];
      return resolveOverlaps(next);
    });

    setEditingDef(null);
    setShowNewEditor(false);
  }

  async function handleArchiveWidget(id: string) {
    await widgetApi.archive(id).catch(() => null);
    setApiWidgets(prev => prev.filter(w => w.id !== id));
  }

  function handleDrop(id: string, x: number, y: number) {
    setDragging(false);
    setCanvasWidgets(prev => resolveOverlaps(prev.map(w => w.id === id ? { ...w, x, y } : w), id));
  }
  function handleResize(id: string, x: number, y: number, w: number, h: number) {
    setDragging(false);
    setCanvasWidgets(prev => resolveOverlaps(prev.map(ww => ww.id === id ? { ...ww, x, y, w, h } : ww), id));
  }

  return (
    <div className="canvas-panel">
      {codeDrawer && (
        <CodeDrawer
          title={codeDrawer.title}
          initialCode={codeDrawer.code}
          onApply={newCode => {
            setCanvasWidgets(prev => prev.map(w => w.id === codeDrawer.id ? { ...w, code: newCode } : w));
            setCodeDrawer(d => d ? { ...d, code: newCode } : null);
          }}
          onClose={() => setCodeDrawer(null)}
        />
      )}
      {showCredManager && (
        <CredentialManager agentHttp={AGENT_HTTP_BASE} onClose={() => setShowCredManager(false)} />
      )}
      {showNewEditor && (
        <CustomWidgetEditor onSave={def => { void handleSaveCustom(def); }} onCancel={() => setShowNewEditor(false)} />
      )}
      {editingDef && (
        <CustomWidgetEditor initial={editingDef} onSave={def => { void handleSaveCustom(def); }} onCancel={() => setEditingDef(null)} />
      )}

      <div className="canvas-toolbar">
        {/* Search input — filters all widgets by name/keywords */}
        <input
          ref={searchRef}
          className="canvas-widget-search"
          placeholder="Search widgets…"
          value={widgetSearch}
          onChange={e => setWidgetSearch(e.target.value)}
        />

        {/* Filtered built-in widgets */}
        {toolbarEntries
          .filter(e => e.kind !== 'custom')
          .filter(e => {
            if (!widgetSearch.trim()) return true;
            const q = widgetSearch.toLowerCase();
            const kwds = (e as WidgetRecord).keywords ?? [];
            return (
              e.label.toLowerCase().includes(q) ||
              kwds.some(k => k.toLowerCase().includes(q)) ||
              ((e as WidgetRecord).description ?? '').toLowerCase().includes(q)
            );
          })
          .map(entry => (
            <button key={entry.id} type="button" className="canvas-add-btn" onClick={() => spawnWidget(entry)}>
              {entry.emoji} {entry.label}
            </button>
          ))}

        <span className="canvas-toolbar-divider" />

        <button type="button" className="canvas-add-btn canvas-add-btn--custom" onClick={() => setShowNewEditor(true)}>
          ⚡ + Custom
        </button>
        <button type="button" className="canvas-add-btn canvas-add-btn--creds" onClick={() => setShowCredManager(true)}
          title="Manage API credentials available to all widgets">
          🔑 Credentials
        </button>

        {/* Custom (user-saved) widgets */}
        {toolbarEntries.filter(e => !e.isBuiltin).map(entry => (
          <button key={entry.id} type="button" className="canvas-add-btn"
            onClick={() => spawnWidget(entry)}
            onContextMenu={e => {
              e.preventDefault();
              setEditingDef({
                id:          entry.id,
                name:        entry.label,
                code:        entry.code,
                keywords:    (entry as WidgetRecord).keywords?.join(', ') ?? '',
                description: (entry as WidgetRecord).description ?? '',
                meta:        (entry as WidgetRecord).meta ? JSON.stringify((entry as WidgetRecord).meta) : '',
              });
            }}>
            ⚡ {entry.label}
            <span className="canvas-custom-archive" title="Archive"
              onClick={ev => { ev.stopPropagation(); void handleArchiveWidget(entry.id); }}>×</span>
          </button>
        ))}
      </div>

      {/* Grid is a background-image on the area itself — covers full scrollable content */}
      <div className={`canvas-area${dragging ? ' canvas-area--dragging' : ''}`}>
        {canvasWidgets.length === 0 && (
          <div className="canvas-empty">
            <SquaresFourIcon size={36} color="var(--text-tertiary)" weight="duotone" />
            <p className="canvas-empty-title">Empty canvas</p>
            <p className="canvas-empty-hint">Add widgets · Drag to move · Resize edges · Right-click custom to edit</p>
          </div>
        )}
        {canvasWidgets.map(w => (
          <CanvasWidget key={w.id} data={w}
            onDragStart={() => setDragging(true)}
            onDrop={handleDrop} onResize={handleResize}
            onClose={id => setCanvasWidgets(prev => prev.filter(ww => ww.id !== id))}
            onShowCode={(title, code) => setCodeDrawer({ id: w.id, title, code })}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Session list ──────────────────────────────────────────────────────────────

type SessionInfo = {
  sessionId: string;
  workingDir: string;
  dirName: string;
  messageCount: number;
  title: string;
  lastMessage: string;
  lastModified: number;
  created: string;
};

function SessionListPage({
  onSelect,
  onNew,
}: {
  onSelect: (sessionId: string, cwd: string) => void;
  onNew: (cwd: string) => void;
}) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [showNew,  setShowNew]  = useState(false);
  const [newCwd,   setNewCwd]   = useState('');

  useEffect(() => {
    fetch(`${HTTP_BASE}/sessions`)
      .then(r => r.json())
      .then((d: { sessions: SessionInfo[] }) => { setSessions(d.sessions ?? []); setLoading(false); })
      .catch(e => { setFetchErr(e.message); setLoading(false); });
  }, []);

  function handleNew() {
    const cwd = newCwd.trim();
    if (!cwd) return;
    // If a session already exists for this directory, resume it
    const existing = sessions.find(s => s.workingDir === cwd);
    if (existing) onSelect(existing.sessionId, cwd);
    else onNew(cwd);
  }

  function relativeTime(ts: number) {
    const diff = Date.now() / 1000 - ts;
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(ts * 1000).toLocaleDateString();
  }

  return (
    <div className="agent-session-page">
      <div className="agent-session-topbar">
        <div>
          <h2 className="agent-session-title">bzcode Agent</h2>
          <p className="agent-session-subtitle">One conversation per working directory</p>
        </div>
        <button type="button" className="agent-session-new-btn" onClick={() => setShowNew(v => !v)}>
          + New chat
        </button>
      </div>

      {/* New chat form */}
      {showNew && (
        <div className="agent-session-new-form animate-slide-in">
          <label className="agent-session-new-label">Working directory</label>
          <div className="wgt-search-bar" style={{ gap: 6 }}>
            <input
              className="wgt-search-input"
              placeholder="/Users/you/your-project"
              value={newCwd}
              onChange={e => setNewCwd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNew()}
              autoFocus
            />
            <button type="button" className="wgt-search-btn" onClick={handleNew} disabled={!newCwd.trim()}>→</button>
          </div>
          <p className="agent-session-new-hint">
            If a session already exists for this directory it will be resumed.
          </p>
        </div>
      )}

      {/* Session cards */}
      <div className="agent-session-list">
        {loading && (
          <div className="agent-session-empty">
            <BoltzbitLogo size={20} className="boltzbit-logo-animate" />
            <span>Loading sessions…</span>
          </div>
        )}
        {fetchErr && (
          <div className="agent-session-empty">
            <p style={{ color: 'var(--accent-red)' }}>Could not reach server: {fetchErr}</p>
            <p>Make sure <code>server.py</code> is running.</p>
          </div>
        )}
        {!loading && !fetchErr && sessions.length === 0 && (
          <div className="agent-session-empty">
            <TerminalIcon size={32} color="var(--text-tertiary)" weight="duotone" />
            <p>No previous sessions — click <strong>+ New chat</strong> to start one.</p>
          </div>
        )}
        {sessions.map(s => (
          <button
            key={s.sessionId}
            type="button"
            className="agent-session-card animate-slide-in"
            onClick={() => onSelect(s.sessionId, s.workingDir)}
          >
            <div className="agent-session-card-top">
              <span className="agent-session-dirname">{s.dirName}</span>
              <span className="agent-session-time">{relativeTime(s.lastModified)}</span>
            </div>
            <div className="agent-session-path" title={s.workingDir}>{s.workingDir}</div>
            {s.lastMessage && (
              <div className="agent-session-preview">{s.lastMessage}</div>
            )}
            <div className="agent-session-meta">{s.messageCount} message{s.messageCount !== 1 ? 's' : ''}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Conversations panel ───────────────────────────────────────────────────────

function fmtConvTime(ts: number): string {
  const d = new Date(ts * 1000);
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yy   = String(d.getFullYear()).slice(2);
  const hh   = String(d.getHours()).padStart(2, '0');
  const min  = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
}

function ConversationsPanel({
  cwd,
  activeSessionId,
  httpBase,
  onSelect,
  onNew,
  onClose,
}: {
  cwd: string;
  activeSessionId: string | null;
  httpBase: string;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const [sessions,  setSessions]  = useState<SessionInfo[]>([]);
  const [query,     setQuery]     = useState('');
  const [loading,   setLoading]   = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${httpBase}/sessions?cwd=${encodeURIComponent(cwd)}`)
      .then(r => r.json())
      .then((d: { sessions: SessionInfo[] }) => { setSessions(d.sessions ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [cwd, httpBase]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  async function handleDelete(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`${httpBase}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => null);
    setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
  }

  const q = query.toLowerCase();
  const filtered = q
    ? sessions.filter(s => s.title.toLowerCase().includes(q) || s.lastMessage.toLowerCase().includes(q))
    : sessions;

  return (
    <div ref={ref} className="conv-panel">
      <div className="conv-panel-header">
        <span className="conv-panel-title">Conversations</span>
        <button type="button" className="conv-new-btn" onClick={onNew} title="New conversation">
          <PlusIcon size={13} />
        </button>
        <button type="button" className="canvas-widget-close" onClick={onClose}><XIcon size={13} /></button>
      </div>

      <div className="conv-search-row">
        <input
          className="conv-search-input"
          placeholder="Search conversations…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="conv-list">
        {loading && <div className="conv-empty">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="conv-empty">No conversations yet.</div>
        )}
        {filtered.map(s => (
          <button
            key={s.sessionId}
            type="button"
            className={`conv-item${s.sessionId === activeSessionId ? ' conv-item--active' : ''}`}
            onClick={() => { onSelect(s.sessionId); onClose(); }}
          >
            <div className="conv-item-top">
              <span className="conv-item-title">{s.title}</span>
              <span className="conv-item-time">{fmtConvTime(s.lastModified)}</span>
            </div>
            <div className="conv-item-bottom">
              <span className="conv-item-id">{s.sessionId}</span>
              <div className="conv-item-actions">
                <button
                  type="button"
                  className="conv-item-action-btn"
                  title="Copy ID"
                  onClick={e => {
                    e.stopPropagation();
                    void navigator.clipboard.writeText(s.sessionId);
                  }}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="conv-item-action-btn conv-item-action-btn--delete"
                  title="Delete"
                  onClick={e => void handleDelete(s.sessionId, e)}
                >
                  <TrashIcon size={11} />
                </button>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Boltzing indicator with elapsed timer ────────────────────────────────────

function BoltzingIndicator() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    setSecs(0);
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="agent-boltzing">
      <BoltzbitLogo size={14} className="boltzbit-logo-animate" />
      <span className="agent-boltzing-label">
        Boltzing…
        {secs >= 5 && (
          <span style={{ opacity: 0.5, marginLeft: 6 }}>
            {secs}s{secs >= 30 ? ' — this model takes a while, hang tight' : ''}
          </span>
        )}
      </span>
    </div>
  );
}

// ── Main agent page ───────────────────────────────────────────────────────────

function AgentPage() {
  // ── Session routing ─────────────────────────────────────────────────────────
  const [view,           setView]           = useState<'list' | 'chat'>('list');
  const [activeCwd,      setActiveCwd]      = useState('');
  const [activeSessionId,setActiveSessionId]= useState<string | null>(null);
  const [activeDirName,  setActiveDirName]  = useState('');

  // Clear batch queue from sessionStorage on mount (already loaded into state)
  useEffect(() => { sessionStorage.removeItem('agent:batchQueue'); }, []);

  // Pick up cwd/message pre-filled from home page prompt
  useEffect(() => {
    const cwd = sessionStorage.getItem('agent:pendingCwd');
    const msg = sessionStorage.getItem('agent:pendingMessage');
    if (cwd) {
      const sid = sessionStorage.getItem('agent:pendingSessionId');
      sessionStorage.removeItem('agent:pendingCwd');
      sessionStorage.removeItem('agent:pendingMessage');
      sessionStorage.removeItem('agent:pendingSessionId');
      setActiveCwd(cwd);
      setActiveDirName(cwd.split('/').filter(Boolean).pop() ?? cwd);
      setActiveSessionId(sid ?? null);
      setView('chat');
      if (msg) {
        // Auto-send in YOLO mode once the session connects
        pendingAutoSendRef.current = msg;
      }
    }
  }, []);

  // WS URL is null while in list view (no connection)
  // Always pass cwd so bzcode runs in the correct directory, even when resuming.
  const wsUrl = view === 'chat' && activeCwd
    ? `${WS_BASE}?cwd=${encodeURIComponent(activeCwd)}${activeSessionId ? `&sessionId=${encodeURIComponent(activeSessionId)}` : ''}`
    : null;

  // ── Chat state ───────────────────────────────────────────────────────────────
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [streamingBlocks, setStreamingBlocks] = useState<AssistantBlock[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [mode, setMode] = useState<SessionMode>('default');
  const [availableModes, setAvailableModes] = useState<SessionMode[]>(['default', 'plan', 'yolo']);
  const [availableCommands, setAvailableCommands] = useState<Array<{name: string; description: string; aliases?: string[]}>>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  // Slash command menu state
  const [slashMenuIdx,       setSlashMenuIdx]       = useState(0);
  const [slashMenuDismissed, setSlashMenuDismissed] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PermissionPrompt | null>(null);
  const [pendingInput, setPendingInput] = useState<InputPromptData | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [bzHubModal,        setBzHubModal]        = useState<BzHubModal | null>(null);
  const [showConversations, setShowConversations] = useState(false);
  const [batchQueue,        setBatchQueue]        = useState<{ cwd: string; message: string }[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('agent:batchQueue') ?? '[]') as { cwd: string; message: string }[]; } catch { return []; }
  });
  const [sessionTitle,      setSessionTitle]      = useState('');
  const [isEditingTitle,    setIsEditingTitle]    = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [canvasMode,   setCanvasMode]   = useState(false);
  const [stickyMsgIdx, setStickyMsgIdx] = useState(-1);
  const [stickyTranslateY, setStickyTranslateY] = useState(0);

  const wsRef              = useRef<WebSocket | null>(null);
  const pendingAutoSendRef = useRef<string | null>(null);
  const streamingBlocksRef = useRef<StreamingBlocks>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickyOverlayRef = useRef<HTMLDivElement>(null);
  // RAF handle for batching streaming block renders
  const streamingRafRef = useRef<number | null>(null);
  // RAF handle for scroll-to-bottom during streaming
  const scrollRafRef = useRef<number | null>(null);

  const updateSticky = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const containerRect = el.getBoundingClientRect();
    const stickyHeight = stickyOverlayRef.current?.offsetHeight ?? 0;
    const userMsgEls = el.querySelectorAll('[data-user-msg-idx]');
    const stickyCardOffset = 8;
    let currentStickyIdx = -1;
    for (const msgEl of userMsgEls) {
      const elRect = msgEl.getBoundingClientRect();
      if (elRect.top - stickyCardOffset < containerRect.top) {
        const idx = parseInt((msgEl as HTMLElement).dataset['userMsgIdx'] ?? '-1', 10);
        if (idx > currentStickyIdx) currentStickyIdx = idx;
      }
    }
    const kickGap = 10;
    let translateY = 0;
    if (currentStickyIdx !== -1 && stickyHeight > 0) {
      for (const msgEl of userMsgEls) {
        const elRect = msgEl.getBoundingClientRect();
        const idx = parseInt((msgEl as HTMLElement).dataset['userMsgIdx'] ?? '-1', 10);
        if (idx > currentStickyIdx && elRect.top >= containerRect.top && elRect.top < containerRect.top + stickyHeight + kickGap) {
          translateY = elRect.top - containerRect.top - stickyHeight - kickGap;
          break;
        }
      }
    }
    setStickyMsgIdx(currentStickyIdx);
    setStickyTranslateY(translateY);
  }, []);

  // Scroll to bottom + update sticky only on conversation-level changes (new messages).
  // Delta streaming updates are handled separately via RAF to avoid per-keystroke reflows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // RAF ensures updateSticky reads final layout positions after the browser paints
    requestAnimationFrame(() => updateSticky());
  }, [items, updateSticky]);

  // Attach scroll listener — must re-run when `view` becomes 'chat' because the
  // scroll container isn't mounted during list view (scrollRef.current is null then).
  useEffect(() => {
    if (view !== 'chat') return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => updateSticky();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [updateSticky, view]);

  // Auto-resize textarea
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '1px';
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    const maxH = lh * 9;
    el.style.height = `${Math.max(Math.min(el.scrollHeight, maxH), lh)}px`;
    el.style.overflowY = el.scrollHeight >= maxH ? 'auto' : 'hidden';
  }, [inputValue]);

  const sendRaw = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // ── BoltzHub SSE streaming ────────────────────────────────────────────────
  const startBzHubSSE = useCallback(async (
    endpoint: 'push' | 'sync',
    body: Record<string, unknown>,
  ) => {
    const itemId = uid();
    if (endpoint === 'push') {
      setItems(prev => [...prev, { id: itemId, kind: 'push-progress', step: 'build', message: 'Starting…' } as DisplayItem]);
    } else {
      setItems(prev => [...prev, { id: itemId, kind: 'sync-progress', step: 'download', message: 'Starting…' } as DisplayItem]);
    }

    try {
      const resp = await fetch(`${AGENT_HTTP_BASE}/boltzhub/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.body) return;

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          const data = JSON.parse(line.slice(6)) as { step: string; message: string; serviceUrl?: string };
          if (endpoint === 'push') {
            setItems(prev => prev.map(item =>
              item.id === itemId
                ? { id: itemId, kind: 'push-progress' as const, step: data.step as PushStep, message: data.message, serviceUrl: data.serviceUrl, appId: (data as Record<string,string>).appId }
                : item
            ));
          } else {
            setItems(prev => prev.map(item =>
              item.id === itemId
                ? { id: itemId, kind: 'sync-progress' as const, step: data.step as SyncStep, message: data.message }
                : item
            ));
          }
        }
      }
    } catch (e) {
      const errMsg = String(e);
      if (endpoint === 'push') {
        setItems(prev => prev.map(item => item.id === itemId ? { id: itemId, kind: 'push-progress' as const, step: 'error' as PushStep, message: errMsg } : item));
      } else {
        setItems(prev => prev.map(item => item.id === itemId ? { id: itemId, kind: 'sync-progress' as const, step: 'error' as SyncStep, message: errMsg } : item));
      }
    }
  }, []);

  const startPush = useCallback(async (cwd: string, releaseNotes?: string, versionNumber?: string) => {
    setBzHubModal(null);
    await startBzHubSSE('push', { cwd, releaseNotes, versionNumber });
  }, [startBzHubSSE]);

  const startSync = useCallback(async (cwd: string, appId?: string) => {
    setBzHubModal(null);
    await startBzHubSSE('sync', { cwd, appId });
  }, [startBzHubSSE]);

  // WebSocket — reconnects whenever wsUrl changes (new session selected)
  useEffect(() => {
    if (!wsUrl) return;

    // Reset conversation state for the new session
    setItems([]);
    setStreamingBlocks([]);
    setIsStreaming(false);
    setStickyMsgIdx(-1);
    setConnStatus('connecting');
    setSessionTitle('');
    setIsEditingTitle(false);
    streamingBlocksRef.current.clear();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnStatus('connected');
    ws.onerror = () => setConnStatus('error');
    ws.onclose = () => setConnStatus('disconnected');

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(event.data) as Record<string, unknown>; } catch { return; }
      const type = msg['type'] as string;

      if (type === 'session') {
        setConnStatus('connected');
        // Auto-send pending message from home page in YOLO mode
        if (pendingAutoSendRef.current) {
          const text = pendingAutoSendRef.current;
          pendingAutoSendRef.current = null;
          // Small delay to let bzcode finish its startup auto-run
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'setMode', mode: 'yolo' }));
              setMode('yolo');
              const userMsg = { id: uid(), kind: 'user' as const, text };
              setItems(prev => [...prev, userMsg]);
              wsRef.current.send(JSON.stringify({ type: 'user', content: text }));
            }
          }, 200);
        }
        if (msg['sessionId']) {
          const sid = msg['sessionId'] as string;
          setCurrentSessionId(sid);
          // Load custom/auto title for this session from server
          fetch(`${HTTP_BASE}/sessions?cwd=${encodeURIComponent(activeCwd)}`)
            .then(r => r.json())
            .then((d: { sessions: SessionInfo[] }) => {
              const s = d.sessions.find(s => s.sessionId === sid);
              if (s?.title && s.title !== '(empty)') setSessionTitle(s.title);
            })
            .catch(() => null);
        }
        if (Array.isArray(msg['modes'])) setAvailableModes(msg['modes'] as SessionMode[]);
        if (Array.isArray(msg['commands'])) setAvailableCommands(msg['commands'] as Array<{name:string;description:string;aliases?:string[]}>);
        const history = msg['messages'] as Array<{ role: string; content: unknown }> | undefined;
        if (history?.length) {
          const restored: DisplayItem[] = [];
          for (const m of history) {
            if (m.role === 'user') {
              const text = typeof m.content === 'string' ? m.content : '';
              if (text) restored.push({ id: uid(), kind: 'user', text });
            } else {
              const blocks = Array.isArray(m.content) ? bzBlocksToAssistantBlocks(m.content as unknown[]) : [];
              if (blocks.length) restored.push({ id: uid(), kind: 'assistant', blocks });
            }
          }
          setItems(restored);
        }
      }

      else if (type === 'status') {
        const s = msg['status'] as string;
        if (s === 'running') {
          setIsStreaming(true);
          streamingBlocksRef.current.clear();
          setStreamingBlocks([]);
        } else {
          setIsStreaming(false);
          streamingBlocksRef.current.clear();
          setStreamingBlocks([]);
          if (msg['mode']) setMode(msg['mode'] as SessionMode);
        }
      }

      else if (type === 'delta') {
        if (msg['field'] === 'signature' || msg['blockType'] === 'toolUse') return;
        const idx = msg['blockIndex'] as number;
        const existing = streamingBlocksRef.current.get(idx) ?? { type: msg['blockType'] as string, content: '' };
        existing.content += msg['content'] as string;
        streamingBlocksRef.current.set(idx, existing);

        // Batch render: schedule a single RAF flush instead of re-rendering per delta
        if (streamingRafRef.current === null) {
          streamingRafRef.current = requestAnimationFrame(() => {
            streamingRafRef.current = null;
            setStreamingBlocks(streamingToBlocks(streamingBlocksRef.current));
            // Scroll to bottom only once per animation frame
            if (scrollRafRef.current === null) {
              scrollRafRef.current = requestAnimationFrame(() => {
                scrollRafRef.current = null;
                const el = scrollRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              });
            }
          });
        }
      }

      else if (type === 'assistant') {
        const blocks = bzBlocksToAssistantBlocks(msg['content'] as unknown[]);
        streamingBlocksRef.current.clear();
        setStreamingBlocks([]);
        if (blocks.length) {
          setItems(prev => {
            const last = prev[prev.length - 1];
            if (last?.kind === 'assistant') {
              return [...prev.slice(0, -1), { id: uid(), kind: 'assistant', blocks }];
            }
            return [...prev, { id: uid(), kind: 'assistant', blocks }];
          });
        }
      }

      else if (type === 'tool') {
        const toolUseId = msg['toolUseId'] as string;
        const status = msg['status'] as 'running' | 'done' | 'error';
        setItems(prev => {
          const idx = prev.findIndex(i => i.kind === 'tool' && (i as Extract<DisplayItem, { kind: 'tool' }>).toolUseId === toolUseId);
          if (idx >= 0) {
            const updated = { ...prev[idx] } as Extract<DisplayItem, { kind: 'tool' }>;
            updated.status = status;
            if (status === 'done') { updated.output = msg['content'] as string; updated.isError = msg['isError'] as boolean; }
            else if (status === 'error') { updated.output = msg['message'] as string; updated.isError = true; }
            return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
          }
          return [...prev, { id: uid(), kind: 'tool', toolUseId, name: msg['name'] as string, status, input: msg['input'] }];
        });
      }

      else if (type === 'prompt') {
        const subtype = msg['subtype'] as string;
        const requestId = msg['requestId'] as string;
        if (subtype === 'permission') {
          setPendingPermission({ requestId, tool: msg['tool'] as string, input: msg['input'] });
        } else if (subtype === 'input') {
          const questions = (msg['questions'] as Question[] | undefined) ?? [];
          setPendingInput({ requestId, message: msg['message'] as string, questions });
        }
      }

      else if (type === 'result') {
        if (msg['usage']) setTokenUsage(msg['usage'] as TokenUsage);
        if (msg['status'] === 'success' && msg['output']) {
          setItems(prev => [...prev, { id: uid(), kind: 'assistant', blocks: [{ type: 'text', text: msg['output'] as string }] }]);
        }
      }
    };

    return () => ws.close();
  }, [wsUrl]);

  const handlePermission = useCallback((requestId: string, behavior: 'allow' | 'deny' | 'always') => {
    sendRaw({ type: 'user', subtype: 'permission', requestId, behavior });
    setPendingPermission(null);
  }, [sendRaw]);

  const handleInputAnswer = useCallback((requestId: string, answers: Record<string, string>) => {
    sendRaw({ type: 'user', subtype: 'input', requestId, answers });
    setPendingInput(null);
  }, [sendRaw]);

  const handleModeChange = useCallback((m: SessionMode) => {
    setMode(m);
    sendRaw({ type: 'setMode', mode: m });
  }, [sendRaw]);

  const handleAbort = useCallback(() => {
    sendRaw({ type: 'abort' });
  }, [sendRaw]);

  const saveTitle = useCallback((title: string) => {
    const trimmed = title.trim();
    if (!trimmed || !currentSessionId) return;
    setSessionTitle(trimmed);
    setIsEditingTitle(false);
    fetch(`${HTTP_BASE}/sessions/${encodeURIComponent(currentSessionId)}/title`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    }).catch(() => null);
  }, [currentSessionId]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    // Reset so the same file can be re-selected
    e.target.value = '';
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // dataUrl = "data:<mediaType>;base64,<data>"
        const commaIdx = dataUrl.indexOf(',');
        const meta = dataUrl.slice(0, commaIdx);
        const data = dataUrl.slice(commaIdx + 1);
        const mediaType = meta.replace('data:', '').replace(';base64', '');
        setAttachments(prev => [...prev, { name: file.name, mediaType, data }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const text = inputValue.trim();
    if ((!text && attachments.length === 0) || isStreaming) return;
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    // Auto-set title from first user message (matches VS Code plugin behaviour)
    if (!sessionTitle && text && items.length === 0) {
      const auto = text.length > 60 ? `${text.slice(0, 57)}…` : text;
      setSessionTitle(auto);
    }

    const snapshotAttachments = attachments;
    setAttachments([]);

    setItems(prev => [...prev, { id: uid(), kind: 'user', text: text || '(image)', attachments: snapshotAttachments }]);

    if (snapshotAttachments.length === 0) {
      sendRaw({ type: 'user', content: text });
    } else {
      const blocks: unknown[] = [];
      if (text) blocks.push({ type: 'text', text });
      for (const att of snapshotAttachments) {
        blocks.push({ type: 'image', source: { type: 'base64', mediaType: att.mediaType, data: att.data } });
      }
      sendRaw({ type: 'user', content: blocks });
    }
  }, [inputValue, attachments, isStreaming, sendRaw]);

  // ── Slash command menu ──────────────────────────────────────────────────────

  const selectSlashCommand = useCallback((name: string) => {
    setSlashMenuDismissed(true);
    setSlashMenuIdx(0);
    setInputValue('');
    const text = `/${name}`;
    setItems(prev => [...prev, { id: uid(), kind: 'user', text }]);
    sendRaw({ type: 'user', content: text });
  }, [sendRaw]);

  // BoltzHub group — hardcoded; actions replicate the VSCode extension workflow
  const boltzHubCmds: SlashCommand[] = [
    {
      id: 'new-from-template',
      label: 'New App from Template',
      description: 'Create a new app from a template',
      iconType: 'sparkle',
      iconColor: '#facc15',
      action: () => {
        setSlashMenuDismissed(true); setSlashMenuIdx(0); setInputValue('');
        window.open('https://boltzbit.com', '_blank');
      },
    },
    {
      id: 'push-project',
      label: 'Push project',
      description: 'Upload project to BoltzHub',
      iconType: 'cloud-up',
      iconColor: '#60a5fa',
      action: () => {
        setSlashMenuDismissed(true); setSlashMenuIdx(0); setInputValue('');
        // Check login + app config, then show the right modal
        fetch(`${AGENT_HTTP_BASE}/boltzhub/check?cwd=${encodeURIComponent(activeCwd)}`)
          .then(r => r.json())
          .then((d: { isLoggedIn: boolean; hasAppConfig: boolean; appConfig?: { id: string; name: string } }) => {
            if (!d.isLoggedIn) {
              setItems(prev => [...prev, { id: uid(), kind: 'assistant', blocks: [{ type: 'text', text: 'Not logged in to BoltzHub. Run `bzcode` in a terminal and log in first.' }] }]);
              return;
            }
            if (!d.hasAppConfig) {
              setBzHubModal({ type: 'create-app', cwd: activeCwd });
            } else {
              setBzHubModal({ type: 'release-notes', cwd: activeCwd, appId: d.appConfig!.id, appName: d.appConfig!.name });
            }
          })
          .catch(() => setBzHubModal({ type: 'create-app', cwd: activeCwd }));
      },
    },
    {
      id: 'sync-project',
      label: 'Sync project',
      description: 'Download project from BoltzHub',
      iconType: 'cloud-down',
      iconColor: '#2dd4bf',
      action: () => {
        setSlashMenuDismissed(true); setSlashMenuIdx(0); setInputValue('');
        setBzHubModal({ type: 'sync', cwd: activeCwd });
      },
    },
    {
      id: 'token-usage',
      label: 'Token usage',
      description: 'Check your BoltzHub token usage',
      iconType: 'chart',
      iconColor: '#a78bfa',
      action: () => {
        setSlashMenuDismissed(true); setSlashMenuIdx(0); setInputValue('');
        setBzHubModal({ type: 'token-usage', period: '30d' });
      },
    },
  ];

  // Code group — bzcode CLI commands from session handshake
  const codeCmds: SlashCommand[] = availableCommands.map(cmd => ({
    id: cmd.name,
    label: `/${cmd.name}`,
    description: cmd.description,
    iconType: 'terminal' as const,
    iconColor: 'var(--text-tertiary)',
    action: () => selectSlashCommand(cmd.name),
  }));

  const commandGroups: SlashCommandGroup[] = [
    { title: 'BoltzHub', commands: boltzHubCmds },
    { title: 'Code',     commands: codeCmds },
  ];

  const slashFilter    = inputValue.startsWith('/') ? inputValue.slice(1).toLowerCase() : '';
  const filteredGroups = commandGroups.map(g => ({
    ...g,
    commands: g.commands.filter(c =>
      !slashFilter ||
      c.label.toLowerCase().includes(slashFilter) ||
      c.description.toLowerCase().includes(slashFilter)
    ),
  })).filter(g => g.commands.length > 0);
  const flatFiltered   = filteredGroups.flatMap(g => g.commands);
  const showSlashMenu  = inputValue.startsWith('/') && !isStreaming && !slashMenuDismissed && flatFiltered.length > 0;
  const safeIdx        = Math.min(slashMenuIdx, Math.max(0, flatFiltered.length - 1));

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashMenuIdx(i => Math.min(i + 1, flatFiltered.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashMenuIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Escape')    { e.preventDefault(); setSlashMenuDismissed(true); return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const cmd = flatFiltered[safeIdx];
        if (cmd) { cmd.action(); return; }
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const cmd = flatFiltered[safeIdx];
        if (cmd) setInputValue('/' + cmd.id);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  const allItems = isStreaming && streamingBlocks.length > 0
    ? [...items, { id: '__streaming__', kind: 'assistant' as const, blocks: streamingBlocks }]
    : items;

  const modeColor = MODE_META[mode].color;

  // ── Session list (early return — all hooks above already ran) ────────────────
  if (view === 'list') {
    return (
      <div className="agent-page">
        <SessionListPage
          onSelect={(sessionId, cwd) => {
            setActiveSessionId(sessionId);
            setActiveCwd(cwd);
            setActiveDirName(cwd.split('/').filter(Boolean).pop() ?? cwd);
            setView('chat');
          }}
          onNew={(cwd) => {
            setActiveSessionId(null);
            setActiveCwd(cwd);
            setActiveDirName(cwd.split('/').filter(Boolean).pop() ?? cwd);
            setView('chat');
          }}
        />
      </div>
    );
  }

  // ── Chat view ────────────────────────────────────────────────────────────────
  return (
    <div className="agent-page" data-mode={mode}>
      {/* Batch queue banner */}
      {batchQueue.length > 0 && (
        <div className="agent-batch-banner">
          <span>Also queued for {batchQueue.length} other project{batchQueue.length !== 1 ? 's' : ''}:</span>
          {batchQueue.map((item, i) => (
            <button key={i} type="button" className="agent-batch-link"
              onClick={() => {
                sessionStorage.setItem('agent:pendingCwd', item.cwd);
                if (item.message) sessionStorage.setItem('agent:pendingMessage', item.message);
                const remaining = batchQueue.filter((_, j) => j !== i);
                if (remaining.length > 0) sessionStorage.setItem('agent:batchQueue', JSON.stringify(remaining));
                setBatchQueue(remaining);
                setActiveCwd(item.cwd);
                setActiveDirName(item.cwd.split('/').filter(Boolean).pop() ?? item.cwd);
                setActiveSessionId(null);
                setView('chat');
                if (item.message) setInputValue(item.message);
              }}>
              {item.cwd.split('/').filter(Boolean).pop()}
            </button>
          ))}
          <button type="button" className="agent-batch-dismiss" onClick={() => setBatchQueue([])}><XIcon size={12} /></button>
        </div>
      )}
      {/* Header */}
      <div className="agent-header">
        {/* Breadcrumb — exact bz-codespace pattern: [← NavItem] [/] [page-name] */}
        <div className="agent-breadcrumb">
          <button
            type="button"
            className="agent-breadcrumb-back"
            onClick={() => setView('list')}
            title="Back to sessions"
          >
            <ArrowLeftIcon size={14} />
            Agent
          </button>
          <span className="agent-breadcrumb-sep">/</span>
          <span className="agent-breadcrumb-page" title={activeCwd}>
            {activeDirName || '—'}
          </span>
          {sessionTitle && !isEditingTitle && (
            <>
              <span className="agent-breadcrumb-sep">·</span>
              <span
                className="agent-session-title"
                title="Click to rename"
                onClick={() => { setEditingTitleValue(sessionTitle); setIsEditingTitle(true); }}
              >
                {sessionTitle}
              </span>
            </>
          )}
          {isEditingTitle && (
            <input
              ref={titleInputRef}
              className="agent-title-input"
              value={editingTitleValue}
              autoFocus
              onChange={e => setEditingTitleValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); saveTitle(editingTitleValue); }
                if (e.key === 'Escape') { setIsEditingTitle(false); }
              }}
              onBlur={() => saveTitle(editingTitleValue)}
            />
          )}
        </div>

        {/* View mode toggle */}
        <div className="agent-view-toggle">
          <button
            type="button"
            className={`agent-view-btn${!canvasMode ? ' agent-view-btn--active' : ''}`}
            onClick={() => setCanvasMode(false)}
          >
            <ChatCircleDotsIcon size={13} />
            Chat
          </button>
          <button
            type="button"
            className={`agent-view-btn${canvasMode ? ' agent-view-btn--active' : ''}`}
            onClick={() => setCanvasMode(true)}
          >
            <SquaresFourIcon size={13} />
            Canvas
          </button>
        </div>

        <div className={`agent-connection agent-connection--${connStatus}`}>
          <span className="agent-connection-dot" />
          {{ connecting: 'Connecting…', connected: 'Connected', error: 'Error', disconnected: 'Disconnected' }[connStatus]}
        </div>

        {/* Conversations panel — anchored to far right so it never overlaps the breadcrumb */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            className={`agent-ctrl-btn${showConversations ? ' agent-ctrl-btn--active' : ''}`}
            title="Conversations"
            onClick={() => setShowConversations(v => !v)}
          >
            <ClockCounterClockwiseIcon size={15} />
          </button>
          {showConversations && (
            <ConversationsPanel
              cwd={activeCwd}
              activeSessionId={activeSessionId}
              httpBase={HTTP_BASE}
              onSelect={sessionId => {
                setActiveSessionId(sessionId);
                setView('chat');
              }}
              onNew={() => {
                setActiveSessionId(null);
                setView('chat');
                setShowConversations(false);
              }}
              onClose={() => setShowConversations(false)}
            />
          )}
        </div>
      </div>

      {/* Body — flex row in canvas mode, column in chat-only mode */}
      <div className={canvasMode ? 'agent-canvas-layout' : 'agent-chat-col'}>
      <div className="agent-chat-col">

      {/* Messages wrapper — position:relative so the sticky overlay anchors here, not inside the scrollable area */}
      <div className="agent-messages-wrapper">
        {/* Sticky overlay is a SIBLING of the scroll container so it doesn't scroll with content */}
        {stickyMsgIdx !== -1 && allItems[stickyMsgIdx]?.kind === 'user' && (
          <div
            ref={stickyOverlayRef}
            className="agent-sticky-overlay"
            style={{ transform: `translateY(${stickyTranslateY}px)` }}
          >
            <div className="agent-sticky-inner">
              <StickyLastPrompt
              text={(allItems[stickyMsgIdx] as Extract<DisplayItem, { kind: 'user' }>).text}
              attachments={(allItems[stickyMsgIdx] as Extract<DisplayItem, { kind: 'user' }>).attachments}
            />
            </div>
            <div className="agent-sticky-fade" />
          </div>
        )}

        <div ref={scrollRef} className="chat-messages">
        {allItems.length === 0 ? (
          <div className="chat-empty">
            {/* Resuming a session: infinite pulse while loading history */}
            {connStatus === 'connecting' && activeSessionId && (
              <>
                <BoltzbitLogo key={wsUrl} size={40} className="boltzbit-logo-animate" />
                <p className="chat-loading-label">Loading chat history…</p>
              </>
            )}

            {/* New chat opening: one-shot settling pulse (matches VSCode new-tab animation) */}
            {(connStatus === 'connecting' && !activeSessionId) ||
             connStatus === 'connected' ? (
              <>
                <BoltzbitLogo
                  key={wsUrl}
                  size={40}
                  className="boltzbit-logo-animate-settling"
                />
                <p className="chat-loading-label chat-loading-label--ready">
                  {activeDirName
                    ? `Working in ${activeDirName} — what can I help you with?`
                    : 'What can I help you with?'}
                </p>
              </>
            ) : null}

            {/* Error / disconnected */}
            {(connStatus === 'error' || connStatus === 'disconnected') && (
              <>
                <BoltzbitLogo size={40} />
                <p className="chat-loading-label" style={{ color: 'var(--accent-red)' }}>
                  {connStatus === 'error' ? 'Connection failed' : 'Disconnected'}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="chat-messages-inner">
            {allItems.map((item, idx) => {
              if (item.kind === 'user') return (
                <div key={item.id} data-user-msg-idx={idx}>
                  <div className="agent-user-msg animate-slide-in">
                    {item.attachments && item.attachments.length > 0 && (
                      <div className="agent-attach-chips">
                        {item.attachments.map((att, i) => (
                          <span key={i} className="agent-attach-chip">
                            <img src={`data:${att.mediaType};base64,${att.data}`} alt={att.name} className="agent-attach-thumb" />
                            <span className="agent-attach-name">{att.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {item.text !== '(image)' && item.text}
                  </div>
                </div>
              );

              if (item.kind === 'assistant') {
                const isLive = item.id === '__streaming__';
                return (
                  <div key={item.id} className="chat-message">
                    {item.blocks.map((block, j) => {
                      if (block.type === 'text') {
                        const cmdList = parseCommandListOutput(block.text);
                        if (cmdList) return <CommandListDisplay key={j} result={cmdList} />;
                        return (
                          <div key={j} className="agent-msg-row">
                            <span className="agent-block-icon"><BlockDot size={10} /></span>
                            <div
                              className="chat-bubble-assistant"
                              dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(block.text) }}
                            />
                          </div>
                        );
                      }
                      if (block.type === 'thinking') return (
                        <details key={j} className="agent-thinking">
                          <summary className={`agent-thinking-summary${isLive ? ' agent-thinking-summary--live' : ''}`}>
                            <TriangleCubes className="agent-thinking-marker" />
                            <span>Thinking…</span>
                          </summary>
                          <div
                            className="agent-thinking-content"
                            dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(block.text) }}
                          />
                        </details>
                      );
                      return null;
                    })}
                  </div>
                );
              }

              if (item.kind === 'tool')          return <ToolCard key={item.id} item={item} />;
              if (item.kind === 'push-progress') return <PushProgressCard key={item.id} item={item} />;
              if (item.kind === 'sync-progress') return <SyncProgressCard key={item.id} item={item} />;

              return null;
            })}

            {isStreaming && streamingBlocks.length === 0 && (
              <BoltzingIndicator />
            )}
          </div>
        )}
        </div>
      </div>

      {/* Sticky prompt cards — rendered above input bar */}
      {(pendingPermission || pendingInput) && (
        <div className="agent-prompt-overlay">
          {pendingPermission && (
            <PermissionCard
              prompt={pendingPermission}
              mode={mode}
              onRespond={handlePermission}
              onDismiss={() => setPendingPermission(null)}
            />
          )}
          {pendingInput && (
            <InputPromptCard
              prompt={pendingInput}
              mode={mode}
              onAnswer={handleInputAnswer}
              onDismiss={() => setPendingInput(null)}
            />
          )}
        </div>
      )}

      {/* Slash command menu — appears above the input bar */}
      {showSlashMenu && (
        <div className="slash-menu">
          <div className="slash-menu-list">
            {filteredGroups.map(group => (
              <div key={group.title} className="slash-menu-group">
                <div className="slash-menu-section">{group.title}</div>
                {group.commands.map(cmd => {
                  const flatIdx = flatFiltered.findIndex(c => c.id === cmd.id);
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      className={`slash-menu-item${flatIdx === safeIdx ? ' slash-menu-item--selected' : ''}`}
                      onClick={() => cmd.action()}
                      onMouseEnter={() => setSlashMenuIdx(flatIdx)}
                    >
                      <span className="slash-menu-icon">
                        <SlashIcon type={cmd.iconType} color={cmd.iconColor} />
                      </span>
                      <span className="slash-menu-name">{cmd.label}</span>
                      <span className="slash-menu-desc">{cmd.description}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="agent-input-bar">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        <div
          className="agent-input-box"
          style={{ '--mode-color': modeColor } as React.CSSProperties}
        >
          {/* Attachment chips preview */}
          {attachments.length > 0 && (
            <div className="agent-attach-chips agent-attach-chips--input">
              {attachments.map((att, i) => (
                <span key={i} className="agent-attach-chip">
                  <img src={`data:${att.mediaType};base64,${att.data}`} alt={att.name} className="agent-attach-thumb" />
                  <span className="agent-attach-name">{att.name}</span>
                  <button
                    type="button"
                    className="agent-attach-remove"
                    onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                    aria-label="Remove"
                  >
                    <XIcon size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="agent-input-textarea"
            placeholder={isStreaming ? 'Running…' : 'Ask the agent…'}
            value={inputValue}
            rows={1}
            disabled={isStreaming}
            onChange={e => { setInputValue(e.target.value); setSlashMenuDismissed(false); setSlashMenuIdx(0); }}
            onKeyDown={handleKeyDown}
          />

          {/* Control row */}
          <div className="agent-input-controls">
            {/* Attach image */}
            <button
              type="button"
              className="agent-ctrl-btn"
              title="Attach image"
              onClick={() => fileInputRef.current?.click()}
            >
              <PaperclipIcon size={15} />
            </button>
            <span className="agent-ctrl-divider" />

            {/* Token stats */}
            {tokenUsage && (
              <span className="agent-token-stats" title="Accumulated token usage for this session">
                in {formatNum(tokenUsage.inputTokens)} · out {formatNum(tokenUsage.outputTokens)}
                {tokenUsage.bzTokens ? ` · bz ${formatNum(tokenUsage.bzTokens)}` : ''}
              </span>
            )}

            {/* Spacer */}
            <span style={{ flex: 1 }} />

            {/* Mode selector */}
            <div className="agent-mode-wrapper">
              <button
                type="button"
                className="agent-ctrl-btn agent-mode-btn"
                onClick={() => setModeDropdownOpen(o => !o)}
                title={`Mode: ${MODE_META[mode].label}`}
              >
                {mode === 'plan'  && <ListChecksIcon size={13} color={modeColor} />}
                {mode === 'yolo'  && <LightningIcon  size={13} color={modeColor} weight="fill" />}
                {mode === 'default' && <span className="agent-mode-dot-sm" style={{ background: modeColor }} />}
                <span className="agent-mode-label-sm" style={{ color: modeColor }}>{MODE_META[mode].label}</span>
                <CaretDownIcon size={10} />
              </button>
              {modeDropdownOpen && (
                <ModeDropdown
                  mode={mode}
                  availableModes={availableModes}
                  onSelect={handleModeChange}
                  onClose={() => setModeDropdownOpen(false)}
                />
              )}
            </div>

            {/* Submit / Stop */}
            {isStreaming ? (
              <button
                type="button"
                className="agent-submit-btn"
                style={{ background: modeColor }}
                onClick={handleAbort}
                title="Stop"
              >
                <SquareIcon size={14} weight="fill" />
              </button>
            ) : (
              <button
                type="button"
                className="agent-submit-btn"
                style={{ background: (!inputValue.trim() && attachments.length === 0) ? undefined : modeColor }}
                onClick={handleSubmit}
                disabled={!inputValue.trim() && attachments.length === 0}
                title="Send"
              >
                <ArrowUpIcon size={14} weight="bold" />
              </button>
            )}
          </div>
        </div>
      </div>

      </div>

      {canvasMode && <CanvasPanel cwd={activeCwd} />}
    </div>

    {/* BoltzHub modals — rendered inside agent-page so they overlay the chat */}
    {(() => {
      const m = bzHubModal;
      if (!m) return null;
      if (m.type === 'create-app') return (
        <CreateAppModal
          cwd={m.cwd}
          agentHttp={AGENT_HTTP_BASE}
          onClose={() => setBzHubModal(null)}
          onCreated={cfg => setBzHubModal({ type: 'release-notes', cwd: m.cwd, appId: cfg.id, appName: cfg.name })}
        />
      );
      if (m.type === 'release-notes') return (
        <ReleaseNotesModal
          appName={m.appName}
          appId={m.appId}
          onClose={() => setBzHubModal(null)}
          onPush={(notes, version) => void startPush(m.cwd, notes, version)}
        />
      );
      if (m.type === 'sync') return (
        <SyncModal
          agentHttp={AGENT_HTTP_BASE}
          onClose={() => setBzHubModal(null)}
          onSync={appId => void startSync(m.cwd, appId)}
        />
      );
      if (m.type === 'token-usage') return (
        <TokenUsageModal
          data={m}
          onClose={() => setBzHubModal(null)}
        />
      );
      return null;
    })()}
    </div>
  );
}
