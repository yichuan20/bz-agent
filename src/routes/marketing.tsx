import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { isLoggedIn } from '#/auth-store';
import { BoltzbitLogo } from '#/components/BoltzbitLogo';
import { CubeGridBackground } from '#/components/CubeGridBackground';

export const Route = createFileRoute('/marketing')({
  component: MarketingPage,
});

// ── Live clock widget ─────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="mkt-clock">
      <div className="mkt-clock-time">{pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}</div>
      <div className="mkt-clock-date">{time.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
    </div>
  );
}

// ── Chat mockup ───────────────────────────────────────────────────────────────
const CHAT_MSGS = [
  { role: 'user',  text: 'Summarise the architecture of this project' },
  { role: 'ai',    text: 'This is a local AI coding assistant — a React + Python bridge over bzcode. The frontend handles four agent modes (General, Widget, Worker, Coder) each with its own UI layout and identity.' },
  { role: 'user',  text: 'What files should I look at first?' },
  { role: 'ai',    text: 'Start with server.py (WebSocket bridge), src/routes/_app/agent.tsx (main agent UI), and agent_modes.json (mode configuration).' },
];

function ChatMockup() {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setVisible(v => (v >= CHAT_MSGS.length ? 0 : v + 1)), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mkt-mock mkt-mock--chat">
      <div className="mkt-mock-bar">
        <span className="mkt-mock-dot" style={{ background: '#ff5f57' }} />
        <span className="mkt-mock-dot" style={{ background: '#febc2e' }} />
        <span className="mkt-mock-dot" style={{ background: '#28c840' }} />
        <span className="mkt-mock-bar-title">General · bz-agent</span>
      </div>
      <div className="mkt-mock-chat-body">
        {CHAT_MSGS.slice(0, visible).map((m, i) => (
          <div key={i} className={`mkt-chat-msg mkt-chat-msg--${m.role}`}>
            {m.role === 'ai' && <span className="mkt-chat-avatar">✦</span>}
            <span className="mkt-chat-bubble">{m.text}</span>
          </div>
        ))}
        {visible > 0 && visible < CHAT_MSGS.length && visible % 2 === 0 && (
          <div className="mkt-chat-typing">
            <span /><span /><span />
          </div>
        )}
      </div>
      <div className="mkt-mock-input">Ask the agent something…</div>
    </div>
  );
}

// ── Widget canvas mockup ──────────────────────────────────────────────────────
const BAR_DATA = [
  { label: 'Jan', h: 42 },
  { label: 'Feb', h: 67 },
  { label: 'Mar', h: 53 },
  { label: 'Apr', h: 88 },
  { label: 'May', h: 61 },
];

function WidgetMockup() {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="mkt-mock mkt-mock--canvas">
      <div className="mkt-mock-bar">
        <span className="mkt-mock-dot" style={{ background: '#ff5f57' }} />
        <span className="mkt-mock-dot" style={{ background: '#febc2e' }} />
        <span className="mkt-mock-dot" style={{ background: '#28c840' }} />
        <span className="mkt-mock-bar-title">Widget Canvas</span>
      </div>
      <div className="mkt-canvas-grid">
        {/* Bar chart widget */}
        <div className="mkt-widget-card mkt-widget-card--wide">
          <div className="mkt-widget-title">Monthly Revenue</div>
          <div className="mkt-barchart">
            {BAR_DATA.map((b, i) => (
              <div key={b.label} className="mkt-bar-col">
                <div
                  className="mkt-bar"
                  style={{
                    height: animated ? `${b.h}%` : '0%',
                    transitionDelay: `${i * 0.12 + 0.3}s`,
                  }}
                />
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Clock widget */}
        <div className="mkt-widget-card">
          <LiveClock />
        </div>
        {/* KPI widget */}
        <div className="mkt-widget-card">
          <div className="mkt-kpi-label">Active Sessions</div>
          <div className="mkt-kpi-value">2,841</div>
          <div className="mkt-kpi-delta mkt-kpi-delta--up">+7% ↑</div>
        </div>
      </div>
    </div>
  );
}

// ── Worker / document mockup ──────────────────────────────────────────────────
const DOC_LINES = [
  { indent: 0, bold: true,  text: 'Project Proposal — BoltzAgent' },
  { indent: 0, bold: false, text: '' },
  { indent: 0, bold: true,  text: 'Executive Summary' },
  { indent: 0, bold: false, text: 'BoltzAgent is a local-first AI coding assistant that wraps bzcode into a multi-mode workspace for developers and knowledge workers.' },
  { indent: 0, bold: false, text: '' },
  { indent: 0, bold: true,  text: 'Key Objectives' },
  { indent: 1, bold: false, text: '→  Local execution with no data leaving the machine' },
  { indent: 1, bold: false, text: '→  Four specialised agent modes per project' },
  { indent: 1, bold: false, text: '→  Persistent sessions and per-project memory' },
  { indent: 0, bold: false, text: '' },
  { indent: 0, bold: true,  text: 'Timeline' },
  { indent: 1, bold: false, text: 'Q1 2026 — Core infrastructure and General mode' },
  { indent: 1, bold: false, text: 'Q2 2026 — Widget Canvas and Coder mode' },
];

function WorkerMockup() {
  const [lines, setLines] = useState(0);
  useEffect(() => {
    if (lines >= DOC_LINES.length) return;
    const id = setTimeout(() => setLines(l => l + 1), lines === 0 ? 800 : 180);
    return () => clearTimeout(id);
  }, [lines]);
  return (
    <div className="mkt-mock mkt-mock--worker">
      <div className="mkt-mock-bar">
        <span className="mkt-mock-dot" style={{ background: '#ff5f57' }} />
        <span className="mkt-mock-dot" style={{ background: '#febc2e' }} />
        <span className="mkt-mock-dot" style={{ background: '#28c840' }} />
        <span className="mkt-mock-bar-title">Worker · project-proposal.md</span>
      </div>
      <div className="mkt-doc-body">
        {DOC_LINES.slice(0, lines).map((l, i) => (
          <div
            key={i}
            className="mkt-doc-line"
            style={{ paddingLeft: l.indent * 16, fontWeight: l.bold ? 600 : 400 }}
          >
            {l.text || ' '}
            {i === lines - 1 && <span className="mkt-cursor" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Coder mockup ──────────────────────────────────────────────────────────────
type Tok = { c: string; t: string };
const CODE_LINES: Tok[][] = [
  [{ c:'k', t:'import' }, { c:'p', t:' { useState, useEffect }' }, { c:'k', t:' from' }, { c:'s', t:" 'react'" }],
  [{ c:'k', t:'import' }, { c:'p', t:' { EditorPanel }' }, { c:'k', t:' from' }, { c:'s', t:" '#/components/EditorPanel'" }],
  [{ c:'p', t:'' }],
  [{ c:'k', t:'export' }, { c:'k', t:' default' }, { c:'k', t:' function' }, { c:'f', t:' App' }, { c:'p', t:'() {' }],
  [{ c:'p', t:'  ' }, { c:'k', t:'const' }, { c:'p', t:' [cwd, setCwd] = ' }, { c:'f', t:'useState' }, { c:'s', t:"('')" }],
  [{ c:'p', t:'' }],
  [{ c:'p', t:'  ' }, { c:'f', t:'useEffect' }, { c:'p', t:'(() => {' }],
  [{ c:'c', t:'    // load last project from localStorage' }],
  [{ c:'p', t:'    ' }, { c:'k', t:'const' }, { c:'p', t:' saved = localStorage.' }, { c:'f', t:'getItem' }, { c:'s', t:"('cwd')" }],
  [{ c:'p', t:'    ' }, { c:'k', t:'if' }, { c:'p', t:' (saved) ' }, { c:'f', t:'setCwd' }, { c:'p', t:'(saved)' }],
  [{ c:'p', t:'  }, [])' }],
  [{ c:'p', t:'' }],
  [{ c:'p', t:'  ' }, { c:'k', t:'return' }, { c:'p', t:' <' }, { c:'b', t:'EditorPanel' }, { c:'p', t:' cwd={cwd} />' }],
  [{ c:'p', t:'}' }],
];

const TREE = ['src/', '  components/', '    EditorPanel.tsx', '    FolderTree.tsx', '  routes/', '    _app/', '      agent.tsx', 'server.py'];

function CoderMockup() {
  const [codeLines, setCodeLines] = useState(0);
  useEffect(() => {
    if (codeLines >= CODE_LINES.length) return;
    const id = setTimeout(() => setCodeLines(l => l + 1), codeLines === 0 ? 600 : 160);
    return () => clearTimeout(id);
  }, [codeLines]);

  const tokColor: Record<string, string> = {
    k: '#569CD6', s: '#CE9178', c: '#6A9955', f: '#DCDCAA', b: '#4EC9B0', p: '#D4D4D4',
  };

  return (
    <div className="mkt-mock mkt-mock--coder">
      <div className="mkt-mock-bar">
        <span className="mkt-mock-dot" style={{ background: '#ff5f57' }} />
        <span className="mkt-mock-dot" style={{ background: '#febc2e' }} />
        <span className="mkt-mock-dot" style={{ background: '#28c840' }} />
        <span className="mkt-mock-bar-title">Coder · App.tsx</span>
      </div>
      <div className="mkt-coder-body">
        {/* File tree */}
        <div className="mkt-coder-tree">
          <div className="mkt-coder-tree-hdr">BZ-AGENT</div>
          {TREE.map((f, i) => (
            <div key={i} className={`mkt-coder-tree-item${f === '    EditorPanel.tsx' ? ' mkt-coder-tree-item--active' : ''}`}
              style={{ paddingLeft: (f.match(/^ */)?.[0].length ?? 0) * 4 + 8 }}>
              {f.trim()}
            </div>
          ))}
        </div>
        {/* Code */}
        <div className="mkt-coder-editor">
          {CODE_LINES.slice(0, codeLines).map((line, i) => (
            <div key={i} className="mkt-coder-line">
              <span className="mkt-coder-linenum">{i + 1}</span>
              {line.map((tok, j) => (
                <span key={j} style={{ color: tokColor[tok.c] ?? '#D4D4D4' }}>{tok.t}</span>
              ))}
              {i === codeLines - 1 && <span className="mkt-cursor mkt-cursor--code" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Live Learning mockup — /learn command in a chat window ───────────────────
//  Phase 0: context messages visible          (0 – 2.0 s)
//  Phase 1: user types "/learn"               (2.0 – 3.4 s)
//  Phase 2: thinking dots                     (3.4 – 5.0 s)
//  Phase 3: upgrade card appears + metrics    (5.0 – 9.5 s)
//  Phase 4: pause then reset                  (9.5 – 11 s → loop)

const LL_PHASE_MS = [2000, 1400, 1600, 4500, 1500];

function StarRating({ value }: { value: number }) {
  // value is e.g. 3.5 or 4.0 out of 5
  return (
    <span className="mkt-ll-stars">
      {[1,2,3,4,5].map(n => {
        const fill = Math.min(1, Math.max(0, value - (n - 1)));
        return (
          <span key={n} className="mkt-ll-star" style={{ '--fill': fill } as React.CSSProperties}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1l1.3 2.6L10 4.1l-2 1.9.5 2.8L6 7.5l-2.5 1.3.5-2.8-2-1.9 2.7-.5z"
                stroke="#F59E0B" strokeWidth="0.8" fill="none" />
              <clipPath id={`sf${n}`}><rect x="0" y="0" width={`${fill * 12}`} height="12"/></clipPath>
              <path d="M6 1l1.3 2.6L10 4.1l-2 1.9.5 2.8L6 7.5l-2.5 1.3.5-2.8-2-1.9 2.7-.5z"
                fill="#F59E0B" clipPath={`url(#sf${n})`} />
            </svg>
          </span>
        );
      })}
      <span className="mkt-ll-star-val">{value.toFixed(1)}/5</span>
    </span>
  );
}

function LiveLearningMockup() {
  const [phase,    setPhase]    = useState(0);
  const [accuracy, setAccuracy] = useState(75);
  const [eff,      setEff]      = useState(3.5);

  // Drive phase transitions
  useEffect(() => {
    let cancelled = false;
    async function run() {
      for (let p = 0; p < LL_PHASE_MS.length; p++) {
        if (cancelled) return;
        setPhase(p);
        if (p === 3) {
          // animate metrics during phase 3
          const steps = 8;
          for (let s = 1; s <= steps; s++) {
            await new Promise(r => setTimeout(r, LL_PHASE_MS[3]! / steps));
            if (cancelled) return;
            setAccuracy(75 + Math.round((82 - 75) * (s / steps)));
            setEff(+(3.5 + (4.0 - 3.5) * (s / steps)).toFixed(2));
          }
        } else {
          await new Promise(r => setTimeout(r, LL_PHASE_MS[p]!));
        }
      }
      if (!cancelled) {
        // reset
        setAccuracy(75);
        setEff(3.5);
      }
    }
    const loop = setInterval(() => {
      setPhase(0); setAccuracy(75); setEff(3.5);
      run();
    }, LL_PHASE_MS.reduce((a, b) => a + b, 0) + 400);
    run();
    return () => { cancelled = true; clearInterval(loop); };
  }, []);

  const showLearnMsg  = phase >= 1;
  const showThinking  = phase === 2;
  const showCard      = phase >= 3;

  return (
    <div className="mkt-ll">
      <div className="mkt-mock-bar">
        <span className="mkt-mock-dot" style={{ background: '#ff5f57' }} />
        <span className="mkt-mock-dot" style={{ background: '#febc2e' }} />
        <span className="mkt-mock-dot" style={{ background: '#28c840' }} />
        <span className="mkt-mock-bar-title">BoltzAgent · bz-agent</span>
      </div>
      <div className="mkt-ll-chat">
        {/* Existing context messages */}
        <div className="mkt-chat-msg mkt-chat-msg--user">
          <span className="mkt-chat-bubble">Refactor the auth module to use JWT</span>
        </div>
        <div className="mkt-chat-msg mkt-chat-msg--ai">
          <span className="mkt-chat-avatar">✦</span>
          <span className="mkt-chat-bubble">Done — updated auth.ts, added token refresh logic, and wrote tests.</span>
        </div>

        {/* /learn command */}
        {showLearnMsg && (
          <div className="mkt-chat-msg mkt-chat-msg--user mkt-ll-learn-in">
            <span className="mkt-chat-bubble mkt-chat-bubble--cmd">/learn</span>
          </div>
        )}

        {/* Thinking */}
        {showThinking && (
          <div className="mkt-chat-msg mkt-chat-msg--ai">
            <span className="mkt-chat-avatar">✦</span>
            <div className="mkt-chat-typing"><span /><span /><span /></div>
          </div>
        )}

        {/* Upgrade card */}
        {showCard && (
          <div className="mkt-chat-msg mkt-chat-msg--ai mkt-ll-card-in">
            <span className="mkt-chat-avatar mkt-chat-avatar--glow">✦</span>
            <div className="mkt-ll-upgrade-card">
              <div className="mkt-ll-upgrade-header">
                <span className="mkt-ll-upgrade-label">Live Learning complete</span>
                <span className="mkt-ll-version">v3.1 → v3.2</span>
              </div>
              <div className="mkt-ll-upgrade-rows">
                <div className="mkt-ll-upgrade-row">
                  <span className="mkt-ll-upgrade-key">Training tokens</span>
                  <span className="mkt-ll-upgrade-val mkt-ll-upgrade-val--neutral">3M</span>
                </div>
                <div className="mkt-ll-upgrade-row">
                  <span className="mkt-ll-upgrade-key">Accuracy</span>
                  <span className="mkt-ll-upgrade-val mkt-ll-upgrade-val--up">
                    75% → {accuracy}%
                    {accuracy > 75 && <span className="mkt-ll-badge">↑ +{accuracy - 75}%</span>}
                  </span>
                </div>
                <div className="mkt-ll-upgrade-row">
                  <span className="mkt-ll-upgrade-key">Efficiency</span>
                  <span className="mkt-ll-upgrade-val mkt-ll-upgrade-val--up">
                    <StarRating value={eff} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Testimonials data ─────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    initials: 'AK',
    name:     'Alex Kim',
    role:     'Staff Engineer, Fintech startup',
    quote:    "Coder mode is the only agent that actually understands our monorepo. It runs the build, reads the error, fixes it — and the Live Learning means it stops making the same mistakes after a few sessions.",
    color:    '#1473DF',
  },
  {
    initials: 'SR',
    name:     'Sofia Reyes',
    role:     'Head of Content, SaaS company',
    quote:    "Worker mode drafts our marketing copy, then I edit directly in the same panel the agent is watching. It picks up my voice after two sessions and I barely need to revise anymore.",
    color:    '#2DB970',
  },
  {
    initials: 'MT',
    name:     'Marcus Tan',
    role:     'Indie developer',
    quote:    "I vibe-coded an entire internal dashboard in Widget mode in an afternoon. The bar chart connected to our Postgres data, the agent helped wire it all up. Nothing left my machine.",
    color:    '#8250DF',
  },
];

// ── Mode SVG icons ────────────────────────────────────────────────────────────
function IconChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h13A1.5 1.5 0 0 1 18 3.5v9A1.5 1.5 0 0 1 16.5 14H11l-3 3-1.5-3H3.5A1.5 1.5 0 0 1 2 12.5v-9Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="7" cy="8" r="1" fill="currentColor" />
      <circle cx="10" cy="8" r="1" fill="currentColor" />
      <circle cx="13" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

function IconCanvas() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="12" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12" y="12" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconDocument() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 2h7.5L17 6.5V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12.5 2v5H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="7" y1="10" x2="13" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="13" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="16" x2="10" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCode() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <polyline points="6.5 5 2 10 6.5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="13.5 5 18 10 13.5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="3" x2="8" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Feature section ───────────────────────────────────────────────────────────
function FeatureSection({ icon, label, title, desc, mockup, flip = false }: {
  icon: React.ReactNode; label: string; title: string; desc: string; mockup: React.ReactNode; flip?: boolean;
}) {
  return (
    <section className={`mkt-feature-section${flip ? ' mkt-feature-section--flip' : ''}`}>
      <div className="mkt-feature-text">
        <div className="mkt-feature-pill">
          <span className="mkt-feature-pill-icon">{icon}</span>
          <span>{label}</span>
        </div>
        <h2 className="mkt-feature-h">{title}</h2>
        <p className="mkt-feature-p">{desc}</p>
      </div>
      <div className="mkt-feature-mockup">{mockup}</div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function MarketingPage() {
  const navigate  = useNavigate();
  const loggedIn  = isLoggedIn();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function handleCTA() { void navigate({ to: loggedIn ? '/' : '/login' }); }

  return (
    <div className="mkt-root">

      {/* Nav */}
      <nav className={`mkt-nav${scrolled ? ' mkt-nav--scrolled' : ''}`}>
        <div className="mkt-nav-brand">
          <BoltzbitLogo size={20} />
          <span className="mkt-nav-name">BoltzAgent</span>
        </div>
        <div className="mkt-nav-links">
          <a href="#features" className="mkt-nav-link">Features</a>
          <a href="#modes" className="mkt-nav-link">Modes</a>
          <button type="button" className="mkt-btn mkt-btn--outline" onClick={handleCTA}>
            {loggedIn ? 'Open App' : 'Log in'}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="mkt-hero">
        {/* Cube-grid canvas — same animation as the login page */}
        <CubeGridBackground opacity={0.7} />

        <div className="mkt-hero-inner">
          <div className="mkt-hero-badge">Local-first · Four modes · Your files, your data</div>
          <h1 className="mkt-hero-title">
            Your personal AI agent,<br />
            <span className="mkt-hero-accent">running on your machine.</span>
          </h1>
          <p className="mkt-hero-sub">
            BoltzAgent wraps bzcode into a multi-mode AI workspace — chat, canvas, editor, and coder —
            all running locally with zero data leaving your machine.
          </p>
          <div className="mkt-hero-actions">
            <button type="button" className="mkt-btn mkt-btn--primary mkt-btn--lg" onClick={handleCTA}>
              {loggedIn ? 'Open app →' : 'Get started →'}
            </button>
            <a href="#modes" className="mkt-btn mkt-btn--ghost">See the modes ↓</a>
          </div>
        </div>
      </section>

      {/* ── Live Learning — shown before modes ── */}
      <section className="mkt-ll-section" id="live-learning">
        <div className="mkt-ll-section-inner">
          <div className="mkt-ll-text">
            <div className="mkt-feature-pill" style={{ marginBottom: 16 }}>
              <span className="mkt-feature-pill-icon">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <span>Live Learning Engine</span>
            </div>
            <h2 className="mkt-feature-h">The model learns from you, not just about you</h2>
            <p className="mkt-feature-p">
              Most agents compact long conversations — summarising the context to save tokens.
              Boltzbit's Live Learning goes further: type <code className="mkt-inline-code">/learn</code> and
              the model updates its own weights from your conversation history. Version after version,
              it gets faster, more accurate, and needs fewer tokens to do the same work.
            </p>
            <ul className="mkt-ll-list">
              <li><strong>Model versioning</strong> — every learning run bumps the version number</li>
              <li><strong>Higher accuracy</strong> — weight updates reduce repeated mistakes</li>
              <li><strong>Better efficiency</strong> — the model knows your patterns, costs less to run</li>
              <li><strong>Per-mode learning</strong> — Coder, Worker, and Widget modes each train separately</li>
            </ul>
          </div>
          <div className="mkt-ll-mockup-wrap">
            <LiveLearningMockup />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <div id="modes" className="mkt-features-wrap">
        <FeatureSection
          icon={<IconChat />}
          label="General mode"
          title="Conversational AI that knows your project"
          desc="Ask anything — the agent reads and writes your files, searches the web, and retains context across the full conversation. Every project gets its own persistent session."
          mockup={<ChatMockup />}
        />

        <FeatureSection
          flip
          icon={<IconCanvas />}
          label="Widget mode"
          title="Build live mini-apps on a drag-and-drop canvas"
          desc="Vibe-code dashboards, widgets, and data tools in plain English. Each widget stores its own data in a local database. The canvas remembers your layout between sessions."
          mockup={<WidgetMockup />}
        />

        <FeatureSection
          icon={<IconDocument />}
          label="Worker mode"
          title="Intelligent knowledge work, right in your files"
          desc="Draft proposals, review documents, manage content — Worker mode pairs a full file tree and text editor with the agent. Edit files and the agent can act on the same content."
          mockup={<WorkerMockup />}
        />

        <FeatureSection
          flip
          icon={<IconCode />}
          label="Coder mode"
          title="Code from scratch to deployed, end to end"
          desc="Full tool set including Bash, file editing, and web fetch. Coder mode has a VS Code-style editor panel with syntax highlighting so you see what the agent is building in real time."
          mockup={<CoderMockup />}
        />
      </div>

      {/* ── Testimonials ── */}
      <section className="mkt-testimonials">
        <div className="mkt-section-inner">
          <h2 className="mkt-section-title">What builders are saying</h2>
          <p className="mkt-section-sub">From solo developers to content teams — BoltzAgent adapts to how you work.</p>
          <div className="mkt-testi-grid">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="mkt-testi-card">
                <p className="mkt-testi-quote">"{t.quote}"</p>
                <div className="mkt-testi-author">
                  <span className="mkt-testi-avatar" style={{ background: t.color }}>{t.initials}</span>
                  <div>
                    <div className="mkt-testi-name">{t.name}</div>
                    <div className="mkt-testi-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mkt-cta">
        <h2 className="mkt-cta-title">Ready to start building?</h2>
        <p className="mkt-cta-sub">Log in to open your agent workspace. Runs entirely on your machine.</p>
        <button type="button" className="mkt-btn mkt-btn--primary mkt-btn--lg" onClick={handleCTA}>
          {loggedIn ? 'Open BoltzAgent →' : 'Log in →'}
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className="mkt-footer">
        <span className="mkt-footer-brand">BoltzAgent</span>
        <span className="mkt-footer-copy">© {new Date().getFullYear()} Boltzbit. All rights reserved.</span>
      </footer>
    </div>
  );
}
