import { parseMarkdownToHTML } from '@boltzbit/md-utils';
import { BoltzbitLogo } from '#/components/BoltzbitLogo';
import { IframeWidget } from '#/components/IframeWidget';
import { WIDGET_REGISTRY, REGISTRY_MAP, type WidgetKind } from '#/lib/widgetRegistry';
import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  CaretDownIcon,
  ChartBarIcon,
  ChatCircleDotsIcon,
  CopyIcon,
  FolderIcon,
  MagnifyingGlassIcon,
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
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AGENT_MODES, modeLSKey, type AgentMode } from '#/lib/agentModes';
import { ModeBadge }    from '#/components/ModeBadge';
import { ModeSelector } from '#/components/ModeSelector';
import { ModeIconSvg, MODE_COLORS } from '#/components/ModeIconSvg';
import { EditorPanel }  from '#/components/EditorPanel';

export const Route = createFileRoute('/_app/agent')({
  validateSearch: (search: Record<string, unknown>): { cwd?: string; sessionId?: string; mode?: AgentMode } => ({
    ...(typeof search['cwd']       === 'string' && search['cwd']       ? { cwd:       search['cwd'] as string }       : {}),
    ...(typeof search['sessionId'] === 'string' && search['sessionId'] ? { sessionId: search['sessionId'] as string } : {}),
    ...(typeof search['mode']      === 'string' && AGENT_MODES.includes(search['mode'] as AgentMode) ? { mode: search['mode'] as AgentMode } : {}),
  }),
  component: AgentPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionMode = 'default' | 'plan' | 'yolo';
type AssistantBlock = { type: 'text' | 'thinking'; text: string };
type Attachment   = { name: string; mediaType: string; data: string };
type DocAttachment = { kind: 'doc'; name: string; docType: string; pages: number; wordCount: number; content: string; truncated: boolean; loading?: boolean };
type AnyAttachment = Attachment | DocAttachment;

const DOC_EXTS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']);
function isDocFile(name: string) { return DOC_EXTS.has(name.slice(name.lastIndexOf('.')).toLowerCase()); }
function isDocAttachment(a: AnyAttachment): a is DocAttachment { return (a as DocAttachment).kind === 'doc'; }

type PushStep = 'build' | 'archive' | 'upload' | 'deploy' | 'publish' | 'done' | 'error';
type SyncStep = 'download' | 'extract' | 'install' | 'done' | 'error';

type DisplayItem =
  | { id: string; kind: 'user'; text: string; attachments?: AnyAttachment[] }
  | { id: string; kind: 'assistant'; blocks: AssistantBlock[] }
  | { id: string; kind: 'tool'; toolUseId: string; name: string; status: 'running' | 'done' | 'error'; input: unknown; output?: string; isError?: boolean }
  | { id: string; kind: 'push-progress'; step: PushStep; message: string; serviceUrl?: string; appId?: string }
  | { id: string; kind: 'sync-progress'; step: SyncStep; message: string }
  | { id: string; kind: 'compact-summary'; text: string }
  | { id: string; kind: 'system'; message: string };

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

// In production (dist served by Python on port 18789), derive URLs from current origin.
const HTTP_BASE = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined)
  || (import.meta.env.PROD ? window.location.origin : 'http://localhost:18789');
const WS_BASE   = (import.meta.env.VITE_AGENT_WS_URL   as string | undefined)
  || (import.meta.env.PROD
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
    : 'ws://localhost:18789/ws');

const MODE_META: Record<SessionMode, { label: string; description: string; color: string }> = {
  default: { label: 'Default', description: 'Normal operation', color: 'var(--accent-blue)' },
  plan:    { label: 'Plan',    description: 'Read-only planning mode', color: '#e67e22' },
  yolo:    { label: 'YOLO',   description: 'Auto-allow all tools', color: '#e74c3c' },
};

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

// ── Live Learning components ─────────────────────────────────────────────────

function LlBrainIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    </svg>
  );
}

const LL_METRICS = [
  { label: 'accuracy',    value: (g: { accuracy: number; quality: number }) => `+${g.accuracy}%` },
  { label: 'quality',     value: (g: { accuracy: number; quality: number }) => `${g.quality}%` },
  { label: 'efficiency',  value: (_g: { accuracy: number; quality: number }) => '+18.2%' },
  { label: 'adaptation',  value: (_g: { accuracy: number; quality: number }) => '+11.5%' },
  { label: 'latency',     value: (_g: { accuracy: number; quality: number }) => '−0.3s' },
];

function LlEvalBadge({ gain }: { gain: { accuracy: number; quality: number } }) {
  const [idx,     setIdx]     = useState(0);
  const [open,    setOpen]    = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Rotate metric every 2.5s
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % LL_METRICS.length), 2500);
    return () => clearInterval(id);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const metric = LL_METRICS[idx]!;

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        className="ll-eval-badge"
        onClick={() => setOpen(o => !o)}
        title="Live Learning results"
      >
        <LlBrainIcon size={11} />
        <span key={idx} className="ll-eval-metric-val">{metric.value(gain)}</span>
        <span className="ll-eval-badge-sep">{metric.label}</span>
        <svg viewBox="0 0 24 24" width="9" height="9" stroke="currentColor" strokeWidth="2.5" fill="none" style={{ opacity: 0.6 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="ll-eval-dropdown">
          <div className="ll-eval-dropdown-header">Live Learning · latest job</div>
          {LL_METRICS.map((m, i) => (
            <a key={i} href="/learning" className="ll-eval-dropdown-item" onClick={() => setOpen(false)}>
              <span className="ll-eval-dropdown-label">{m.label}</span>
              <span className="ll-eval-dropdown-val">{m.value(gain)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const LL_TRAINING_SAMPLES = [
  { role: 'user', text: 'Refactor this Python function to use async/await' },
  { role: 'agent', text: 'Here\'s the refactored version with aiohttp and proper error handling…' },
  { role: 'user', text: 'Create a bar chart widget showing monthly revenue' },
  { role: 'agent', text: 'Widget created at canvas position (200, 120) with Chart.js…' },
];

const LL_EVAL = { baseline: 71.2, newAcc: 84.6, quality: 91.3, rounds: 10 };

function LiveLearningNotification({
  stage,
  gain,
  onDismiss,
  onViewPage,
}: {
  stage: 'collecting' | 'training' | 'done';
  gain: { accuracy: number; quality: number };
  onDismiss: () => void;
  onViewPage: () => void;
}) {
  // Always start minimised — user clicks the strip to expand manually
  const [expanded, setExpanded] = useState(false);

  const barWidth = stage === 'collecting' ? '35%' : stage === 'training' ? '75%' : '100%';
  const statusText =
    stage === 'collecting' ? 'Collecting training data…' :
    stage === 'training'   ? 'Fine-tuning · est. 1–2 min…' :
                             'Job complete ✓';

  return (
    <div className={`ll-notif${expanded ? '' : ' ll-notif--mini'}`}>
      {/* Always-visible collapsed strip — click to expand */}
      <div className="ll-notif-strip" onClick={() => setExpanded(v => !v)}>
        <LlBrainIcon size={12} />
        <span className="ll-notif-title">{statusText}</span>
        <div className="ll-notif-bar-wrap ll-notif-bar-wrap--inline">
          <div className={`ll-notif-bar${stage === 'done' ? ' ll-notif-bar--done' : ''}`} style={{ width: barWidth }} />
        </div>
        <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="2.5" fill="none"
          style={{ flexShrink: 0, opacity: 0.5, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <button type="button" className="ll-notif-close" onClick={e => { e.stopPropagation(); onDismiss(); }}>✕</button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="ll-notif-detail">
          {stage === 'collecting' && (
            <>
              <p className="ll-notif-caption">Saving the last 10 conversation rounds as training data…</p>
              <div className="ll-notif-samples">
                {LL_TRAINING_SAMPLES.map((s, i) => (
                  <div key={i} className={`ll-notif-sample ll-notif-sample--${s.role}`}>
                    <span className="ll-notif-sample-role">{s.role}</span>
                    <span className="ll-notif-sample-text">{s.text}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {stage === 'training' && (
            <>
              <p className="ll-notif-caption">Fine-tuning on {LL_EVAL.rounds} rounds · estimating 1–2 min…</p>
              <div className="ll-notif-training-stats">
                <span>Baseline accuracy <strong>{LL_EVAL.baseline}%</strong></span>
                <span className="ll-notif-pulse">⟳ adjusting weights…</span>
              </div>
            </>
          )}

          {stage === 'done' && (
            <>
              <div className="ll-notif-results">
                {LL_METRICS.map((m, i) => (
                  <div key={i} className="ll-notif-result-item ll-notif-result-item--good">
                    <span className="ll-notif-result-val">{m.value(gain)}</span>
                    <span className="ll-notif-result-lbl">{m.label}</span>
                  </div>
                ))}
              </div>
              <button type="button" className="ll-notif-view-btn" onClick={onViewPage}>
                View training data →
              </button>
            </>
          )}
        </div>
      )}
    </div>
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

// ── Compact summary card ──────────────────────────────────────────────────────

function CompactSummaryCard({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // Strip the outer <context-summary> tags if present
  const inner = text.replace(/^\s*<context-summary>\s*/i, '').replace(/\s*<\/context-summary>\s*$/i, '').trim();
  return (
    <div className="compact-summary-card">
      <div className="compact-summary-header" onClick={() => setExpanded(v => !v)}>
        <BoltzbitLogo size={11} />
        <span className="compact-summary-label">Conversation compacted</span>
        <span className="compact-summary-toggle">{expanded ? '▲ Hide summary' : '▼ Show summary'}</span>
      </div>
      {expanded && (
        <div className="compact-summary-body" dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(inner) }} />
      )}
    </div>
  );
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
  const agentHttp = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:18789';

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
  const agentHttp = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:18789';

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

// Extract document file paths from agent message text
const DOC_PATH_RE = /(?:^|[\s`"'(])((\/[^\s`"'()]+|[a-zA-Z0-9._\-]+)\.(?:docx?|xlsx?|pptx?|pdf))(?:[\s`"'().,]|$)/gm;
function extractDocPaths(text: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  DOC_PATH_RE.lastIndex = 0;
  while ((m = DOC_PATH_RE.exec(text)) !== null) found.add(m[1]);
  return Array.from(found);
}

// Detect canvasIds in agent text — e.g. "cw-855f9ac8088a" or "(cw-855f9ac8088a)"
const WIDGET_ID_RE = /\b(cw-[0-9a-f]{10,14})\b/gi;
function extractWidgetIds(text: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  WIDGET_ID_RE.lastIndex = 0;
  while ((m = WIDGET_ID_RE.exec(text)) !== null) found.add(m[1].toLowerCase());
  return Array.from(found);
}

function CopyPathButton({ path, label }: { path: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    if (!path) return;
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      type="button"
      className="agent-breadcrumb-page agent-breadcrumb-copy"
      title={copied ? 'Copied!' : path}
      onClick={handleCopy}
    >
      {label}
      {copied && <span className="agent-breadcrumb-copied">✓ copied</span>}
    </button>
  );
}

function CopyPathInline({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="agent-session-path" title={copied ? 'Copied!' : path} onClick={handleCopy}>
      <span className="agent-session-path-text">{path}</span>
      <span className={`agent-session-path-copy${copied ? ' agent-session-path-copy--done' : ''}`}>
        {copied ? '✓' : <CopyIcon size={11} />}
      </span>
    </div>
  );
}

function WidgetSkillBadge({ item }: { item: Extract<DisplayItem, { kind: 'tool' }> }) {
  const skillName = (item.input as Record<string, unknown>)?.['skill'] as string | undefined;
  const label = skillName ? `/${skillName}` : item.name;
  const statusIcon = item.status === 'running'
    ? <SpinnerIcon size={10} className="agent-tool-spin" />
    : item.isError
      ? <XCircleIcon size={10} weight="fill" color="var(--accent-red)" />
      : <CheckCircleIcon size={10} weight="fill" color="var(--accent-green)" />;
  return (
    <div className="agent-msg-row">
      <span className="agent-block-icon agent-block-icon--tool"><BlockDot size={10} /></span>
      <div className="widget-skill-badge">
        <TerminalIcon size={10} weight="bold" />
        <span className="widget-skill-badge-name">{label}</span>
        {statusIcon}
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

const GAP = 6;        // gap between widgets (small — less jumping during auto-adjust)
const SNAP = 16;      // drag/resize grid snap
const CANVAS_PAD = 24; // padding from canvas edge

// Snap a value to the nearest grid point
function snapVal(v: number): number { return Math.round(v / SNAP) * SNAP; }

// ── Gravity ───────────────────────────────────────────────────────────────────
// Pull all widgets upward to fill gaps, like vertical compaction.
// fixedId: this widget keeps its position; others flow around it.
function applyGravity(widgets: WidgetData[], fixedId?: string): WidgetData[] {
  if (widgets.length === 0) return widgets;

  const fixed = fixedId ? widgets.find(w => w.id === fixedId) : null;

  // Process top-to-bottom so widgets above settle first
  const sorted = [...widgets].map(w => ({ ...w })).sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: WidgetData[] = [];

  for (const w of sorted) {
    if (w.id === fixedId && fixed) {
      // Fixed widget stays exactly where it is
      placed.push({ ...w });
      continue;
    }
    let targetY = CANVAS_PAD;
    // Find the lowest y we can place w without overlapping anything already placed
    for (const p of placed) {
      const xOverlap = p.x + p.w + GAP > w.x && w.x + w.w + GAP > p.x;
      if (xOverlap) targetY = Math.max(targetY, p.y + p.h + GAP);
    }
    placed.push({ ...w, y: targetY });
  }
  // Restore original order so IDs remain stable
  const byId = Object.fromEntries(placed.map(w => [w.id, w]));
  return widgets.map(w => byId[w.id] ?? w);
}

// ── First-fit spawn placement ─────────────────────────────────────────────────
// Finds the first available top-left position for a new widget (not diagonal cascade).
function findSpawnPos(existing: WidgetData[], newW: number, newH: number, canvasW = 1400): { x: number; y: number } {
  const step = SNAP;
  const maxX  = Math.max(CANVAS_PAD, canvasW - newW - CANVAS_PAD);

  for (let y = CANVAS_PAD; y < 4000; y += step) {
    for (let x = CANVAS_PAD; x <= maxX; x += step) {
      const fits = existing.every(w =>
        x + newW + GAP <= w.x || w.x + w.w + GAP <= x ||
        y + newH + GAP <= w.y || w.y + w.h + GAP <= y,
      );
      if (fits) return { x, y };
    }
  }
  return { x: CANVAS_PAD, y: CANVAS_PAD };
}

// ── Auto-arrange (Tidy) ───────────────────────────────────────────────────────
// Packs widgets into a clean row-wrapping layout, left-to-right, top-to-bottom,
// matching each widget's natural column width.  Like a masonry grid.
function autoArrange(widgets: WidgetData[], canvasW = 1400): WidgetData[] {
  if (widgets.length === 0) return widgets;
  // Sort by current position so we respect the user's intended order
  const sorted = [...widgets].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
  const result: WidgetData[] = [];
  let rowX = CANVAS_PAD;
  let rowY = CANVAS_PAD;
  let rowH = 0;

  for (const w of sorted) {
    // Wrap to next row if widget doesn't fit
    if (rowX + w.w > canvasW - CANVAS_PAD && rowX > CANVAS_PAD) {
      rowX  = CANVAS_PAD;
      rowY += rowH + GAP;
      rowH  = 0;
    }
    result.push({ ...w, x: rowX, y: rowY });
    rowX += w.w + GAP;
    rowH  = Math.max(rowH, w.h);
  }
  // Restore original array order
  const byId = Object.fromEntries(result.map(w => [w.id, w]));
  return widgets.map(w => byId[w.id] ?? w);
}

// ── Legacy collision resolver (used as fallback during resize) ────────────────
function resolveOverlaps(widgets: WidgetData[], fixedId?: string): WidgetData[] {
  const PAD = GAP;
  const result = widgets.map(w => ({ ...w }));
  for (let iter = 0; iter < 60; iter++) {
    let anyOverlap = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i]!; const b = result[j]!;
        if (a.x + a.w + PAD <= b.x || b.x + b.w + PAD <= a.x ||
            a.y + a.h + PAD <= b.y || b.y + b.h + PAD <= a.y) continue;
        anyOverlap = true;
        const aFixed = a.id === fixedId; const bFixed = b.id === fixedId;
        if (aFixed && bFixed) continue;
        const pushRight = (a.x + a.w + PAD) - b.x;
        const pushLeft  = (b.x + b.w + PAD) - a.x;
        const pushDown  = (a.y + a.h + PAD) - b.y;
        const pushUp    = (b.y + b.h + PAD) - a.y;
        const min = Math.min(pushRight, pushLeft, pushDown, pushUp);
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
  sessionId,
  onDragStart,
  onDrop,
  onResize,
  onClose,
  onShowCode,
}: {
  data: WidgetData;
  sessionId?: string | null;
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
    document.body.classList.add('canvas-dragging');

    // Find the canvas area once at drag-start so we can convert viewport
    // clientX/Y into canvas-local coordinates throughout the drag.
    const canvasEl = (elRef.current?.closest('.canvas-area') ?? null) as HTMLElement | null;
    const canvasRect = canvasEl?.getBoundingClientRect() ?? { left: 0, top: 0 };

    // Grab offset = where within the widget the user clicked, in canvas coords.
    // Formula: clientX - canvasRect.left + scrollLeft = canvas-local mouseX
    //          canvas-local mouseX - data.x            = offset from widget edge
    const grabX = e.clientX - canvasRect.left + (canvasEl?.scrollLeft ?? 0) - data.x;
    const grabY = e.clientY - canvasRect.top  + (canvasEl?.scrollTop  ?? 0) - data.y;

    function toCanvas(ev: MouseEvent) {
      // canvas-local position = viewport pos - canvas origin + scroll - grab offset
      const nx = Math.max(0, ev.clientX - canvasRect.left + (canvasEl?.scrollLeft ?? 0) - grabX);
      const ny = Math.max(0, ev.clientY - canvasRect.top  + (canvasEl?.scrollTop  ?? 0) - grabY);
      return { nx, ny };
    }

    function onMouseMove(ev: MouseEvent) {
      const { nx, ny } = toCanvas(ev);
      if (elRef.current) { elRef.current.style.left = `${nx}px`; elRef.current.style.top = `${ny}px`; }
    }
    function onMouseUp(ev: MouseEvent) {
      document.body.classList.remove('canvas-dragging');
      const { nx, ny } = toCanvas(ev);
      onDrop(data.id, nx, ny);
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
    document.body.classList.add('canvas-dragging');

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
      document.body.classList.remove('canvas-dragging');
      const { nx, ny, nw, nh } = calc(ev);
      onResize(data.id, nx, ny, nw, nh);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // Resolve the JS code: custom widgets carry their own code, builtins come from the registry.
  // For custom-kind widgets (deployed by the agent), data.code is loaded async — hold off
  // rendering the iframe until the code arrives to avoid flashing the CUSTOM_CODE clock placeholder.
  const agentHttp = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:18789';
  const isCustomKind = data.kind === 'custom';
  const code = data.code ?? (isCustomKind ? null : REGISTRY_MAP[data.kind]?.code ?? '');
  const content = code == null
    ? <div className="canvas-widget-loading" />
    : <IframeWidget code={code} agentHttpBase={agentHttp} canvasId={data.id} sessionId={sessionId} refreshKey={data.id} />;

  return (
    <div ref={elRef} className="canvas-widget" style={{ left: data.x, top: data.y, width: data.w, height: data.h }}>
      {/* Resize handles */}
      {RESIZE_HANDLES.map(h => (
        <div key={h} className={`canvas-resize-handle canvas-resize-handle--${h}`}
          onMouseDown={e => handleResizeMouseDown(e, h)} />
      ))}

      <div className="canvas-widget-header" onMouseDown={handleDragMouseDown}>
        <span className="canvas-widget-title">{data.title}</span>
        <span
          className="canvas-widget-id"
          title="Click to copy widget ID"
          onClick={e => {
            e.stopPropagation();
            navigator.clipboard.writeText(data.id).catch(() => null);
            const el = e.currentTarget as HTMLElement;
            const prev = el.textContent;
            el.textContent = 'copied!';
            setTimeout(() => { el.textContent = prev; }, 1200);
          }}
        >{data.id}</span>

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
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:18789';

// Canvas persistence — one .bzcanvas.json per working directory
type CanvasEntry = {
  canvasId: string;   // unique ID on this canvas instance
  widgetId: string;   // ID in the widget registry (kind for built-ins, canvasId for custom)
  kind:     string;
  title:    string;
  x: number; y: number; w: number; h: number;
};

const canvasApi = {
  load: (cwd: string, sessionId?: string | null) => {
    const params = new URLSearchParams({ cwd });
    if (sessionId) params.set('sessionId', sessionId);
    return fetch(`${AGENT_HTTP_BASE}/canvas?${params}`)
      .then(r => r.json()) as Promise<{ widgets: CanvasEntry[] }>;
  },

  save: (cwd: string, widgets: CanvasEntry[], sessionId?: string | null) => {
    const params = new URLSearchParams({ cwd });
    if (sessionId) params.set('sessionId', sessionId);
    return fetch(`${AGENT_HTTP_BASE}/canvas?${params}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, widgets }),
    }).then(r => r.json());
  },
};

// Per-instance custom code — stored in {sessionDir}/custom_widgets/{canvasId}.js
const customWidgetApi = {
  load: (canvasId: string, sessionId?: string | null): Promise<string | null> => {
    const params = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    return fetch(`${AGENT_HTTP_BASE}/custom-widgets/${encodeURIComponent(canvasId)}${params}`)
      .then(r => r.ok ? r.json() as Promise<{ code: string }> : null)
      .then(d => d?.code ?? null)
      .catch(() => null);
  },

  save: (canvasId: string, code: string, sessionId?: string | null): Promise<void> => {
    const params = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    return fetch(`${AGENT_HTTP_BASE}/custom-widgets/${encodeURIComponent(canvasId)}${params}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).then(() => undefined).catch(() => undefined);
  },

  remove: (canvasId: string, sessionId?: string | null): Promise<void> => {
    const params = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    return fetch(`${AGENT_HTTP_BASE}/custom-widgets/${encodeURIComponent(canvasId)}${params}`, {
      method: 'DELETE',
    }).then(() => undefined).catch(() => undefined);
  },
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

  const agentHttp = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:18789';

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

function CanvasPanel({ cwd, sessionId, refreshKey = 0 }: { cwd?: string; sessionId?: string | null; refreshKey?: number }) {
  const [canvasWidgets, setCanvasWidgets] = useState<WidgetData[]>([]);
  const [dragging,      setDragging]      = useState(false);
  const [apiWidgets,    setApiWidgets]    = useState<WidgetRecord[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [editingDef,    setEditingDef]    = useState<CustomWidgetDef | null>(null);
  const [showNewEditor,    setShowNewEditor]    = useState(false);
  const [showCredManager,  setShowCredManager]  = useState(false);
  const [widgetSearch,     setWidgetSearch]     = useState('');
  const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasAreaRef  = useRef<HTMLDivElement>(null);
  const [codeDrawer,    setCodeDrawer]    = useState<{ id: string; title: string; code: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Clear canvas immediately when session changes so stale widgets don't show during load
  useEffect(() => {
    setCanvasWidgets([]);
  }, [sessionId]);

  // Load saved canvas layout — only when sessionId is known (canvas is session-scoped)
  useEffect(() => {
    if (!cwd || !sessionId) return;
    canvasApi.load(cwd, sessionId)
      .then(({ widgets: entries }) => {
        if (!entries?.length) return;
        const PAD = 24;
        // Normalise positions: shift the whole group so the top-left widget
        // lands at (PAD, PAD), keeping relative positions intact.
        // This ensures the canvas always opens at origin with content visible.
        const minX = Math.min(...entries.map(e => e.x));
        const minY = Math.min(...entries.map(e => e.y));
        const dx   = PAD - minX;
        const dy   = PAD - minY;
        // For widgets where widgetId !== kind the code was edited via </>
        // and saved to server_data/custom_widgets/{canvasId}.js — fetch it.
        const baseWidgets = entries.map(e => ({
          id:    e.canvasId,
          kind:  e.kind as WidgetKind,
          title: e.title,
          x: e.x + dx, y: e.y + dy, w: e.w, h: e.h,
        }));
        setCanvasWidgets(baseWidgets);

        // Async: load custom code for any widget that has it saved
        const customEntries = entries.filter(e => e.widgetId !== e.kind);
        if (customEntries.length > 0) {
          Promise.all(
            customEntries.map(e =>
              customWidgetApi.load(e.canvasId, sessionId).then(code => ({ canvasId: e.canvasId, code }))
            )
          ).then(results => {
            setCanvasWidgets(prev => prev.map(w => {
              const hit = results.find(r => r.canvasId === w.id);
              return hit?.code ? { ...w, code: hit.code } : w;
            }));
          }).catch(() => null);
        }
      })
      .catch(() => { /* canvas file missing or server offline — start blank */ });
  // refreshKey increments after each agent turn so newly deployed widgets appear
  // sessionId must be included so the canvas reloads when a session is established
  }, [cwd, sessionId, refreshKey]);

  // Scroll to origin on the first render that has widgets, then hold that
  // position for 900 ms — long enough for all widget iframes to finish
  // loading their CDN scripts (Chart.js etc.), which can otherwise trigger
  // the browser to scroll the canvas-area to bring them into view.
  const initScrolledRef = useRef(false);
  // Reset scroll lock when refreshKey changes (agent deployed a new widget)
  useEffect(() => { initScrolledRef.current = false; }, [refreshKey]);
  useLayoutEffect(() => {
    if (canvasWidgets.length === 0 || initScrolledRef.current) return;
    initScrolledRef.current = true;
    const area = canvasAreaRef.current;
    if (!area) return;

    area.scrollTop  = 0;
    area.scrollLeft = 0;

    let locked = true;
    const hold = () => { if (locked) { area.scrollTop = 0; area.scrollLeft = 0; } };
    area.addEventListener('scroll', hold);
    const t = setTimeout(() => { locked = false; area.removeEventListener('scroll', hold); }, 900);
    return () => { clearTimeout(t); area.removeEventListener('scroll', hold); };
  }, [canvasWidgets]);

  // Debounced save: whenever the canvas layout changes, persist to <cwd>/.bzcanvas.json
  useEffect(() => {
    if (!cwd || !sessionId || canvasWidgets.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const entries: CanvasEntry[] = canvasWidgets.map(w => ({
        canvasId: w.id,
        // kind==='custom' widgets always use canvasId as widgetId so the frontend knows to fetch their code,
        // even before the async code load completes (avoids race-condition corruption on the debounce save).
        widgetId: (w.kind === 'custom' || w.code) ? w.id : w.kind,
        kind:     w.kind,
        title:    w.title,
        x: w.x, y: w.y, w: w.w, h: w.h,
      }));
      canvasApi.save(cwd, entries, sessionId).catch(() => { /* silent — offline */ });
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [cwd, sessionId, canvasWidgets]);

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
      const canvasW = canvasAreaRef.current?.clientWidth ?? 1400;
      const { x, y } = findSpawnPos(prev, entry.defaultW, entry.defaultH, canvasW);
      return applyGravity([...prev, {
        id: uid(), kind: entry.kind as WidgetKind,
        title: entry.label, code: entry.code,
        x, y, w: entry.defaultW, h: entry.defaultH,
      }]);
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
        ...findSpawnPos(prev, 340, 280, canvasAreaRef.current?.clientWidth ?? 1400), w: 340, h: 280,
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
    const sx = Math.max(0, snapVal(x));
    const sy = Math.max(0, snapVal(y));
    setCanvasWidgets(prev => {
      // 1. Place dropped widget at exact snap position
      const moved = prev.map(w => w.id === id ? { ...w, x: sx, y: sy } : w);
      // 2. Gravity: pull all OTHER widgets up to fill gaps; dropped widget stays fixed
      const gravitated = applyGravity(moved, id);
      // 3. Resolve any remaining overlaps; dropped widget still fixed
      return resolveOverlaps(gravitated, id);
    });
  }
  function handleResize(id: string, x: number, y: number, w: number, h: number) {
    setDragging(false);
    setCanvasWidgets(prev => {
      const resized = prev.map(ww => ww.id === id ? { ...ww, x, y, w, h } : ww);
      const gravitated = applyGravity(resized, id);
      return resolveOverlaps(gravitated, id);
    });
  }

  return (
    <div className="canvas-panel">
      {codeDrawer && (
        <CodeDrawer
          title={codeDrawer.title}
          initialCode={codeDrawer.code}
          onApply={newCode => {
            // Update in-memory state immediately
            setCanvasWidgets(prev => prev.map(w => w.id === codeDrawer.id ? { ...w, code: newCode } : w));
            setCodeDrawer(d => d ? { ...d, code: newCode } : null);
            // Persist to server_data/custom_widgets/{canvasId}.js so it survives refresh
            void customWidgetApi.save(codeDrawer.id, newCode, sessionId);
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

        <span className="canvas-toolbar-divider" />
        {canvasWidgets.length > 1 && (
          <button type="button" className="canvas-add-btn canvas-add-btn--tidy"
            title="Auto-arrange: pack all widgets neatly from top-left"
            onClick={() => setCanvasWidgets(prev =>
              autoArrange(prev, canvasAreaRef.current?.clientWidth ?? 1400)
            )}>
            ⊞ Tidy
          </button>
        )}
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
      <div ref={canvasAreaRef} className={`canvas-area${dragging ? ' canvas-area--dragging' : ''}`}
        style={{ overflowAnchor: 'none' } as React.CSSProperties}>
        {canvasWidgets.length === 0 && (
          <div className="canvas-empty">
            <SquaresFourIcon size={36} color="var(--text-tertiary)" weight="duotone" />
            <p className="canvas-empty-title">Empty canvas</p>
            <p className="canvas-empty-hint">Add widgets · Drag to move · Resize edges · Right-click custom to edit</p>
          </div>
        )}
        {canvasWidgets.map(w => (
          <CanvasWidget key={w.id} data={w} sessionId={sessionId}
            onDragStart={() => setDragging(true)}
            onDrop={handleDrop} onResize={handleResize}
            onClose={id => {
              setCanvasWidgets(prev => {
                const removed = prev.find(ww => ww.id === id);
                // Clean up custom code file if one was saved for this instance
                if (removed?.code) void customWidgetApi.remove(id, sessionId);
                return prev.filter(ww => ww.id !== id);
              });
            }}
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
  isDefault?: boolean;
  mode?: string;
};

// ── Directory picker ──────────────────────────────────────────────────────────

type FsEntry = { name: string; path: string; isDir: boolean };

function DirPickerPanel({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const [browsePath,   setBrowsePath]   = useState('');
  const [entries,      setEntries]      = useState<FsEntry[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [mkdirErr,     setMkdirErr]     = useState('');

  function loadPath(path: string) {
    fetch(`${HTTP_BASE}/files?path=${encodeURIComponent(path)}`)
      .then(r => r.json())
      .then((d: { path?: string; entries?: FsEntry[] }) => {
        const resolved = d.path ?? path;
        setBrowsePath(resolved);
        onChange(resolved);
        setShowNewFolder(false);
        setNewFolderName('');
        setMkdirErr('');
        const dirs = (d.entries ?? [])
          .filter(e => e.isDir && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__');
        setEntries(dirs);
      })
      .catch(() => null);
  }

  function createFolder() {
    const name = newFolderName.trim();
    if (!name || !browsePath) return;
    fetch(`${HTTP_BASE}/files/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent: browsePath, name }),
    })
      .then(r => r.json())
      .then((d: { path?: string; error?: string }) => {
        if (d.error) { setMkdirErr(d.error); return; }
        loadPath(d.path ?? browsePath);
      })
      .catch(() => setMkdirErr('Failed to create folder'));
  }

  useEffect(() => { loadPath(value || ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const parts = browsePath.split('/').filter(Boolean);
  const parentPath = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/';

  return (
    <div className="dir-picker">
      {/* Breadcrumb */}
      <div className="dir-picker-crumb">
        <button type="button" onClick={() => loadPath('/')}>/</button>
        {parts.map((seg, i) => (
          <span key={i} className="dir-picker-crumb-seg">
            <span className="dir-picker-crumb-sep">/</span>
            <button type="button" onClick={() => loadPath('/' + parts.slice(0, i + 1).join('/'))}>{seg}</button>
          </span>
        ))}
      </div>
      {/* Entries */}
      <div className="dir-picker-list">
        {parts.length > 0 && (
          <button type="button" className="dir-picker-entry dir-picker-entry--up" onClick={() => loadPath(parentPath)}>
            <FolderIcon size={13} /> ..
          </button>
        )}
        {entries.length === 0 && <span className="dir-picker-empty">No subdirectories</span>}
        {entries.map(e => (
          <button key={e.path} type="button" className="dir-picker-entry" onClick={() => loadPath(e.path)}>
            <FolderIcon size={13} />
            {e.name}
          </button>
        ))}
      </div>
      {/* New folder row */}
      {showNewFolder ? (
        <div className="dir-picker-newfolder">
          <input
            className="dir-picker-newfolder-input"
            placeholder="Folder name"
            value={newFolderName}
            onChange={e => { setNewFolderName(e.target.value); setMkdirErr(''); }}
            onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
            autoFocus
          />
          <button type="button" className="dir-picker-newfolder-ok" onClick={createFolder} disabled={!newFolderName.trim()}>Create</button>
          <button type="button" className="dir-picker-newfolder-cancel" onClick={() => setShowNewFolder(false)}>✕</button>
          {mkdirErr && <span className="dir-picker-newfolder-err">{mkdirErr}</span>}
        </div>
      ) : (
        <button type="button" className="dir-picker-new-btn" onClick={() => setShowNewFolder(true)}>
          + New folder
        </button>
      )}
      {/* Selected path display */}
      <div className="dir-picker-selected">
        <span className="dir-picker-selected-label">Selected:</span>
        <code className="dir-picker-selected-path">{browsePath || '…'}</code>
      </div>
    </div>
  );
}

// ── Session list page ─────────────────────────────────────────────────────────

type SortKey = 'recent' | 'alpha' | 'messages';
const MODE_FILTER_ALL = 'all';

function relativeTime(ts: number) {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function absoluteTime(ts: number) {
  return new Date(ts * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function SessionCard({
  s, onSelect, onDelete,
}: { s: SessionInfo; onSelect: () => void; onDelete: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const modeKey = s.mode === 'widget' ? 'canvas' : s.mode === 'worker' ? 'document' : s.mode === 'coder' ? 'code' : 'chat';
  const accentColor = MODE_COLORS[modeKey] ?? 'var(--accent-blue)';

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirming) { setConfirming(true); return; }
    onDelete();
    setMenuOpen(false);
    setConfirming(false);
  }

  return (
    <div
      className="agent-session-card animate-slide-in"
      style={{ '--session-accent': accentColor } as React.CSSProperties}
      onClick={onSelect}
    >
      <div className="agent-session-card-top">
        <span className="agent-session-dirname">{s.dirName}</span>
        <div className="agent-session-card-actions" onClick={e => e.stopPropagation()}>
          <span className="agent-session-time" title={absoluteTime(s.lastModified)}>
            {relativeTime(s.lastModified)}
          </span>
          <span className="agent-session-mode-icon">
            <ModeIconSvg iconKey={modeKey} size={14} />
          </span>
          <div className="agent-session-menu-wrap">
            <button
              type="button"
              className="agent-session-menu-btn"
              title="Options"
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); setConfirming(false); }}
            >
              ···
            </button>
            {menuOpen && (
              <div className="agent-session-menu">
                <button
                  type="button"
                  className={`agent-session-menu-item agent-session-menu-item--danger${confirming ? ' confirming' : ''}`}
                  onClick={handleDelete}
                >
                  {confirming ? 'Click again to confirm' : 'Delete project'}
                </button>
                <button type="button" className="agent-session-menu-item" onClick={e => { e.stopPropagation(); setMenuOpen(false); onSelect(); }}>
                  Open project
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <CopyPathInline path={s.workingDir} />
      {s.lastMessage && (
        <div className="agent-session-preview">{s.lastMessage}</div>
      )}
      <div className="agent-session-meta">
        {s.messageCount} message{s.messageCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

function SessionListPage({
  onSelect,
  onNew,
}: {
  onSelect: (sessionId: string, cwd: string) => void;
  onNew: (cwd: string) => void;
}) {
  const [sessions,    setSessions]    = useState<SessionInfo[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [fetchErr,    setFetchErr]    = useState<string | null>(null);
  const [showNew,     setShowNew]     = useState(false);
  const [newCwd,      setNewCwd]      = useState('');
  const [search,      setSearch]      = useState('');
  const [sortKey,     setSortKey]     = useState<SortKey>('recent');
  const [modeFilter,  setModeFilter]  = useState(MODE_FILTER_ALL);
  const searchRef = useRef<HTMLInputElement>(null);

  function load() {
    fetch(`${HTTP_BASE}/sessions`)
      .then(r => r.json())
      .then((d: { sessions: SessionInfo[] }) => { setSessions(d.sessions ?? []); setLoading(false); })
      .catch(e => { setFetchErr(e.message); setLoading(false); });
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut: / focuses search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleNew() {
    const cwd = newCwd.trim();
    if (!cwd) return;
    const existing = sessions.find(s => s.workingDir === cwd);
    if (existing) onSelect(existing.sessionId, cwd);
    else onNew(cwd);
  }

  function handleDelete(sessionId: string) {
    fetch(`${HTTP_BASE}/sessions/${sessionId}`, { method: 'DELETE' })
      .then(() => setSessions(prev => prev.filter(s => s.sessionId !== sessionId)))
      .catch(() => null);
  }

  // Unique modes present in sessions
  const presentModes = Array.from(new Set(sessions.map(s => s.mode ?? 'general')));

  // Filter + sort
  const filtered = sessions
    .filter(s => {
      if (modeFilter !== MODE_FILTER_ALL && (s.mode ?? 'general') !== modeFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return s.dirName.toLowerCase().includes(q) ||
             s.workingDir.toLowerCase().includes(q) ||
             s.lastMessage.toLowerCase().includes(q) ||
             s.title.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortKey === 'recent')   return b.lastModified - a.lastModified;
      if (sortKey === 'alpha')    return a.dirName.localeCompare(b.dirName);
      if (sortKey === 'messages') return b.messageCount - a.messageCount;
      return 0;
    });

  const modePillLabel: Record<string, string> = { general: 'General', widget: 'Widget', worker: 'Worker', coder: 'Coder' };
  const modeIconKey: Record<string, string>   = { general: 'chat', widget: 'canvas', worker: 'document', coder: 'code' };

  return (
    <div className="agent-session-page">
      {/* Header */}
      <div className="agent-session-topbar">
        <div>
          <h2 className="agent-session-title">
            Agent Projects
            {!loading && <span className="agent-session-count">{sessions.length}</span>}
          </h2>
          <p className="agent-session-subtitle">4 modes · multiple conversations per project</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="agent-session-refresh-btn" title="Refresh" onClick={load}>
            <ArrowCounterClockwiseIcon size={13} />
          </button>
          <button type="button" className="agent-session-new-btn" onClick={() => { setShowNew(v => !v); }}>
            + New project
          </button>
        </div>
      </div>

      {/* New project form */}
      {showNew && (
        <div className="agent-session-new-form animate-slide-in">
          <div className="agent-session-new-form-header">
            <label className="agent-session-new-label">Select project folder</label>
            <button type="button" className="agent-session-new-close" onClick={() => setShowNew(false)}>
              <XIcon size={13} />
            </button>
          </div>
          <DirPickerPanel value={newCwd} onChange={setNewCwd} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="dir-picker-open-btn" onClick={handleNew} disabled={!newCwd.trim()}>
              Open project →
            </button>
            <button type="button" className="agent-session-new-cancel" onClick={() => setShowNew(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search + filter bar */}
      {!loading && sessions.length > 0 && (
        <div className="agent-session-toolbar">
          <div className="agent-session-search-wrap">
            <MagnifyingGlassIcon size={13} className="agent-session-search-icon" />
            <input
              ref={searchRef}
              className="agent-session-search"
              placeholder="Search projects… (/)"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="agent-session-search-clear" onClick={() => setSearch('')}>
                <XIcon size={11} />
              </button>
            )}
          </div>
          <select
            className="agent-session-sort"
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
          >
            <option value="recent">Recent</option>
            <option value="alpha">A → Z</option>
            <option value="messages">Most messages</option>
          </select>
        </div>
      )}

      {/* Mode filter pills */}
      {!loading && presentModes.length > 1 && (
        <div className="agent-session-mode-filter">
          <button
            type="button"
            className={`agent-session-mode-pill${modeFilter === MODE_FILTER_ALL ? ' active' : ''}`}
            onClick={() => setModeFilter(MODE_FILTER_ALL)}
          >All</button>
          {presentModes.map(m => (
            <button
              key={m}
              type="button"
              className={`agent-session-mode-pill${modeFilter === m ? ' active' : ''}`}
              onClick={() => setModeFilter(modeFilter === m ? MODE_FILTER_ALL : m)}
            >
              <ModeIconSvg iconKey={modeIconKey[m] ?? 'chat'} size={12} />
              {modePillLabel[m] ?? m}
            </button>
          ))}
        </div>
      )}

      {/* Session cards */}
      <div className="agent-session-list">
        {loading && (
          <>
            {[1,2,3].map(i => <div key={i} className="agent-session-skeleton" />)}
          </>
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
            <p>No projects yet — click <strong>+ New project</strong> to start one.</p>
          </div>
        )}
        {!loading && !fetchErr && sessions.length > 0 && filtered.length === 0 && (
          <div className="agent-session-empty">
            <p>No projects match <strong>{search || modeFilter}</strong></p>
            <button type="button" className="agent-session-refresh-btn" style={{ marginTop: 8 }}
              onClick={() => { setSearch(''); setModeFilter(MODE_FILTER_ALL); }}>
              Clear filters
            </button>
          </div>
        )}
        {filtered.map(s => (
          <SessionCard
            key={s.sessionId}
            s={s}
            onSelect={() => onSelect(s.sessionId, s.workingDir)}
            onDelete={() => handleDelete(s.sessionId)}
          />
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
  const [sessions,          setSessions]          = useState<SessionInfo[]>([]);
  const [query,             setQuery]             = useState('');
  const [loading,           setLoading]           = useState(true);
  const [defaultSessionId,  setDefaultSessionId]  = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function loadSessions() {
    fetch(`${httpBase}/sessions?cwd=${encodeURIComponent(cwd)}`)
      .then(r => r.json())
      .then((d: { sessions: SessionInfo[] }) => {
        const list = d.sessions ?? [];
        setSessions(list);
        setDefaultSessionId(list.find(s => s.isDefault)?.sessionId ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadSessions(); }, [cwd, httpBase]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSetDefault(sessionId: string) {
    const next = defaultSessionId === sessionId ? null : sessionId;
    setDefaultSessionId(next); // optimistic update — instant visual feedback
    fetch(`${httpBase}/session-default`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd, sessionId: next ?? '' }),
    }).catch(() => setDefaultSessionId(defaultSessionId)); // revert on error
  }

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
        {filtered.map(s => {
          const isDefault = defaultSessionId === s.sessionId;
          return (
          <div
            key={s.sessionId}
            className={`conv-item${s.sessionId === activeSessionId ? ' conv-item--active' : ''}`}
          >
            {/* Clickable title area */}
            <div className="conv-item-click" role="button" tabIndex={0}
              onClick={() => { onSelect(s.sessionId); onClose(); }}
              onKeyDown={e => { if (e.key === 'Enter') { onSelect(s.sessionId); onClose(); } }}
            >
              <div className="conv-item-top">
                <span className="conv-item-title">{s.title}</span>
                {isDefault && <span className="conv-item-default-badge">default</span>}
                <span className="conv-item-time">{fmtConvTime(s.lastModified)}</span>
              </div>
              <div className="conv-item-id-row">
                <span className="conv-item-id">{s.sessionId}</span>
              </div>
            </div>
            {/* Action buttons — separate from click area, no nesting issue */}
            <div className="conv-item-actions">
              <button
                type="button"
                className={`conv-item-action-btn${isDefault ? ' conv-item-action-btn--default-active' : ''}`}
                title={isDefault ? 'Unset as default' : 'Set as default for this project'}
                onClick={() => handleSetDefault(s.sessionId)}
              >
                {isDefault ? '★' : '☆'}
              </button>
              <button
                type="button"
                className="conv-item-action-btn"
                title="Copy ID"
                onClick={() => void navigator.clipboard.writeText(s.sessionId)}
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
          );
        })}
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
  const { cwd: searchCwd, sessionId: searchSessionId, mode: searchMode } = Route.useSearch();
  const navigate = useNavigate();

  const [view,           setView]           = useState<'list' | 'chat'>(() => searchCwd ? 'chat' : 'list');
  const [activeCwd,      setActiveCwd]      = useState(searchCwd ?? '');
  const [activeSessionId,setActiveSessionId]= useState<string | null>(searchSessionId ?? null);
  const [activeDirName,  setActiveDirName]  = useState(() =>
    searchCwd ? (searchCwd.split('/').filter(Boolean).pop() ?? searchCwd) : '');

  // Agent mode — must be declared before openSession which closes over it
  const [agentMode,        setAgentMode]        = useState<AgentMode>(() => {
    if (searchMode) return searchMode;
    if (searchSessionId) return (localStorage.getItem(modeLSKey(searchSessionId)) as AgentMode | null) ?? 'general';
    return 'general';
  });
  const [editorRefreshKey,  setEditorRefreshKey]  = useState(0);
  const [canvasRefreshKey,  setCanvasRefreshKey]  = useState(0);
  const [docViewer, setDocViewer] = useState<{ path: string; name: string; docType: string; pages: number; wordCount: number; content: string; truncated: boolean } | null>(null);
  const [docViewerLoading, setDocViewerLoading] = useState(false);
  // pendingNewCwd: set when user clicks "+" — shows mode selector before starting session
  const [pendingNewCwd,    setPendingNewCwd]    = useState<string | null>(null);

  // Navigate to a session and reflect it in the URL
  const openSession = useCallback((cwd: string, sessionId?: string | null, mode?: AgentMode) => {
    const sid     = sessionId ?? undefined;
    const newMode = mode
      // Resuming an existing session → restore its saved mode
      ?? (sid ? (localStorage.getItem(modeLSKey(sid)) as AgentMode | null) ?? agentMode : agentMode);
    setActiveCwd(cwd);
    setActiveDirName(cwd.split('/').filter(Boolean).pop() ?? cwd);
    setActiveSessionId(sid ?? null);
    setView('chat');
    setAgentMode(newMode);
    // Canvas mode is per-session
    setCanvasMode(sid ? localStorage.getItem(`bz-canvas:${sid}`) === '1' : false);
    void navigate({ to: '/agent', search: { cwd, sessionId: sid, mode: newMode }, replace: true });
  }, [navigate]);

  // Go back to the list and clear URL params
  const goToList = useCallback(() => {
    setView('list');
    void navigate({ to: '/agent', search: {}, replace: true });
  }, [navigate]);

  // Clear batch queue from sessionStorage on mount (already loaded into state)
  useEffect(() => { sessionStorage.removeItem('agent:batchQueue'); }, []);

  // On first mount pick up pending message from sessionStorage (cwd/sessionId come via URL now)
  useEffect(() => {
    const msg = sessionStorage.getItem('agent:pendingMessage');
    if (msg) {
      sessionStorage.removeItem('agent:pendingMessage');
      pendingAutoSendRef.current = msg;
    }
  }, []);

  // wsKey increments to force a full reconnect (e.g. after /compact)
  const [wsKey, setWsKey] = useState(0);
  // WS URL is null while in list view (no connection)
  // Always pass cwd so bzcode runs in the correct directory, even when resuming.
  const wsUrl = view === 'chat' && activeCwd
    ? `${WS_BASE}?cwd=${encodeURIComponent(activeCwd)}&mode=${encodeURIComponent(agentMode)}${activeSessionId ? `&sessionId=${encodeURIComponent(activeSessionId)}` : ''}`
    : null;

  // ── Chat state ───────────────────────────────────────────────────────────────
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [streamingBlocks, setStreamingBlocks] = useState<AssistantBlock[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [mode, setMode] = useState<SessionMode>('default');
  const modeRef = useRef<SessionMode>('default');        // always current — readable inside stale closures
  const pendingModeRef = useRef<SessionMode | null>(null); // mode user explicitly requested, waiting for bzcode confirmation
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
  const [attachments, setAttachments] = useState<AnyAttachment[]>([]);
  const [bzHubModal,        setBzHubModal]        = useState<BzHubModal | null>(null);
  const [showConversations, setShowConversations] = useState(false);
  const [isCompacting,      setIsCompacting]      = useState(false);
  const [compactDoneMsg,    setCompactDoneMsg]    = useState<string | null>(null);
  const [authExpired,       setAuthExpired]       = useState(false);
  const [batchQueue,        setBatchQueue]        = useState<{ cwd: string; message: string }[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('agent:batchQueue') ?? '[]') as { cwd: string; message: string }[]; } catch { return []; }
  });
  const [sessionTitle,      setSessionTitle]      = useState('');
  const [isEditingTitle,    setIsEditingTitle]    = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [canvasMode,      setCanvasMode]      = useState(() => {
    if (!searchSessionId) return false;
    return localStorage.getItem(`bz-canvas:${searchSessionId}`) === '1';
  });
  const [showWidgetChat,  setShowWidgetChat]  = useState(true);
  const [liveLearningOn,  setLiveLearningOn]  = useState(() => localStorage.getItem('bz:live-learning') === '1');
  const [llJob,           setLlJob]           = useState<'idle'|'collecting'|'training'|'done'>('idle');
  const [llJobDismissed,  setLlJobDismissed]  = useState(false);
  const [llGain,          setLlGain]          = useState<{ accuracy: number; quality: number }>(() => {
    try { return JSON.parse(localStorage.getItem('bz:ll-gain') ?? 'null') ?? { accuracy: 13.4, quality: 91.3 }; } catch { return { accuracy: 13.4, quality: 91.3 }; }
  });
  const [stickyMsgIdx, setStickyMsgIdx] = useState(-1);
  const [stickyTranslateY, setStickyTranslateY] = useState(0);

  const wsRef              = useRef<WebSocket | null>(null);
  const pendingAutoSendRef  = useRef<string | null>(null);
  const isCompactingRef    = useRef(false);
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
        // Re-sync bzcode session mode after every (re)connect.
        // bzcode always starts in 'default' — we must push the current mode back.
        if (mode !== 'default') {
          wsRef.current?.send(JSON.stringify({ type: 'setMode', mode }));
        }
        // Auto-send pending message from home page in YOLO mode
        if (pendingAutoSendRef.current) {
          const text = pendingAutoSendRef.current;
          pendingAutoSendRef.current = null;
          // Small delay to let bzcode finish its startup auto-run
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'setMode', mode: 'yolo' }));
              setMode('yolo'); modeRef.current = 'yolo';
              const userMsg = { id: uid(), kind: 'user' as const, text };
              setItems(prev => [...prev, userMsg]);
              wsRef.current.send(JSON.stringify({ type: 'user', content: text }));
            }
          }, 200);
        }
        if (msg['sessionId']) {
          const sid = msg['sessionId'] as string;
          setCurrentSessionId(sid);
          // Persist the mode for this session so it's restored on reload
          localStorage.setItem(modeLSKey(sid), agentMode);
          // Update URL so a refresh resumes this exact session.
          // Do NOT call setActiveSessionId here — that would change wsUrl
          // and trigger the useEffect to tear down and rebuild the WebSocket,
          // causing the visible connect/disconnect flicker.
          void navigate({ to: '/agent', search: { cwd: activeCwd, sessionId: sid, mode: agentMode }, replace: true });
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
          // Pre-pass: build toolUseId → output map from user toolResult messages
          // bzcode protocol uses camelCase: toolResult, toolUseId, isError
          const toolResultMap = new Map<string, { content: string; isError: boolean }>();
          for (const m of history) {
            if (m.role !== 'user' || !Array.isArray(m.content)) continue;
            for (const block of m.content as Array<Record<string, unknown>>) {
              if (block['type'] === 'toolResult' && typeof block['toolUseId'] === 'string') {
                const raw = block['content'];
                const content = typeof raw === 'string'
                  ? raw
                  : Array.isArray(raw)
                    ? (raw as Array<Record<string, unknown>>)
                        .filter(b => b['type'] === 'text')
                        .map(b => String(b['text'] ?? ''))
                        .join('\n')
                    : '';
                toolResultMap.set(block['toolUseId'] as string, { content, isError: !!block['isError'] });
              }
            }
          }

          const restored: DisplayItem[] = [];
          for (const m of history) {
            if (m.role === 'user') {
              if (typeof m.content !== 'string') continue; // toolResult batches already mapped above
              const text = m.content;
              const trimmed = text.trimStart();
              if (trimmed.startsWith('<system-reminder>')) continue;
              if (trimmed.startsWith('<context-summary>')) {
                restored.push({ id: uid(), kind: 'compact-summary' as const, text });
                continue;
              }
              restored.push({ id: uid(), kind: 'user', text });
            } else {
              const content = Array.isArray(m.content) ? m.content as Array<Record<string, unknown>> : [];
              // Text / thinking blocks
              const textBlocks = bzBlocksToAssistantBlocks(content as unknown[]);
              if (textBlocks.length) restored.push({ id: uid(), kind: 'assistant', blocks: textBlocks });
              // Tool use blocks → restore as completed tool cards (camelCase: toolUse, id, name, input)
              for (const b of content) {
                if (b['type'] === 'toolUse' && typeof b['id'] === 'string' && typeof b['name'] === 'string') {
                  const result = toolResultMap.get(b['id']);
                  restored.push({
                    id: uid(), kind: 'tool',
                    toolUseId: b['id'], name: b['name'],
                    status: 'done', input: b['input'],
                    output: result?.content, isError: result?.isError,
                  } as DisplayItem);
                }
              }
            }
          }
          setItems(restored);

          // Detect interrupted turn: last message is a user toolResult (agent was mid-loop)
          const last = history[history.length - 1];
          const lastIsToolResult = last?.role === 'user' && Array.isArray(last.content) &&
            (last.content as Array<Record<string,unknown>>).some(b => b['type'] === 'toolResult');
          if (lastIsToolResult) {
            setItems(prev => [...prev, {
              id: uid(), kind: 'system' as const,
              message: '⚠ Previous turn was interrupted mid-execution. Send your message again to continue.',
            }]);
          }
        }
      }

      else if (type === 'status') {
        const s = msg['status'] as string;
        if (s === 'running') {
          setIsStreaming(true);
          streamingBlocksRef.current.clear();
          setStreamingBlocks([]);
        } else {
          const wasCompacting = isCompactingRef.current;
          setIsStreaming(false);
          setIsCompacting(false);
          isCompactingRef.current = false;
          streamingBlocksRef.current.clear();
          setStreamingBlocks([]);
          if (msg['mode']) {
            const m = msg['mode'] as SessionMode;
            if (pendingModeRef.current) {
              // Waiting for bzcode to confirm user-requested mode — don't revert UI yet
              if (m === pendingModeRef.current) {
                pendingModeRef.current = null; // confirmed — fall through to update
              } else {
                // bzcode hasn't switched yet — keep showing user's requested mode
              }
            }
            if (!pendingModeRef.current || m === modeRef.current) {
              setMode(m); modeRef.current = m;
            }
          }
          // After compact completes, force-reconnect so bzcode starts fresh
          // with the clean compacted history and avoids stale auto-run state
          if (wasCompacting) {
            // Show done toast — pull the summary line from items if available
            const summary = items.findLast?.((i: DisplayItem) => i.kind === 'system' && (i as { text: string }).text.includes('compacted'));
            const summaryText = summary ? (summary as { text: string }).text : 'Context compacted';
            setCompactDoneMsg(summaryText);
            setTimeout(() => setCompactDoneMsg(null), 5000);
            // Force a full reconnect: wsKey change tears down current WS
            // and opens a fresh one with the clean compacted session
            setTimeout(() => setWsKey(k => k + 1), 800);
          }
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
          if (modeRef.current === 'yolo') {
            // In YOLO mode auto-approve silently — use ref (not state) to avoid stale closure
            wsRef.current?.send(JSON.stringify({
              type: 'user', subtype: 'permission', requestId, behavior: 'always',
            }));
          } else {
            setPendingPermission({ requestId, tool: msg['tool'] as string, input: msg['input'] });
          }
        } else if (subtype === 'input') {
          const questions = (msg['questions'] as Question[] | undefined) ?? [];
          setPendingInput({ requestId, message: msg['message'] as string, questions });
        }
      }

      else if (type === 'system') {
        const event   = msg['event']   as string;
        const message = msg['message'] as string;
        if (event === 'auth-error') {
          setAuthExpired(true);
        } else if (message) {
          setItems(prev => [...prev, { id: uid(), kind: 'system' as const, message }]);
        }
      }

      else if (type === 'result') {
        if (msg['usage']) setTokenUsage(msg['usage'] as TokenUsage);
        if (msg['status'] === 'success' && msg['output']) {
          setItems(prev => [...prev, { id: uid(), kind: 'assistant', blocks: [{ type: 'text', text: msg['output'] as string }] }]);
        }
        // Reload editor file in case the agent modified it
        if (msg['status'] === 'success') {
          setEditorRefreshKey(k => k + 1);
          setCanvasRefreshKey(k => k + 1);  // reload canvas — agent may have deployed a widget
        }
      }
    };

    return () => ws.close();
  }, [wsUrl, wsKey]);

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
    modeRef.current = m;
    pendingModeRef.current = m; // await bzcode confirmation before allowing status to override
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
    e.target.value = '';
    files.forEach(file => {
      if (isDocFile(file.name)) {
        // Document: upload to server for parsing
        const placeholder: DocAttachment = { kind: 'doc', name: file.name, docType: '', pages: 0, wordCount: 0, content: '', truncated: false, loading: true };
        const placeholderId = file.name + Date.now();
        setAttachments(prev => [...prev, { ...placeholder, name: placeholderId } as DocAttachment]);
        const form = new FormData();
        form.append('file', file);
        fetch(`${HTTP_BASE}/api/doc/parse`, { method: 'POST', body: form })
          .then(r => r.json())
          .then((d: { filename?: string; type?: string; pages?: number; wordCount?: number; content?: string; truncated?: boolean; error?: string }) => {
            if (d.error) {
              setAttachments(prev => prev.filter(a => (a as DocAttachment).name !== placeholderId));
              return;
            }
            setAttachments(prev => prev.map(a =>
              (a as DocAttachment).name === placeholderId
                ? { kind: 'doc', name: file.name, docType: d.type ?? '', pages: d.pages ?? 0, wordCount: d.wordCount ?? 0, content: d.content ?? '', truncated: !!d.truncated, loading: false } as DocAttachment
                : a
            ));
          })
          .catch(() => setAttachments(prev => prev.filter(a => (a as DocAttachment).name !== placeholderId)));
      } else {
        // Image: read as base64
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const commaIdx = dataUrl.indexOf(',');
          const meta = dataUrl.slice(0, commaIdx);
          const data = dataUrl.slice(commaIdx + 1);
          const mediaType = meta.replace('data:', '').replace(';base64', '');
          setAttachments(prev => [...prev, { name: file.name, mediaType, data }]);
        };
        reader.readAsDataURL(file);
      }
    });
  }, []);

  // Live learning: trigger a mock training job every 10 user messages
  const llRoundCountRef = useRef(0);
  const triggerLiveLearnJob = useCallback(() => {
    if (!liveLearningOn) return;
    setLlJob('collecting');
    setLlJobDismissed(false);
    setTimeout(() => setLlJob('training'), 3000);
    setTimeout(() => {
      setLlJob('done');
      const gain = { accuracy: 13.4, quality: 91.3 };
      setLlGain(gain);
      localStorage.setItem('bz:ll-gain', JSON.stringify(gain));
    }, 7000);
  }, [liveLearningOn]);

  const handleSubmit = useCallback(() => {
    const text = inputValue.trim();
    if ((!text && attachments.length === 0) || isStreaming) return;
    triggerLiveLearnJob();
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

    // Build content blocks — images as base64, docs as inline text blocks
    const imgAtts  = snapshotAttachments.filter(a => !isDocAttachment(a)) as Attachment[];
    const docAtts  = snapshotAttachments.filter(isDocAttachment);

    if (imgAtts.length === 0 && docAtts.length === 0) {
      sendRaw({ type: 'user', content: text });
    } else {
      const blocks: unknown[] = [];
      // User text first
      let fullText = text;
      // Append parsed document content as text so the model can reason over it
      for (const doc of docAtts) {
        if (doc.loading || !doc.content) continue;
        fullText += `\n\n---\n📄 **${doc.name}** (${doc.docType.toUpperCase()}, ${doc.pages} page${doc.pages !== 1 ? 's' : ''}, ${doc.wordCount.toLocaleString()} words${doc.truncated ? ', truncated' : ''})\n\n${doc.content}`;
      }
      if (fullText) blocks.push({ type: 'text', text: fullText });
      for (const att of imgAtts) {
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
    if (name === 'compact') { setIsCompacting(true); isCompactingRef.current = true; }
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
          onSelect={(sessionId, cwd) => openSession(cwd, sessionId)}
          onNew={(cwd) => setPendingNewCwd(cwd)}
        />
        {pendingNewCwd && (
          <div className="new-session-overlay">
            <div className="new-session-panel">
              <div className="new-session-header">
                <span className="new-session-title">Choose a mode</span>
                <span className="new-session-cwd">{pendingNewCwd.split('/').filter(Boolean).pop()}</span>
              </div>
              <p className="new-session-hint">Select how this agent should behave in the new conversation.</p>
              <ModeSelector
                selected={agentMode}
                onSelect={m => {
                  setPendingNewCwd(null);
                  openSession(pendingNewCwd, null, m);
                }}
              />
              <button type="button" className="new-session-cancel" onClick={() => setPendingNewCwd(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
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
                const remaining = batchQueue.filter((_, j) => j !== i);
                setBatchQueue(remaining);
                if (remaining.length > 0) sessionStorage.setItem('agent:batchQueue', JSON.stringify(remaining));
                openSession(item.cwd, null);
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
            onClick={() => goToList()}
            title="Back to sessions"
          >
            <ArrowLeftIcon size={14} />
            Agent
          </button>
          <span className="agent-breadcrumb-sep">/</span>
          <CopyPathButton path={activeCwd} label={activeDirName || '—'} />
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

        {/* Live Learning eval result */}
        <LlEvalBadge gain={llGain} />

        {/* Mode badge */}
        <ModeBadge
          mode={agentMode}
          onSwitch={m => openSession(activeCwd, null, m)}
        />

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
              onSelect={sessionId => { openSession(activeCwd, sessionId); setShowConversations(false); }}
              onNew={() => { setShowConversations(false); setPendingNewCwd(activeCwd); }}
              onClose={() => setShowConversations(false)}
            />
          )}
        </div>
      </div>

      {/* Body — layout depends on mode */}
      <div className={
        agentMode === 'widget' || agentMode === 'worker' || agentMode === 'coder'
          ? 'agent-canvas-layout'
          : 'agent-chat-col'
      }>
      <div className={`agent-chat-col${(agentMode === 'widget' || agentMode === 'worker' || agentMode === 'coder') && !showWidgetChat ? ' agent-chat-col--float-prompt' : ''}`}>

      {/* Collapse strip — widget / worker / coder modes */}
      {(agentMode === 'widget' || agentMode === 'worker' || agentMode === 'coder') && (
        <div className="agent-widget-chat-strip">
          <button
            type="button"
            className="agent-widget-chat-strip-btn"
            title="Hide chat"
            onClick={() => setShowWidgetChat(false)}
          >
            <ChatCircleDotsIcon size={14} />
          </button>
        </div>
      )}

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
                        const docPaths    = agentMode === 'worker' ? extractDocPaths(block.text) : [];
                        const widgetIds   = agentMode === 'widget' && !isLive ? extractWidgetIds(block.text) : [];
                        return (
                          <div key={j} className="agent-msg-row">
                            <span className="agent-block-icon"><BlockDot size={10} /></span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                className="chat-bubble-assistant"
                                dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(block.text) }}
                              />
                              {widgetIds.length > 0 && (
                                <div className="agent-doc-open-chips">
                                  {widgetIds.map(id => (
                                    <button
                                      key={id}
                                      type="button"
                                      className="agent-doc-open-btn"
                                      onClick={() => {
                                        setCanvasRefreshKey(k => k + 1);
                                      }}
                                    >
                                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                                      View on canvas
                                    </button>
                                  ))}
                                </div>
                              )}
                              {docPaths.length > 0 && (
                                <div className="agent-doc-open-chips">
                                  {docPaths.map(p => (
                                    <button
                                      key={p}
                                      type="button"
                                      className="agent-doc-open-btn"
                                      onClick={() => {
                                        const ext = p.split('.').pop()?.toLowerCase() ?? '';
                                        // Office files: open in EditorPanel (Excel, PPT, Word)
                                        if (['xlsx','xls','pptx','ppt','docx','doc'].includes(ext)) {
                                          setEditorRefreshKey(k => k + 1);
                                          window.dispatchEvent(new CustomEvent('open-file', { detail: { path: p } }));
                                          return;
                                        }
                                        setDocViewerLoading(true);
                                        setDocViewer(null);
                                        fetch(`${HTTP_BASE}/api/doc/parse`, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ path: p }),
                                        })
                                          .then(r => r.json())
                                          .then((d: { filename?: string; type?: string; pages?: number; wordCount?: number; content?: string; truncated?: boolean; error?: string }) => {
                                            if (d.error) return;
                                            setDocViewer({ path: p, name: d.filename ?? p.split('/').pop() ?? p, docType: d.type ?? '', pages: d.pages ?? 0, wordCount: d.wordCount ?? 0, content: d.content ?? '', truncated: !!d.truncated });
                                          })
                                          .finally(() => setDocViewerLoading(false));
                                      }}
                                    >
                                      {(p.split('.').pop()?.toLowerCase() === 'xlsx' || p.split('.').pop()?.toLowerCase() === 'xls') ? '📊' : '📄'} Open {p.split('/').pop()}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
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

              if (item.kind === 'tool') {
                if (agentMode !== 'widget') return <ToolCard key={item.id} item={item} />;
                if (item.name === 'Skill') return <WidgetSkillBadge key={item.id} item={item} />;
                return null;
              }
              if (item.kind === 'push-progress')   return <PushProgressCard key={item.id} item={item} />;
              if (item.kind === 'sync-progress')   return <SyncProgressCard key={item.id} item={item} />;
              if (item.kind === 'compact-summary') return <CompactSummaryCard key={item.id} text={item.text} />;
              if (item.kind === 'system') return (
                <div key={item.id} className="agent-system-msg">{item.message}</div>
              );

              return null;
            })}

            {isStreaming && streamingBlocks.length === 0 && (
              <BoltzingIndicator />
            )}
          </div>
        )}
        </div>
      </div>

      <div className="agent-prompt-section">

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

      {/* Auth expired banner */}
      {authExpired && (
        <div className="auth-expired-banner">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span className="auth-expired-text">Your session has expired — please sign in again to continue.</span>
          <button
            type="button"
            className="auth-expired-btn"
            onClick={() => {
              // Clear expired token on server, then redirect to login
              fetch(`${HTTP_BASE}/auth/logout`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authUrl: 'https://boltzhub.com' }),
              }).finally(() => { window.location.href = '/login'; });
            }}
          >Sign in</button>
          <button type="button" className="auth-expired-dismiss" onClick={() => setAuthExpired(false)}>✕</button>
        </div>
      )}

      {/* Compacting banner — shown while /compact is running */}
      {isCompacting && (
        <div className="compact-banner">
          <BoltzbitLogo size={14} className="boltzbit-logo-animate" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span className="compact-banner-text">Compacting conversation…</span>
              <span className="compact-banner-sub">Summarising history to free context space</span>
            </div>
            <div className="compact-progress-track">
              <div className="compact-progress-bar" />
            </div>
          </div>
        </div>
      )}

      {/* Compact done toast */}
      {compactDoneMsg && !isCompacting && (
        <div className="compact-done-toast">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span>{compactDoneMsg}</span>
          <button type="button" onClick={() => setCompactDoneMsg(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'inherit', padding:'0 2px', lineHeight:1 }}>✕</button>
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
        {/* Show-chat button — floats above input box, visible only when prompt is floating */}
        {(agentMode === 'widget' || agentMode === 'worker' || agentMode === 'coder') && !showWidgetChat && (
          <button
            type="button"
            className="agent-widget-showchat-btn"
            title="Show chat"
            onClick={() => setShowWidgetChat(true)}
          >
            <ChatCircleDotsIcon size={14} />
            Chat
          </button>
        )}

        {/* Hidden file input — accepts images always, documents in worker mode */}
        <input
          ref={fileInputRef}
          type="file"
          accept={agentMode === 'worker' ? 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx' : 'image/*'}
          multiple
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        <div
          className={`agent-input-box${isCompacting ? ' agent-input-box--locked' : ''}${isStreaming ? ' agent-input-box--busy' : ''}`}
          style={{ '--mode-color': modeColor } as React.CSSProperties}
        >
          {/* Live Learning notification — inside the input box so it's one unified card */}
          {liveLearningOn && llJob !== 'idle' && !llJobDismissed && (
            <LiveLearningNotification
              stage={llJob}
              gain={llGain}
              onDismiss={() => setLlJobDismissed(true)}
              onViewPage={() => { setLlJobDismissed(true); window.location.href = '/learning'; }}
            />
          )}
          {/* Attachment chips preview */}
          {attachments.length > 0 && (
            <div className="agent-attach-chips agent-attach-chips--input">
              {attachments.map((att, i) => (
                <span key={i} className={`agent-attach-chip${isDocAttachment(att) ? ' agent-attach-chip--doc' : ''}`}>
                  {isDocAttachment(att) ? (
                    <>
                      <span className="agent-attach-doc-icon">📄</span>
                      <span className="agent-attach-name">
                        {att.loading
                          ? `Parsing ${att.name}…`
                          : `${att.name} · ${att.pages} page${att.pages !== 1 ? 's' : ''} · ${att.wordCount.toLocaleString()} words${att.truncated ? ' (truncated)' : ''}`
                        }
                      </span>
                    </>
                  ) : (
                    <>
                      <img src={`data:${(att as Attachment).mediaType};base64,${(att as Attachment).data}`} alt={att.name} className="agent-attach-thumb" />
                      <span className="agent-attach-name">{att.name}</span>
                    </>
                  )}
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
            placeholder={isStreaming ? 'bzcode is running — click ■ to stop' : 'Ask the agent…'}
            value={inputValue}
            rows={1}
            disabled={isStreaming || isCompacting}
            onChange={e => { setInputValue(e.target.value); setSlashMenuDismissed(false); setSlashMenuIdx(0); }}
            onKeyDown={handleKeyDown}
          />

          {/* Control row */}
          <div className="agent-input-controls">
            {/* Attach file */}
            <button
              type="button"
              className="agent-ctrl-btn"
              title={agentMode === 'worker' ? 'Attach image or document (PDF, DOCX, XLSX, PPTX)' : 'Attach image'}
              onClick={() => fileInputRef.current?.click()}
            >
              <PaperclipIcon size={15} />
            </button>
            <span className="agent-ctrl-divider" />

            {/* Live Learning toggle */}
            <button
              type="button"
              className={`agent-ctrl-btn agent-ll-toggle${liveLearningOn ? ' agent-ll-toggle--on' : ''}`}
              title={liveLearningOn ? 'Live Learning: ON — click to disable' : 'Live Learning: OFF — click to enable'}
              onClick={() => {
                const next = !liveLearningOn;
                setLiveLearningOn(next);
                localStorage.setItem('bz:live-learning', next ? '1' : '0');
              }}
            >
              <LlBrainIcon size={14} />
              <span className="agent-ll-label">Live Learning</span>
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
                className="agent-submit-btn agent-submit-btn--stop"
                style={{ background: modeColor }}
                onClick={handleAbort}
                title="Stop (cancel running command)"
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

      </div>{/* end agent-prompt-section */}

      </div>{/* end agent-chat-col */}

      {agentMode === 'widget' && (
        <div className="agent-widget-canvas-wrap">
          <CanvasPanel cwd={activeCwd} sessionId={activeSessionId} refreshKey={canvasRefreshKey} />
        </div>
      )}
      {(agentMode === 'worker' || agentMode === 'coder') && (
        <EditorPanel
          cwd={activeCwd}
          codeMode={agentMode === 'coder'}
          refreshKey={editorRefreshKey}
        />
      )}
    </div>

    {/* Document viewer — slides over canvas/editor when a doc path is opened */}
    {(docViewer || docViewerLoading) && (
      <>
        <div className="code-drawer-backdrop" onClick={() => { setDocViewer(null); setDocViewerLoading(false); }} />
        <div className="code-drawer doc-viewer-drawer">
          <div className="code-drawer-header">
            <span className="code-drawer-title">
              📄 {docViewerLoading ? 'Loading…' : docViewer?.name}
            </span>
            {docViewer && !docViewerLoading && (
              <span className="doc-viewer-meta">
                {docViewer.docType.toUpperCase()} · {docViewer.pages} page{docViewer.pages !== 1 ? 's' : ''} · {docViewer.wordCount.toLocaleString()} words
                {docViewer.truncated && <span className="doc-viewer-truncated"> · truncated</span>}
              </span>
            )}
            <button
              type="button"
              className="code-drawer-apply-btn"
              style={{ marginLeft: 'auto' }}
              onClick={() => { setDocViewer(null); setDocViewerLoading(false); }}
              title="Close"
            >
              <XIcon size={13} />
            </button>
          </div>
          <div className="doc-viewer-body">
            {docViewerLoading && (
              <div className="doc-viewer-loading">
                <BoltzbitLogo size={28} className="boltzbit-logo-animate" />
                <span>Parsing document…</span>
              </div>
            )}
            {docViewer && !docViewerLoading && (
              <div
                className="doc-viewer-content"
                dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(docViewer.content) }}
              />
            )}
          </div>
        </div>
      </>
    )}

    {/* Mode selector — shown when user clicks "+" to create a new session */}
    {pendingNewCwd && (
      <div className="new-session-overlay">
        <div className="new-session-panel">
          <div className="new-session-header">
            <span className="new-session-title">Choose a mode</span>
            <span className="new-session-cwd">{pendingNewCwd.split('/').filter(Boolean).pop()}</span>
          </div>
          <p className="new-session-hint">Select how this agent should behave in the new conversation.</p>
          <ModeSelector
            selected={agentMode}
            onSelect={m => {
              setPendingNewCwd(null);
              openSession(pendingNewCwd, null, m);
            }}
          />
          <button type="button" className="new-session-cancel" onClick={() => setPendingNewCwd(null)}>
            Cancel
          </button>
        </div>
      </div>
    )}

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
