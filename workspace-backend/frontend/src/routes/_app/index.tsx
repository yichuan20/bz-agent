import { ArrowUpIcon, PaperclipIcon } from '@phosphor-icons/react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { MODE_COLORS, ModeIconSvg } from '#/components/ModeIconSvg';
import type { AgentMode } from '#/lib/agentModes';

export const Route = createFileRoute('/_app/')({
  component: Home,
});

import { HTTP_BASE as AGENT_HTTP, classifyMode as apiClassifyMode } from '#/lib/api';
// AGENT_HTTP imported from '#/lib/api'

const CONFIRM_DELAY = 3000;

type HomeAttachment = { name: string; mediaType: string; data: string };

const MODE_PILLS: { mode: AgentMode; label: string; icon: string; desc: string }[] = [
  {
    mode: 'general',
    label: 'General',
    icon: 'chat',
    desc: 'Q&A, research, writing, and file tasks',
  },
  { mode: 'widget', label: 'Widget', icon: 'canvas', desc: 'Widget and mini-app development' },
  { mode: 'worker', label: 'Worker', icon: 'document', desc: 'Document review and knowledge work' },
  { mode: 'coder', label: 'Coder', icon: 'code', desc: 'Code projects and deployment' },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

async function detectMode(message: string, _signal: AbortSignal): Promise<AgentMode> {
  try {
    const d = await apiClassifyMode(AGENT_HTTP, message);
    const valid: AgentMode[] = ['general', 'widget', 'worker', 'coder'];
    return valid.includes(d.mode as AgentMode) ? (d.mode as AgentMode) : 'general';
  } catch {
    return 'general';
  }
}

/* ── Classifying overlay ────────────────────────────────────── */
function ClassifyingModal({ onForceSelect }: { onForceSelect: (m: AgentMode) => void }) {
  return (
    <>
      <div className="home-modal-header">
        <span className="home-modal-title">Detecting the best mode…</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          aria-hidden="true"
          style={{
            animation: 'spin 0.8s linear infinite',
            flexShrink: 0,
            color: 'var(--text-tertiary)',
          }}
        >
          <circle
            cx="7"
            cy="7"
            r="5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="20 14"
          />
        </svg>
      </div>
      <div className="mode-selector">
        {MODE_PILLS.map(({ mode, icon, label }, i) => (
          <button
            key={mode}
            type="button"
            className="mode-card mode-card--scanning"
            style={{ '--i': i } as React.CSSProperties}
            title={`Force ${label} mode`}
            onClick={() => onForceSelect(mode)}
          >
            <span className="mode-card-icon" style={{ color: MODE_COLORS[icon] }}>
              <ModeIconSvg iconKey={icon} size={28} />
            </span>
            <span className="mode-card-label">{label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ── Detected overlay ───────────────────────────────────────── */
function DetectedModal({
  mode,
  onSelect,
  onConfirm,
  onCancel,
}: {
  mode: AgentMode;
  onSelect: (m: AgentMode) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [countdown, setCountdown] = useState(Math.ceil(CONFIRM_DELAY / 1000));
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    const countId = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    const navId = setTimeout(() => onConfirmRef.current(), CONFIRM_DELAY);
    return () => {
      clearInterval(countId);
      clearTimeout(navId);
    };
  }, []);

  const detected = MODE_PILLS.find(p => p.mode === mode) ?? MODE_PILLS[0];

  return (
    <>
      <div className="home-modal-header">
        <span className="home-modal-title">Mode detected</span>
        <span className="home-modal-hint">Starting in {countdown}s — or pick another</span>
      </div>
      <div className="mode-selector">
        {MODE_PILLS.map(({ mode: m, icon, label, desc }) => {
          const active = m === mode;
          return (
            <button
              key={m}
              type="button"
              className={`mode-card${active ? ' mode-card--active' : ''}`}
              style={
                active
                  ? {
                      borderColor: MODE_COLORS[icon],
                      background: `color-mix(in srgb, ${MODE_COLORS[icon]} 8%, var(--bg-primary))`,
                    }
                  : undefined
              }
              onClick={() => onSelect(m)}
            >
              <span className="mode-card-icon" style={{ color: MODE_COLORS[icon] }}>
                <ModeIconSvg iconKey={icon} size={28} />
              </span>
              <span className="mode-card-label">{label}</span>
              <span className="mode-card-desc">{desc}</span>
            </button>
          );
        })}
      </div>
      <div className="agent-home-detected-footer">
        <div className="agent-home-detected-progress-track">
          <div
            className="agent-home-detected-progress-fill"
            style={{ '--mode-color': MODE_COLORS[detected?.icon ?? 'chat'] } as React.CSSProperties}
          />
        </div>
        <div className="agent-home-detected-actions">
          <span className="agent-home-detected-countdown">Starting in {countdown}s…</span>
          <button type="button" className="agent-home-detected-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Home page ──────────────────────────────────────────────── */
function Home() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [selectedMode, setSelectedMode] = useState<AgentMode | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [detectedMode, setDetectedMode] = useState<AgentMode | null>(null);
  const [attachments, setAttachments] = useState<HomeAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalCardRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!detectedMode) return;
    function onMouseDown(e: MouseEvent) {
      if (modalCardRef.current && !modalCardRef.current.contains(e.target as Node)) {
        setDetectedMode(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDetectedMode(null);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [detectedMode]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const commaIdx = dataUrl.indexOf(',');
        const data = dataUrl.slice(commaIdx + 1);
        const mediaType = dataUrl.slice(5, commaIdx).replace(';base64', '');
        setAttachments(prev => [...prev, { name: file.name, mediaType, data }]);
      };
      reader.readAsDataURL(file);
    });
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  }

  async function startSession() {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    sessionStorage.setItem('agent:pendingMessage', text);
    if (attachments.length > 0) {
      sessionStorage.setItem('agent:pendingAttachments', JSON.stringify(attachments));
    }

    if (selectedMode) {
      void navigate({ to: '/agent', search: { mode: selectedMode, isNew: true } as never });
      return;
    }

    const ctrl = new AbortController();
    // 8-second hard timeout
    const timeoutId = setTimeout(() => ctrl.abort(), 8000);
    abortRef.current = ctrl;

    setClassifying(true);
    const mode = await detectMode(text, ctrl.signal);
    clearTimeout(timeoutId);

    if (ctrl.signal.aborted) return;
    setClassifying(false);
    setDetectedMode(mode);
  }

  function goToMode(mode: AgentMode) {
    abortRef.current?.abort();
    void navigate({ to: '/agent', search: { mode, isNew: true } as never });
  }

  function cancelDetection() {
    setDetectedMode(null);
  }

  const showOverlay = classifying || !!detectedMode;
  const canSubmit = (input.trim().length > 0 || attachments.length > 0) && !classifying;

  return (
    <div className="agent-home-page">
      <div className="agent-home-center">
        <h1 className="agent-home-greeting">{getGreeting()}</h1>

        <div className="agent-home-input-card">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <textarea
            ref={textareaRef}
            className="agent-home-input"
            placeholder="Ask the agent…"
            value={input}
            rows={1}
            onChange={handleInput}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void startSession();
              }
            }}
          />
          {attachments.length > 0 && (
            <div className="agent-attach-chips agent-attach-chips--input">
              {attachments.map((att, i) => (
                <span key={i} className="agent-attach-chip">
                  <img
                    src={`data:${att.mediaType};base64,${att.data}`}
                    className="agent-attach-thumb"
                    alt={att.name}
                  />
                  <span className="agent-attach-name">{att.name}</span>
                  <button
                    type="button"
                    className="agent-attach-remove"
                    onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="agent-home-input-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="agent-home-attach"
                title="Attach image"
                onClick={() => fileInputRef.current?.click()}
              >
                <PaperclipIcon size={14} />
              </button>
              <div className="agent-home-mode-pills">
                {MODE_PILLS.map(({ mode, label, icon }) => (
                  <button
                    key={mode}
                    type="button"
                    className={`agent-home-mode-pill${selectedMode === mode ? ' agent-home-mode-pill--active' : ''}`}
                    style={{ color: MODE_COLORS[icon] }}
                    onClick={() => setSelectedMode(prev => (prev === mode ? null : mode))}
                  >
                    <ModeIconSvg iconKey={icon} size={13} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className={`agent-home-send${canSubmit ? ' agent-home-send--active' : ''}`}
              disabled={!canSubmit}
              onClick={() => void startSession()}
            >
              <ArrowUpIcon size={14} weight="bold" />
            </button>
          </div>
        </div>

        {!selectedMode && input.trim() && !showOverlay && (
          <p className="agent-home-auto-detect-hint">Mode will be auto-detected</p>
        )}
      </div>

      {showOverlay && (
        <div className="home-modal-overlay">
          <div ref={modalCardRef} className="home-modal agent-home-classify-modal">
            {classifying ? (
              <ClassifyingModal onForceSelect={goToMode} />
            ) : (
              <DetectedModal
                mode={detectedMode ?? 'general'}
                onSelect={goToMode}
                onConfirm={() => {
                  if (detectedMode) goToMode(detectedMode);
                }}
                onCancel={cancelDetection}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
