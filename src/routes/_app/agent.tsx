import { parseMarkdownToHTML } from '@boltzbit/md-utils';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowUpIcon,
  CaretDownIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  LightningIcon,
  ListChecksIcon,
  PaperclipIcon,
  SquaresFourIcon,
  SpinnerIcon,
  SquareIcon,
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

type DisplayItem =
  | { id: string; kind: 'user'; text: string; attachments?: Attachment[] }
  | { id: string; kind: 'assistant'; blocks: AssistantBlock[] }
  | { id: string; kind: 'tool'; toolUseId: string; name: string; status: 'running' | 'done' | 'error'; input: unknown; output?: string; isError?: boolean };

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

// ── Sub-components ────────────────────────────────────────────────────────────

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

type WidgetKind = 'clock' | 'editor' | 'table' | 'bar' | 'pie' | 'kpi' | 'news' | 'search' | 'calendar' | 'video' | 'email' | 'map' | 'chat' | 'videocall';
type WidgetData = { id: string; kind: WidgetKind; title: string; x: number; y: number; w: number; h: number };

function ClockWidget() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="wgt-clock">
      <div className="wgt-clock-time">
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div className="wgt-clock-date">
        {now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </div>
  );
}

function EditorWidget() {
  const [value, setValue] = useState('');
  return (
    <textarea
      className="wgt-editor"
      value={value}
      onChange={e => setValue(e.target.value)}
      placeholder="Start typing…"
      spellCheck={false}
    />
  );
}

function TableWidget() {
  const [rows, setRows] = useState<string[][]>(() => Array.from({ length: 3 }, () => Array(3).fill('')));

  function setCell(r: number, c: number, v: string) {
    setRows(prev => prev.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? v : cell) : row));
  }

  return (
    <div className="wgt-table-wrapper">
      <div className="wgt-table-scroll">
        <table className="wgt-table">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}><input className="wgt-table-cell" value={cell} onChange={e => setCell(r, c, e.target.value)} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="wgt-table-actions">
        <button type="button" className="wgt-table-btn" onClick={() => setRows(p => [...p, Array(p[0]?.length ?? 3).fill('')])}>+ Row</button>
        <button type="button" className="wgt-table-btn" onClick={() => setRows(p => p.map(r => [...r, '']))}>+ Col</button>
      </div>
    </div>
  );
}

// ── Chart colour palette ──────────────────────────────────────────────────────

const CHART_COLORS = ['#1473DF', '#3FDC7E', '#F59E0B', '#FA4B42', '#EC4899', '#06B6D4', '#EAB308'];

// ── Bar chart widget ──────────────────────────────────────────────────────────

type ChartRow = { name: string; value: number };

function BarWidget() {
  const [rows, setRows] = useState<ChartRow[]>([
    { name: 'Jan', value: 42 },
    { name: 'Feb', value: 67 },
    { name: 'Mar', value: 53 },
    { name: 'Apr', value: 88 },
    { name: 'May', value: 61 },
  ]);
  const [editing, setEditing] = useState(false);

  return (
    <div className="wgt-chart-wrapper">
      {editing ? (
        <div className="wgt-chart-editor">
          {rows.map((r, i) => (
            <div key={i} className="wgt-chart-row">
              <input className="wgt-chart-input" value={r.name} onChange={e => setRows(p => p.map((rr, j) => j === i ? { ...rr, name: e.target.value } : rr))} placeholder="Label" />
              <input className="wgt-chart-input wgt-chart-input--num" type="number" value={r.value} onChange={e => setRows(p => p.map((rr, j) => j === i ? { ...rr, value: Number(e.target.value) } : rr))} />
              <button type="button" className="wgt-chart-rm" onClick={() => setRows(p => p.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="wgt-table-btn" onClick={() => setRows(p => [...p, { name: '', value: 0 }])}>+ Row</button>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: 'color-mix(in srgb, var(--accent-blue) 10%, transparent)' }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <button type="button" className="wgt-chart-edit-btn" onClick={() => setEditing(e => !e)}>
        {editing ? 'Chart' : 'Edit data'}
      </button>
    </div>
  );
}

// ── Pie chart widget ──────────────────────────────────────────────────────────

function PieWidget() {
  const [rows, setRows] = useState<ChartRow[]>([
    { name: 'Alpha', value: 35 },
    { name: 'Beta',  value: 25 },
    { name: 'Gamma', value: 20 },
    { name: 'Delta', value: 20 },
  ]);
  const [editing, setEditing] = useState(false);

  return (
    <div className="wgt-chart-wrapper">
      {editing ? (
        <div className="wgt-chart-editor">
          {rows.map((r, i) => (
            <div key={i} className="wgt-chart-row">
              <span className="wgt-chart-swatch" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <input className="wgt-chart-input" value={r.name} onChange={e => setRows(p => p.map((rr, j) => j === i ? { ...rr, name: e.target.value } : rr))} placeholder="Label" />
              <input className="wgt-chart-input wgt-chart-input--num" type="number" value={r.value} onChange={e => setRows(p => p.map((rr, j) => j === i ? { ...rr, value: Number(e.target.value) } : rr))} />
              <button type="button" className="wgt-chart-rm" onClick={() => setRows(p => p.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="wgt-table-btn" onClick={() => setRows(p => [...p, { name: '', value: 0 }])}>+ Slice</button>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius="65%" innerRadius="30%" paddingAngle={2}>
              {rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, fontSize: 12 }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
          </PieChart>
        </ResponsiveContainer>
      )}
      <button type="button" className="wgt-chart-edit-btn" onClick={() => setEditing(e => !e)}>
        {editing ? 'Chart' : 'Edit data'}
      </button>
    </div>
  );
}

// ── KPI key figures widget ────────────────────────────────────────────────────

type KpiItem = { label: string; value: string; change: string; up: boolean };

function KpiWidget() {
  const [items, setItems] = useState<KpiItem[]>([
    { label: 'Revenue',   value: '$48,200', change: '+12%', up: true  },
    { label: 'Users',     value: '3,841',   change: '+7%',  up: true  },
    { label: 'Churn',     value: '2.4%',    change: '-0.3%',up: false },
    { label: 'Latency',   value: '142 ms',  change: '+8ms', up: false },
  ]);

  function update(i: number, field: keyof KpiItem, val: string) {
    setItems(p => p.map((it, j) => j === i ? { ...it, [field]: val } : it));
  }

  return (
    <div className="wgt-kpi-grid">
      {items.map((it, i) => (
        <div key={i} className="wgt-kpi-card">
          <input className="wgt-kpi-label" value={it.label} onChange={e => update(i, 'label', e.target.value)} />
          <input className="wgt-kpi-value" value={it.value} onChange={e => update(i, 'value', e.target.value)} />
          <div className="wgt-kpi-footer">
            <input className="wgt-kpi-change" value={it.change} onChange={e => update(i, 'change', e.target.value)}
              style={{ color: it.up ? 'var(--accent-green)' : 'var(--accent-red)' }} />
            <button type="button" className="wgt-kpi-arrow" onClick={() => update(i, 'up', String(!it.up))}>
              {it.up ? '↑' : '↓'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── News widget ───────────────────────────────────────────────────────────────

type NewsItem = { title: string; source: string; time: string };

const SAMPLE_NEWS: NewsItem[] = [
  { title: 'AI models hit new reasoning benchmarks', source: 'TechCrunch', time: '2h ago' },
  { title: 'Global markets rally on rate cut hopes',  source: 'Reuters',    time: '3h ago' },
  { title: 'Open-source LLM outperforms GPT-4 on code tasks', source: 'Hacker News', time: '5h ago' },
  { title: 'New EU regulation targets foundation models', source: 'The Verge', time: '8h ago' },
  { title: 'Startup raises $120M to build AI chips', source: 'Bloomberg', time: '12h ago' },
];

function NewsWidget() {
  const [items, setItems] = useState<NewsItem[]>(SAMPLE_NEWS);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', source: '', time: 'now' });

  return (
    <div className="wgt-news-wrapper">
      <div className="wgt-news-list">
        {items.map((it, i) => (
          <div key={i} className="wgt-news-item">
            <div className="wgt-news-title">{it.title}</div>
            <div className="wgt-news-meta">{it.source} · {it.time}</div>
          </div>
        ))}
      </div>
      {adding ? (
        <div className="wgt-news-add-form">
          <input className="wgt-chart-input" placeholder="Headline" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
          <input className="wgt-chart-input" placeholder="Source" value={draft.source} onChange={e => setDraft(d => ({ ...d, source: e.target.value }))} />
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="wgt-table-btn" onClick={() => { setItems(p => [{ ...draft }, ...p]); setDraft({ title: '', source: '', time: 'now' }); setAdding(false); }}>Add</button>
            <button type="button" className="wgt-table-btn" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="wgt-chart-edit-btn" onClick={() => setAdding(true)}>+ Add story</button>
      )}
    </div>
  );
}

// ── Search widget ─────────────────────────────────────────────────────────────

const SEARCH_ENGINES = [
  { label: 'Google',     url: 'https://www.google.com/search?q=' },
  { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { label: 'Bing',       url: 'https://www.bing.com/search?q=' },
  { label: 'Perplexity', url: 'https://www.perplexity.ai/search?q=' },
];

const SEARCH_API = `${HTTP_BASE}/search`;

type SearchResult = {
  title: string;
  link: string;
  displayLink: string;
  snippet: string;
  favicon: string;
  position: number;
};

type SearchMeta = {
  total_results?: string;
  time_taken?: string;
  query_displayed?: string;
};

function SearchWidget() {
  const [query,    setQuery]   = useState('boltzbit');
  const [results,  setResults] = useState<SearchResult[]>([]);
  const [meta,     setMeta]    = useState<SearchMeta | null>(null);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [apiKey,   setApiKey]  = useState(() => localStorage.getItem('serpapi-key') ?? '');

  useEffect(() => { localStorage.setItem('serpapi-key', apiKey); }, [apiKey]);

  async function doSearch(q = query) {
    q = q.trim();
    if (!q) return;

    if (!apiKey.trim()) {
      setSettings(true); // prompt user to enter key
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = `${SEARCH_API}?q=${encodeURIComponent(q)}&key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(url);
      const data = await res.json() as { results?: SearchResult[]; meta?: SearchMeta; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResults(data.results ?? []);
      setMeta(data.meta ?? null);
      if (!data.results?.length) setError('No results found.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wgt-search-wrapper wgt-search-wrapper--full">
      {/* Search bar */}
      <div className="wgt-search-bar">
        <input
          className="wgt-search-input"
          placeholder="Search Google via SerpAPI…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
        />
        <button type="button" className="wgt-search-btn" onClick={() => doSearch()} disabled={!query.trim() || loading}>
          {loading ? '…' : '→'}
        </button>
        <button type="button" className="wgt-map-key-btn" onClick={() => setSettings(s => !s)} title="SerpAPI key">
          ⚙️
        </button>
      </div>

      {/* Settings */}
      {settings && (
        <div className="wgt-search-settings">
          <p className="wgt-video-hint">SerpAPI key (proxied via Python server)</p>
          <input
            className="wgt-email-input"
            placeholder="your SerpAPI key"
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setSettings(false)}
          />
          <a href="https://serpapi.com/dashboard" target="_blank" rel="noopener noreferrer" className="wgt-search-help">
            Get key from serpapi.com →
          </a>
        </div>
      )}

      {/* No-key prompt */}
      {!apiKey && !results.length && !loading && (
        <div className="wgt-search-hint-box">
          <p style={{ fontSize: 28 }}>🔍</p>
          <p>Enter your <strong>SerpAPI key</strong> via ⚙️ to see live Google results.</p>
        </div>
      )}

      {/* Error */}
      {error && <p className="wgt-video-error" style={{ padding: '8px 12px' }}>{error}</p>}

      {/* Meta bar */}
      {meta && results.length > 0 && (
        <div className="wgt-search-meta">
          {meta.total_results && <span>~{meta.total_results} results</span>}
          {meta.time_taken    && <span>{meta.time_taken}</span>}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="wgt-search-results">
          {results.map((r, i) => (
            <a key={i} href={r.link} target="_blank" rel="noopener noreferrer" className="wgt-search-result">
              <div className="wgt-search-result-meta">
                {r.favicon
                  ? <img className="wgt-search-favicon" src={r.favicon} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  : <img className="wgt-search-favicon" src={`https://www.google.com/s2/favicons?domain=${r.displayLink}&sz=16`} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                }
                <span className="wgt-search-result-domain">{r.displayLink}</span>
              </div>
              <div className="wgt-search-result-title">{r.title}</div>
              {r.snippet && <div className="wgt-search-result-snippet">{r.snippet}</div>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Calendar widget ───────────────────────────────────────────────────────────

function CalendarWidget() {
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<string | null>(
    `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
  );

  const { year, month } = view;
  const firstDay = new Date(year, month, 1).getDay();  // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  // Cells: leading blanks + day numbers
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  function prev() { setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 }); }
  function next() { setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 }); }

  return (
    <div className="wgt-cal">
      {/* Month navigation */}
      <div className="wgt-cal-header">
        <button type="button" className="wgt-cal-nav" onClick={prev}>‹</button>
        <span className="wgt-cal-title">{MONTHS[month]} {year}</span>
        <button type="button" className="wgt-cal-nav" onClick={next}>›</button>
      </div>

      {/* Day-of-week row */}
      <div className="wgt-cal-grid">
        {DOW.map(d => <span key={d} className="wgt-cal-dow">{d}</span>)}

        {/* Day cells */}
        {cells.map((day, i) => {
          if (!day) return <span key={`e-${i}`} />;
          const key = `${year}-${month}-${day}`;
          const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
          const isSel = selected === key;
          return (
            <button
              key={key}
              type="button"
              className={`wgt-cal-day${isToday ? ' wgt-cal-day--today' : ''}${isSel ? ' wgt-cal-day--selected' : ''}`}
              onClick={() => setSelected(isSel ? null : key)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Video player widget ───────────────────────────────────────────────────────

function toEmbedUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    // YouTube: youtube.com/watch?v=ID  or  youtu.be/ID
    if (url.hostname.includes('youtube.com')) {
      const id = url.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}?autoplay=0` : null;
    }
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}?autoplay=0` : null;
    }
    // Vimeo: vimeo.com/ID
    if (url.hostname.includes('vimeo.com')) {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    // Already an embed URL or other iframe-able URL
    return raw.trim();
  } catch {
    return null;
  }
}

// ── Map widget (Google Maps Embed) ────────────────────────────────────────────

function MapWidget() {
  const [query, setQuery]   = useState('');
  const [active, setActive] = useState('');   // committed search query
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  function search() {
    const q = query.trim();
    if (q) setActive(q);
  }

  // Build embed URL:
  //  • With API key  → official Embed API (search mode)
  //  • Without       → unofficial maps.google.com embed (no key required)
  function embedUrl() {
    if (!active) return null;
    if (apiKey.trim()) {
      return `https://www.google.com/maps/embed/v1/search?q=${encodeURIComponent(active)}&key=${apiKey.trim()}`;
    }
    return `https://maps.google.com/maps?q=${encodeURIComponent(active)}&output=embed&hl=en`;
  }

  const url = embedUrl();

  return (
    <div className="wgt-map-wrapper">
      {/* Search bar */}
      <div className="wgt-map-search">
        <input
          className="wgt-search-input"
          placeholder="Search Google Maps…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <button type="button" className="wgt-search-btn" onClick={search} disabled={!query.trim()}>
          →
        </button>
        <button
          type="button"
          className="wgt-map-key-btn"
          onClick={() => setShowKey(v => !v)}
          title="Configure Google Maps API key"
        >
          🔑
        </button>
      </div>

      {/* Optional API key input */}
      {showKey && (
        <div className="wgt-map-key-row">
          <input
            className="wgt-email-input"
            placeholder="Google Maps API key (optional)"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            type="password"
          />
        </div>
      )}

      {/* Map iframe */}
      {url ? (
        <iframe
          key={url}
          className="wgt-map-frame"
          src={url}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          title="Google Maps"
        />
      ) : (
        <div className="wgt-map-empty">
          <span style={{ fontSize: 32 }}>🗺️</span>
          <p className="canvas-empty-title">Search a location</p>
          <p className="canvas-empty-hint">Type an address, city, or place name above</p>
        </div>
      )}
    </div>
  );
}

// ── Email client widget ───────────────────────────────────────────────────────

const EMAIL_PROVIDERS = [
  {
    label: 'Gmail',
    icon: '✉️',
    compose: (to: string, subject: string, body: string) =>
      `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body)}`,
  },
  {
    label: 'Outlook',
    icon: '📧',
    compose: (to: string, subject: string, body: string) =>
      `https://outlook.live.com/mail/0/deeplink/compose?to=${enc(to)}&subject=${enc(subject)}&body=${enc(body)}`,
  },
  {
    label: 'Yahoo',
    icon: '📨',
    compose: (to: string, subject: string, body: string) =>
      `https://compose.mail.yahoo.com/?to=${enc(to)}&subject=${enc(subject)}&body=${enc(body)}`,
  },
  {
    label: 'ProtonMail',
    icon: '🔒',
    compose: (to: string, subject: string, body: string) =>
      `https://mail.proton.me/u/0/inbox#compose&to=${enc(to)}&subject=${enc(subject)}&body=${enc(body)}`,
  },
] as const;

function enc(s: string) { return encodeURIComponent(s); }

function EmailWidget() {
  const [provider, setProvider] = useState(0);
  const [to,      setTo]      = useState('');
  const [subject, setSubject] = useState('');
  const [body,    setBody]    = useState('');
  const [sent,    setSent]    = useState(false);

  const p = EMAIL_PROVIDERS[provider]!;

  function handleSend() {
    const url = p.compose(to, subject, body);
    window.open(url, '_blank', 'noopener');
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  }

  const canSend = to.trim().length > 0;

  return (
    <div className="wgt-email-wrapper">
      {/* Provider tabs */}
      <div className="wgt-email-tabs">
        {EMAIL_PROVIDERS.map((ep, i) => (
          <button
            key={ep.label}
            type="button"
            className={`wgt-email-tab${i === provider ? ' wgt-email-tab--active' : ''}`}
            onClick={() => setProvider(i)}
            title={ep.label}
          >
            <span>{ep.icon}</span>
            <span className="wgt-email-tab-label">{ep.label}</span>
          </button>
        ))}
      </div>

      {/* Compose form */}
      <div className="wgt-email-form">
        <div className="wgt-email-field">
          <label className="wgt-email-label">To</label>
          <input
            className="wgt-email-input"
            type="email"
            placeholder="recipient@example.com"
            value={to}
            onChange={e => setTo(e.target.value)}
          />
        </div>
        <div className="wgt-email-field">
          <label className="wgt-email-label">Subject</label>
          <input
            className="wgt-email-input"
            placeholder="Subject"
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
        </div>
        <div className="wgt-email-field wgt-email-field--body">
          <label className="wgt-email-label">Message</label>
          <textarea
            className="wgt-email-textarea"
            placeholder="Write your message…"
            value={body}
            onChange={e => setBody(e.target.value)}
          />
        </div>

        <button
          type="button"
          className={`wgt-email-send${sent ? ' wgt-email-send--sent' : ''}`}
          onClick={handleSend}
          disabled={!canSend}
        >
          {sent ? `✓ Opened in ${p.label}` : `Open in ${p.label} →`}
        </button>
      </div>
    </div>
  );
}

function VideoWidget() {
  const [input, setInput] = useState('');
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  function load() {
    const url = toEmbedUrl(input);
    if (url) { setEmbedUrl(url); setError(false); }
    else setError(true);
  }

  return (
    <div className="wgt-video-wrapper">
      {embedUrl ? (
        <>
          <iframe
            className="wgt-video-frame"
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Video"
          />
          <button type="button" className="wgt-chart-edit-btn" onClick={() => setEmbedUrl(null)}>
            Change URL
          </button>
        </>
      ) : (
        <div className="wgt-video-input-area">
          <p className="wgt-video-hint">Paste a YouTube or Vimeo URL</p>
          <div className="wgt-search-bar">
            <input
              className="wgt-search-input"
              placeholder="https://youtube.com/watch?v=…"
              value={input}
              onChange={e => { setInput(e.target.value); setError(false); }}
              onKeyDown={e => e.key === 'Enter' && load()}
            />
            <button type="button" className="wgt-search-btn" onClick={load} disabled={!input.trim()}>→</button>
          </div>
          {error && <p className="wgt-video-error">Couldn't parse that URL — try a YouTube or Vimeo link.</p>}
        </div>
      )}
    </div>
  );
}

// ── Chat widget ───────────────────────────────────────────────────────────────

type ChatMsg = { id: string; text: string; from: 'me' | 'them'; time: string };

function ChatWidget() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: uid(), text: 'Hello! Type a message below.', from: 'them', time: now() },
  ]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  function now() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text) return;
    setMessages(prev => [...prev, { id: uid(), text, from: 'me', time: now() }]);
    setInput('');
  }

  return (
    <div className="wgt-chat-wrapper">
      <div className="wgt-chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`wgt-chat-row wgt-chat-row--${msg.from}`}>
            <div className={`wgt-chat-bubble wgt-chat-bubble--${msg.from}`}>{msg.text}</div>
            <div className="wgt-chat-time">{msg.time}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="wgt-chat-input-row">
        <input
          className="wgt-search-input"
          placeholder="Type a message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button type="button" className="wgt-search-btn" onClick={send} disabled={!input.trim()}>→</button>
      </div>
    </div>
  );
}

// ── Video call widget (Jitsi Meet) ────────────────────────────────────────────

function VideoCallWidget() {
  const [room,       setRoom]       = useState('');
  const [activeRoom, setActiveRoom] = useState<string | null>(null);

  function join() {
    const r = room.trim() || `canvas-call-${Math.random().toString(36).slice(2, 8)}`;
    setActiveRoom(r);
  }

  return (
    <div className="wgt-video-wrapper">
      {activeRoom ? (
        <>
          <iframe
            key={activeRoom}
            className="wgt-video-frame"
            src={`https://meet.jit.si/${encodeURIComponent(activeRoom)}`}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            title="Video Call"
          />
          <div className="wgt-call-footer">
            <span className="wgt-call-room">Room: <strong>{activeRoom}</strong></span>
            <button type="button" className="wgt-chart-edit-btn" style={{ margin: 0 }} onClick={() => setActiveRoom(null)}>
              Leave
            </button>
          </div>
        </>
      ) : (
        <div className="wgt-video-input-area">
          <span style={{ fontSize: 36 }}>📹</span>
          <p className="wgt-video-hint" style={{ fontWeight: 600 }}>Video Call via Jitsi Meet</p>
          <p className="wgt-video-hint">Free · No account needed · Encrypted</p>
          <div className="wgt-search-bar">
            <input
              className="wgt-search-input"
              placeholder="Room name (share to invite)"
              value={room}
              onChange={e => setRoom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && join()}
            />
            <button type="button" className="wgt-search-btn" onClick={join}>→</button>
          </div>
          <p className="wgt-video-hint" style={{ fontSize: 10 }}>Leave the room name blank to generate a random one</p>
        </div>
      )}
    </div>
  );
}

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
}: {
  data: WidgetData;
  onDragStart: (id: string) => void;
  onDrop: (id: string, x: number, y: number) => void;
  onResize: (id: string, x: number, y: number, w: number, h: number) => void;
  onClose: (id: string) => void;
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

  const content = {
    clock:    <ClockWidget />,
    editor:   <EditorWidget />,
    table:    <TableWidget />,
    bar:      <BarWidget />,
    pie:      <PieWidget />,
    kpi:      <KpiWidget />,
    news:     <NewsWidget />,
    search:   <SearchWidget />,
    calendar: <CalendarWidget />,
    video:    <VideoWidget />,
    email:    <EmailWidget />,
    map:       <MapWidget />,
    chat:      <ChatWidget />,
    videocall: <VideoCallWidget />,
  }[data.kind];

  return (
    <div ref={elRef} className="canvas-widget" style={{ left: data.x, top: data.y, width: data.w, height: data.h }}>
      {/* Resize handles — one per edge/corner */}
      {RESIZE_HANDLES.map(h => (
        <div
          key={h}
          className={`canvas-resize-handle canvas-resize-handle--${h}`}
          onMouseDown={e => handleResizeMouseDown(e, h)}
        />
      ))}

      <div className="canvas-widget-header" onMouseDown={handleDragMouseDown}>
        <span className="canvas-widget-title">{data.title}</span>
        <button type="button" className="canvas-widget-close" onClick={() => onClose(data.id)} aria-label="Close">
          <XIcon size={11} />
        </button>
      </div>
      <div className="canvas-widget-body">{content}</div>
    </div>
  );
}

const WIDGET_DEFAULTS: Record<WidgetKind, { title: string; w: number; h: number }> = {
  clock:  { title: 'Clock',      w: 240, h: 130 },
  editor: { title: 'Editor',     w: 340, h: 260 },
  table:  { title: 'Table',      w: 400, h: 220 },
  bar:    { title: 'Bar Chart',  w: 380, h: 280 },
  pie:    { title: 'Pie Chart',  w: 320, h: 280 },
  kpi:    { title: 'Key Figures',w: 380, h: 200 },
  news:     { title: 'News',       w: 320, h: 300 },
  search:   { title: 'Search',     w: 380, h: 420 },
  calendar: { title: 'Calendar',   w: 280, h: 290 },
  video:    { title: 'Video',      w: 400, h: 280 },
  email:    { title: 'Email',      w: 340, h: 360 },
  map:       { title: 'Map',        w: 400, h: 340 },
  chat:      { title: 'Chat',       w: 300, h: 360 },
  videocall: { title: 'Video Call', w: 480, h: 360 },
};

function CanvasPanel() {
  const [widgets, setWidgets] = useState<WidgetData[]>([]);
  const [dragging, setDragging] = useState(false);

  function addWidget(kind: WidgetKind) {
    const d = WIDGET_DEFAULTS[kind];
    setWidgets(prev => {
      const next = [...prev, {
        id: uid(), kind, title: d.title,
        x: 32 + (prev.length % 6) * 20,
        y: 32 + (prev.length % 6) * 20,
        w: d.w, h: d.h,
      }];
      return resolveOverlaps(next);
    });
  }

  function handleDragStart(_id: string) {
    setDragging(true);
  }

  function handleDrop(id: string, x: number, y: number) {
    setDragging(false);
    setWidgets(prev => {
      const moved = prev.map(w => w.id === id ? { ...w, x, y } : w);
      return resolveOverlaps(moved, id);
    });
  }

  function handleResize(id: string, x: number, y: number, w: number, h: number) {
    setDragging(false);
    setWidgets(prev => {
      const resized = prev.map(ww => ww.id === id ? { ...ww, x, y, w, h } : ww);
      return resolveOverlaps(resized, id);
    });
  }

  return (
    <div className="canvas-panel">
      <div className="canvas-toolbar">
        <span className="canvas-toolbar-label">Widgets</span>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('clock')}>⏰ Clock</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('bar')}>📊 Bar</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('pie')}>🥧 Pie</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('kpi')}>📈 KPIs</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('news')}>📰 News</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('search')}>🔍 Search</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('editor')}>📝 Editor</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('table')}>🗂 Table</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('calendar')}>📅 Calendar</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('video')}>▶️ Video</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('email')}>📮 Email</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('map')}>🗺️ Map</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('chat')}>💬 Chat</button>
        <button type="button" className="canvas-add-btn" onClick={() => addWidget('videocall')}>📹 Video Call</button>
      </div>
      <div className="canvas-area">
        {/* Grid overlay — fades in while dragging */}
        <div className={`canvas-grid${dragging ? ' canvas-grid--visible' : ''}`} />

        {widgets.length === 0 && (
          <div className="canvas-empty">
            <SquaresFourIcon size={36} color="var(--text-tertiary)" weight="duotone" />
            <p className="canvas-empty-title">Empty canvas</p>
            <p className="canvas-empty-hint">Add widgets from the toolbar above · Drag to reposition</p>
          </div>
        )}
        {widgets.map(w => (
          <CanvasWidget
            key={w.id}
            data={w}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onResize={handleResize}
            onClose={id => setWidgets(prev => prev.filter(ww => ww.id !== id))}
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
  lastMessage: string;
  lastModified: number;
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

// ── Main agent page ───────────────────────────────────────────────────────────

function AgentPage() {
  // ── Session routing ─────────────────────────────────────────────────────────
  const [view,           setView]           = useState<'list' | 'chat'>('list');
  const [activeCwd,      setActiveCwd]      = useState('');
  const [activeSessionId,setActiveSessionId]= useState<string | null>(null);
  const [activeDirName,  setActiveDirName]  = useState('');

  // WS URL is null while in list view (no connection)
  const wsUrl = view === 'chat'
    ? (activeSessionId
        ? `${WS_BASE}?sessionId=${encodeURIComponent(activeSessionId)}`
        : `${WS_BASE}?cwd=${encodeURIComponent(activeCwd)}`)
    : null;

  // ── Chat state ───────────────────────────────────────────────────────────────
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [streamingBlocks, setStreamingBlocks] = useState<AssistantBlock[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [mode, setMode] = useState<SessionMode>('default');
  const [availableModes, setAvailableModes] = useState<SessionMode[]>(['default', 'plan', 'yolo']);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PermissionPrompt | null>(null);
  const [pendingInput, setPendingInput] = useState<InputPromptData | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [canvasMode, setCanvasMode] = useState(false);
  const [stickyMsgIdx, setStickyMsgIdx] = useState(-1);
  const [stickyTranslateY, setStickyTranslateY] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
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

  // WebSocket — reconnects whenever wsUrl changes (new session selected)
  useEffect(() => {
    if (!wsUrl) return;

    // Reset conversation state for the new session
    setItems([]);
    setStreamingBlocks([]);
    setIsStreaming(false);
    setStickyMsgIdx(-1);
    setConnStatus('connecting');
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
        if (Array.isArray(msg['modes'])) setAvailableModes(msg['modes'] as SessionMode[]);
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
      {/* Header */}
      <div className="agent-header">
        {/* Back button */}
        <button
          type="button"
          className="agent-back-btn"
          onClick={() => setView('list')}
          title="Back to sessions"
        >
          ←
        </button>

        {/* Directory label */}
        <div className="agent-session-label" title={activeCwd}>
          <TerminalIcon size={12} />
          <span>{activeDirName || 'Agent'}</span>
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
                      if (block.type === 'text') return (
                        <div key={j} className="agent-msg-row">
                          <span className="agent-block-icon"><BlockDot size={10} /></span>
                          <div
                            className="chat-bubble-assistant"
                            dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(block.text) }}
                          />
                        </div>
                      );
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

              if (item.kind === 'tool') return <ToolCard key={item.id} item={item} />;

              return null;
            })}

            {isStreaming && streamingBlocks.length === 0 && (
              <div className="agent-boltzing">
                <BoltzbitLogo size={14} className="boltzbit-logo-animate" />
                <span className="agent-boltzing-label">Boltzing…</span>
              </div>
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

      {/* Input bar */}
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
            onChange={e => setInputValue(e.target.value)}
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

      {canvasMode && <CanvasPanel />}
    </div>
    </div>
  );
}
