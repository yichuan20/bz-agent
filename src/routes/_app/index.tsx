import {
  ArrowSquareOutIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  FolderIcon,
  FolderOpenIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SpinnerIcon,
  SquareIcon,
  TerminalIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';

export const Route = createFileRoute('/_app/')({
  component: Home,
});

const HTTP_BASE = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:5081';
const POLL_MS   = 5000; // refresh active status every 5s

type BatchItemState = {
  cwd:       string;
  dirName:   string;
  status:    'pending' | 'running' | 'done' | 'error';
  output:    string;
  error:     string;
  sessionId: string;
};
type BatchState = { batchId: string; done: boolean; items: BatchItemState[] };

type SessionInfo = {
  sessionId:    string;
  workingDir:   string;
  dirName:      string;
  messageCount: number;
  title:        string;
  lastModified: number;
  isActive:     boolean;
  isRunning:    boolean;
};

function formatNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function relativeTime(ts: number) {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

function Home() {
  const navigate = useNavigate();
  const [sessions,    setSessions]    = useState<SessionInfo[]>([]);
  const [search,      setSearch]      = useState('');
  const [selected,    setSelected]    = useState<Set<string>>(new Set()); // cwds
  const [inputValue,  setInputValue]  = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatDir,  setNewChatDir]  = useState('');
  const [batch,       setBatch]       = useState<BatchState | null>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const newChatRef   = useRef<HTMLInputElement>(null);
  const batchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startBatchPoll(batchId: string) {
    if (batchPollRef.current) clearInterval(batchPollRef.current);
    batchPollRef.current = setInterval(async () => {
      const r = await fetch(`${HTTP_BASE}/batch/${batchId}`).catch(() => null);
      if (!r) return;
      const d = await r.json() as BatchState;
      setBatch(d);
      if (d.done && batchPollRef.current) {
        clearInterval(batchPollRef.current);
        batchPollRef.current = null;
        loadSessions();
      }
    }, 1500);
  }

  useEffect(() => () => { if (batchPollRef.current) clearInterval(batchPollRef.current); }, []);

  const loadSessions = useCallback(() => {
    fetch(`${HTTP_BASE}/sessions`)
      .then(r => r.json())
      .then((d: { sessions: SessionInfo[] }) => setSessions(d.sessions ?? []))
      .catch(() => null);
  }, []);

  useEffect(() => {
    loadSessions();
    const t = setInterval(loadSessions, POLL_MS);
    return () => clearInterval(t);
  }, [loadSessions]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '1px';
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    const maxH = lh * 6;
    el.style.height = `${Math.max(Math.min(el.scrollHeight, maxH), lh)}px`;
    el.style.overflowY = el.scrollHeight >= maxH ? 'auto' : 'hidden';
  }, [inputValue]);

  // Focus new-chat input when modal opens
  useEffect(() => {
    if (showNewChat) setTimeout(() => newChatRef.current?.focus(), 50);
  }, [showNewChat]);

  function launch(cwds: string[], msg: string) {
    if (cwds.length === 0) return;
    if (cwds.length === 1 && !msg.trim()) {
      // Just open the agent chat for this directory
      sessionStorage.setItem('agent:pendingCwd', cwds[0]!);
      void navigate({ to: '/agent' });
      return;
    }
    if (cwds.length === 1 && msg.trim()) {
      // Single directory with message — send via batch API (background, YOLO)
      fetch(`${HTTP_BASE}/batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwds, message: msg.trim() }),
      }).then(r => r.json()).then((d: { batchId: string }) => {
        setBatch({ batchId: d.batchId, done: false, items: cwds.map(c => ({ cwd: c, dirName: c.split('/').filter(Boolean).pop() ?? c, status: 'pending' as const, output: '', error: '', sessionId: '' })) });
        startBatchPoll(d.batchId);
        setInputValue('');
        setSelected(new Set());
      }).catch(() => null);
      return;
    }
    // Multiple directories — always use batch API
    fetch(`${HTTP_BASE}/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwds, message: msg.trim() }),
    }).then(r => r.json()).then((d: { batchId: string }) => {
      setBatch({ batchId: d.batchId, done: false, items: cwds.map(c => ({ cwd: c, dirName: c.split('/').filter(Boolean).pop() ?? c, status: 'pending' as const, output: '', error: '', sessionId: '' })) });
      startBatchPoll(d.batchId);
      setInputValue('');
      setSelected(new Set());
    }).catch(() => null);
  }

  function handleSend() {
    const targets = selected.size > 0 ? [...selected] : (sessions[0] ? [sessions[0].workingDir] : []);
    launch(targets, inputValue);
  }

  function handleNewChat() {
    const d = newChatDir.trim();
    if (!d) return;
    launch([d], inputValue);
    setShowNewChat(false);
    setNewChatDir('');
  }

  function toggleSelect(cwd: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd); else next.add(cwd);
      return next;
    });
  }

  const filtered = sessions.filter(s =>
    !search || s.dirName.toLowerCase().includes(search.toLowerCase()) ||
    s.workingDir.toLowerCase().includes(search.toLowerCase()) ||
    (s.title || '').toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = sessions.filter(s => s.isRunning).length;
  const totalMsgs   = sessions.reduce((n, s) => n + (s.messageCount || 0), 0);
  const sendLabel   = selected.size > 1 ? `Send to ${selected.size} projects` : selected.size === 1 ? 'Send to project' : 'Open agent';

  return (
    <div className="home-page">

      {/* ── Top bar ── */}
      <div className="home-top">
        <div className="home-brand">
          <h1 className="home-brand-title">BoltzAgent</h1>
          <p className="home-brand-sub">AI coding assistant — one session per project</p>
        </div>
        <div className="home-stats">
          <div className="home-stat"><span className="home-stat-value">{formatNum(sessions.length)}</span><span className="home-stat-label">Projects</span></div>
          {activeCount > 0 && <div className="home-stat home-stat--active"><span className="home-stat-value">{activeCount}</span><span className="home-stat-label">Running</span></div>}
          <div className="home-stat"><span className="home-stat-value">{formatNum(totalMsgs)}</span><span className="home-stat-label">Messages</span></div>
        </div>
      </div>

      {/* ── Prompt window ── */}
      <div className="home-prompt-box">
        <textarea
          ref={textareaRef}
          className="home-prompt-textarea"
          placeholder={selected.size > 1 ? `Send to ${selected.size} selected projects…` : 'Ask the agent something…'}
          value={inputValue}
          rows={1}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <div className="home-prompt-controls">
          {/* Selection hint */}
          {selected.size > 0 && (
            <span className="home-selection-hint">
              {selected.size} selected
              <button type="button" className="home-selection-clear" onClick={() => setSelected(new Set())}><XIcon size={11} /></button>
            </span>
          )}
          <span style={{ flex: 1 }} />
          {/* New chat button */}
          <button type="button" className="home-new-chat-btn" onClick={() => setShowNewChat(true)} title="New chat in a directory">
            <PlusIcon size={13} />
            New chat
          </button>
          <button type="button" className="home-prompt-send" onClick={handleSend} title={sendLabel}>
            <ArrowUpIcon size={14} weight="bold" />
          </button>
        </div>
      </div>

      {/* ── Batch results panel ── */}
      {batch && (
        <div className="batch-panel">
          <div className="batch-panel-header">
            <span className="batch-panel-title">
              {batch.done ? 'Batch complete' : 'Running in background…'}
            </span>
            <span className="batch-panel-count">
              {batch.items.filter(i => i.status === 'done').length} / {batch.items.length} done
            </span>
            {batch.done && (
              <button type="button" className="home-search-clear" onClick={() => setBatch(null)}>
                <XIcon size={13} />
              </button>
            )}
          </div>
          <div className="batch-item-list">
            {batch.items.map(item => (
              <div key={item.cwd} className={`batch-item batch-item--${item.status}`}>
                <div className="batch-item-header">
                  {item.status === 'pending'  && <SpinnerIcon size={12} style={{ opacity: 0.4 }} />}
                  {item.status === 'running'  && <SpinnerIcon size={12} className="home-running-spin" color="var(--accent-blue)" />}
                  {item.status === 'done'     && <CheckCircleIcon size={12} weight="fill" color="var(--accent-green)" />}
                  {item.status === 'error'    && <WarningCircleIcon size={12} weight="fill" color="var(--accent-red)" />}
                  <span className="batch-item-name">{item.dirName}</span>
                  <span className="batch-item-status">{item.status}</span>
                  {item.status === 'done' && (
                    <button type="button" className="batch-item-open"
                      onClick={() => {
                        sessionStorage.setItem('agent:pendingCwd', item.cwd);
                        if (item.sessionId) sessionStorage.setItem('agent:pendingSessionId', item.sessionId);
                        void navigate({ to: '/agent' });
                      }}
                      title="Open chat">
                      <ArrowSquareOutIcon size={11} />
                    </button>
                  )}
                </div>
                {(item.output || item.error) && (
                  <div className="batch-item-output">
                    {item.error || item.output.slice(0, 300)}{item.output.length > 300 ? '…' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── New chat modal ── */}
      {showNewChat && (
        <div className="home-modal-overlay" onClick={() => setShowNewChat(false)}>
          <div className="home-modal" onClick={e => e.stopPropagation()}>
            <div className="home-modal-header">
              <FolderOpenIcon size={15} color="var(--accent-blue)" />
              <span className="home-modal-title">New chat</span>
              <button type="button" className="canvas-widget-close" onClick={() => setShowNewChat(false)}><XIcon size={13} /></button>
            </div>
            <p className="home-modal-hint">Enter a working directory to start a new conversation.</p>
            <input
              ref={newChatRef}
              className="home-modal-input"
              placeholder="/path/to/your/project"
              value={newChatDir}
              onChange={e => setNewChatDir(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleNewChat(); if (e.key === 'Escape') setShowNewChat(false); }}
            />
            {/* Recent dirs as quick-pick */}
            {sessions.length > 0 && (
              <div className="home-modal-recents">
                {sessions.slice(0, 6).map(s => (
                  <button key={s.sessionId} type="button" className="home-modal-recent-item"
                    onClick={() => { setNewChatDir(s.workingDir); }}>
                    <FolderIcon size={11} />
                    <span className="home-modal-recent-name">{s.dirName}</span>
                    <span className="home-modal-recent-path">{s.workingDir}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="home-modal-actions">
              <button type="button" className="bzhub-btn bzhub-btn--primary" onClick={handleNewChat} disabled={!newChatDir.trim()}>
                Start chat
              </button>
              <button type="button" className="bzhub-btn" onClick={() => setShowNewChat(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recent projects ── */}
      {sessions.length > 0 && (
        <section className="home-recent">
          <div className="home-section-header">
            <h2 className="home-section-title">Recent projects</h2>
            <div className="home-search-bar">
              <MagnifyingGlassIcon size={13} color="var(--text-tertiary)" />
              <input
                className="home-search-input"
                placeholder="Search projects…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button type="button" className="home-search-clear" onClick={() => setSearch('')}><XIcon size={11} /></button>}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)', padding: '12px 0' }}>No projects match "{search}"</p>
          ) : (
            <div className="home-project-grid">
              {filtered.map(s => {
                const isSelected = selected.has(s.workingDir);
                return (
                  <div
                    key={s.sessionId}
                    className={`home-project-card${isSelected ? ' home-project-card--selected' : ''}${s.isRunning ? ' home-project-card--active' : ''}`}
                    onClick={() => launch([s.workingDir], '')}
                  >
                    {/* Checkbox */}
                    <button
                      type="button"
                      className="home-project-check"
                      onClick={e => { e.stopPropagation(); toggleSelect(s.workingDir); }}
                      title={isSelected ? 'Deselect' : 'Select'}
                    >
                      {isSelected
                        ? <CheckSquareIcon size={14} color="var(--accent-blue)" weight="fill" />
                        : <SquareIcon size={14} color="var(--text-tertiary)" />
                      }
                    </button>

                    <div className="home-project-body">
                      <div className="home-project-card-top">
                        <FolderOpenIcon size={13} color={s.isRunning ? 'var(--accent-green)' : 'var(--accent-blue)'} weight="duotone" />
                        <span className="home-project-name">{s.dirName}</span>
                        {s.isRunning && (
                          <span className="home-running-tag">
                            <SpinnerIcon size={9} className="home-running-spin" />
                            Running
                          </span>
                        )}
                        <span className="home-project-time">{relativeTime(s.lastModified)}</span>
                      </div>
                      <div className="home-project-path" title={s.workingDir}>{s.workingDir}</div>
                      {s.title && s.title !== '(empty)' && (
                        <div className="home-project-preview">{s.title}</div>
                      )}
                      <div className="home-project-meta">
                        <TerminalIcon size={10} />
                        {s.messageCount} message{s.messageCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
