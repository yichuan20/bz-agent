import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/_app/learning')({
  component: LearningPage,
});

// ── mock data ────────────────────────────────────────────────────────────────
const MOCK_ROUNDS = [
  {
    id: 1,
    ts: '2026-06-15 14:32',
    quality: 97,
    user: 'Can you refactor this Python function to use async/await and add proper error handling?',
    agent:
      'Here\'s the refactored version with async/await and comprehensive error handling:\n\n```python\nasync def fetch_data(url: str) -> dict:\n    async with aiohttp.ClientSession() as session:\n        try:\n            async with session.get(url, timeout=30) as resp:\n                resp.raise_for_status()\n                return await resp.json()\n        except aiohttp.ClientResponseError as e:\n            raise ValueError(f"HTTP {e.status}: {e.message}") from e\n```\n\nKey improvements: connection pooling via session context, explicit timeout, proper HTTP error propagation.',
    tags: ['code', 'python', 'async'],
  },
  {
    id: 2,
    ts: '2026-06-15 13:18',
    quality: 91,
    user: 'Create a bar chart widget that shows monthly revenue data',
    agent:
      "I'll create a bar chart widget for monthly revenue. Setting up the widget with Chart.js...\n\nThe widget is now live at canvas position (200, 120). It shows Jan–Jun revenue with hover tooltips, responsive sizing, and dark/light mode support. You can update the data source in the widget settings.",
    tags: ['widget', 'chart', 'data-viz'],
  },
  {
    id: 3,
    ts: '2026-06-15 11:55',
    quality: 88,
    user: 'Write a deployment script that builds the frontend and zips the essential files',
    agent:
      'Created `scripts/build-deploy.sh`. The script:\n1. Runs `pnpm build` to compile the frontend\n2. Packages app.py, server.py, requirements.txt, dist/, server_data/widgets/, bzcode/scripts/ into a zip\n3. Prints the file size and contents on completion\n\nMake it executable with `chmod +x scripts/build-deploy.sh`, then run `./scripts/build-deploy.sh [output-name]`.',
    tags: ['devops', 'scripting', 'deployment'],
  },
  {
    id: 4,
    ts: '2026-06-15 10:40',
    quality: 94,
    user: 'Add right-click context menu to the file tree with rename, duplicate, download and open options',
    agent:
      "Done. I've added:\n- Context menu component rendered at fixed position (escapes overflow)\n- Right-click on any file → Open, Rename, Duplicate, Download\n- Right-click on folder → Rename only\n- Inline rename: replaces name with an input field, commits on Enter/blur\n- Three new server endpoints: POST /api/file/rename, POST /api/file/duplicate, GET /api/file/download",
    tags: ['ui', 'file-tree', 'ux'],
  },
  {
    id: 5,
    ts: '2026-06-15 09:22',
    quality: 85,
    user: 'Why is the Excel formula not updating when I change a dependent cell?',
    agent:
      'The issue is that formula cells are only evaluated when first entered, not when dependencies change. The fix is a full recalculation pass after every cell patch:\n\n1. Apply the incoming cell update\n2. Loop over ALL cells in the sheet and re-evaluate any cell with a `formula` field\n3. Run 4 passes to handle dependency chains (A→B→C→D)\n\nThis is now implemented in `handleCellPatch` in `src/excel/index.tsx`.',
    tags: ['excel', 'bug-fix', 'formulas'],
  },
  {
    id: 6,
    ts: '2026-06-14 16:44',
    quality: 92,
    user: 'Migrate the PowerPoint editor from bz-office with toolbar, fullscreen, and thumbnail panel',
    agent:
      'Migration complete. Created:\n- `src/ppt/components/Slide.jsx` — canvas renderer with drag/resize/text/shapes\n- `src/ppt/index.tsx` — PptEditor with thumbnail sidebar, toolbar, status bar, fullscreen (browser API)\n- Server: GET /api/ppt/load and PUT /api/ppt/save via python-pptx\n- EditorPanel: .pptx/.ppt now open PptEditor; chat "Open" button routes correctly',
    tags: ['ppt', 'migration', 'canvas'],
  },
  {
    id: 7,
    ts: '2026-06-14 14:11',
    quality: 78,
    user: 'The cursor and text are not aligned in the Excel cell editor',
    agent:
      'Root cause: `StyledInput` had `padding: 2px 4px` but the color-highlight overlay `TextContainer` had zero padding, creating a 4px horizontal offset. Fixed by sharing an identical `SHARED` style object between the `<input>` and the overlay `<div>` — same fontFamily, fontSize, paddingLeft/paddingRight, boxSizing. Both are now `position: absolute; inset: 0` inside a `position: relative` container.',
    tags: ['excel', 'bug-fix', 'cursor'],
  },
  {
    id: 8,
    ts: '2026-06-14 11:05',
    quality: 96,
    user: 'Set up the live learning feature with a toggle in the input bar and notifications',
    agent:
      'Implemented the full live learning UI:\n1. Toggle button in the agent input bar (brain icon, accent color when active, persisted per session)\n2. Job notification panel: progress → training data samples → evaluation results with mock metrics\n3. `/learning` page: last 10 conversation rounds with quality scores, tags, and expandable detail\n4. Sidebar nav entry with brain icon',
    tags: ['feature', 'live-learning', 'ml'],
  },
  {
    id: 9,
    ts: '2026-06-14 09:33',
    quality: 82,
    user: 'Prepare deployment assets and write a build-deploy script',
    agent:
      'Updated DEPLOY.md with the full API surface, new Python dependencies, and a "What\'s new" section. Created `scripts/build-deploy.sh` that: runs pnpm build, zips the essential assets (app.py, server.py, requirements.txt, agent_modes.json, dist/, server_data/widgets/, bzcode/scripts/), and prints size + contents. Result: 831 KB deploy.zip.',
    tags: ['deployment', 'docs', 'devops'],
  },
  {
    id: 10,
    ts: '2026-06-13 17:28',
    quality: 89,
    user: 'When we reload the Excel file the formula is not calculated — the formulas library is not working',
    agent:
      'The server load path was only setting `cd["formula"]` when there was no cached value, and never calling the formulas library for formula cells the server had already seen. Rewrote `handle_excel_load` in three steps:\n1. Extract all formula strings from wb_forms upfront into a dict\n2. Evaluate every formula with the `formulas` library → formula_vals dict  \n3. For each cell: if formula exists, use formula_vals value (preferred) else openpyxl cached value\nClient fallback only runs for cells still missing a value after server evaluation.',
    tags: ['excel', 'formulas', 'server'],
  },
];

const QUALITY_COLOR = (q: number) =>
  q >= 90 ? 'var(--accent-green)' : q >= 75 ? 'var(--accent-orange)' : 'var(--accent-red)';

const MOCK_EVAL = {
  baselineAccuracy: 71.2,
  newAccuracy: 84.6,
  loss: 0.312,
  perplexity: 8.4,
  responseQuality: 91.3,
  domainAdaptation: '+18.2%',
  avgResponseTime: '1.4s',
};

// Behavioral Alignment Loss (BAL) — our unique loss framework.
// Measures how well the agent's behaviour aligns with this specific user's needs,
// evaluated on actual conversation outcomes (not next-token prediction).
//
//   BAL = 0.30·L_task + 0.25·L_pref + 0.20·L_domain + 0.15·L_eff + 0.10·L_cons
//
// Each component converges toward 0 as the agent improves.
const BAL_WEIGHTS = {
  task: 0.3,
  preference: 0.25,
  domain: 0.2,
  efficiency: 0.15,
  consistency: 0.1,
};

const balTotal = (c: {
  task: number;
  preference: number;
  domain: number;
  efficiency: number;
  consistency: number;
}) =>
  +(
    BAL_WEIGHTS.task * c.task +
    BAL_WEIGHTS.preference * c.preference +
    BAL_WEIGHTS.domain * c.domain +
    BAL_WEIGHTS.efficiency * c.efficiency +
    BAL_WEIGHTS.consistency * c.consistency
  ).toFixed(3);

const MOCK_SESSIONS = [
  {
    id: 5,
    date: '2026-06-15 14:00',
    status: 'completed',
    rounds: 10,
    tokens: 4812,
    epochs: 3,
    duration: '1m 48s',
    // per-epoch BAL component breakdown
    epochLoss: [
      { task: 0.712, preference: 0.831, domain: 0.654, efficiency: 0.72, consistency: 0.89 },
      { task: 0.501, preference: 0.544, domain: 0.43, efficiency: 0.48, consistency: 0.61 },
      { task: 0.218, preference: 0.285, domain: 0.312, efficiency: 0.34, consistency: 0.39 },
    ],
    metrics: {
      accuracy: 84.6,
      quality: 91.3,
      efficiency: '+18.2%',
      adaptation: '+11.5%',
      latency: '1.4s',
    },
    baselineAccuracy: 71.2,
    notes:
      "Best session so far. Task Loss dropped sharply — 3 high-quality code refactoring rounds provided clear completion signals. Preference Loss converged fastest, suggesting the agent has internalised this user's preferred response depth.",
  },
  {
    id: 4,
    date: '2026-06-14 09:15',
    status: 'completed',
    rounds: 8,
    tokens: 3644,
    epochs: 3,
    duration: '1m 22s',
    epochLoss: [
      { task: 0.801, preference: 0.755, domain: 0.82, efficiency: 0.68, consistency: 0.74 },
      { task: 0.62, preference: 0.59, domain: 0.61, efficiency: 0.51, consistency: 0.56 },
      { task: 0.412, preference: 0.43, domain: 0.521, efficiency: 0.39, consistency: 0.448 },
    ],
    metrics: {
      accuracy: 78.3,
      quality: 83.1,
      efficiency: '+12.4%',
      adaptation: '+8.7%',
      latency: '1.6s',
    },
    baselineAccuracy: 71.2,
    notes:
      "Steady improvement across all components. Domain Loss remains higher than Task Loss — the agent is still building knowledge of this user's specific document formats. Consistency Loss improved significantly, reflecting more predictable behaviour on follow-up questions.",
  },
  {
    id: 3,
    date: '2026-06-13 16:40',
    status: 'completed',
    rounds: 12,
    tokens: 5901,
    epochs: 2,
    duration: '2m 05s',
    epochLoss: [
      { task: 0.87, preference: 0.91, domain: 0.84, efficiency: 0.76, consistency: 0.92 },
      { task: 0.581, preference: 0.63, domain: 0.592, efficiency: 0.541, consistency: 0.68 },
    ],
    metrics: {
      accuracy: 74.8,
      quality: 79.4,
      efficiency: '+7.1%',
      adaptation: '+5.2%',
      latency: '1.9s',
    },
    baselineAccuracy: 71.2,
    notes:
      'Early stopping triggered after epoch 2 — BAL was still decreasing but below the minimum improvement threshold. High Consistency Loss suggests mixed-topic conversations confused the agent about user intent. Efficiency Loss improved least, indicating the agent is still over-explaining.',
  },
  {
    id: 2,
    date: '2026-06-12 11:30',
    status: 'failed',
    rounds: 6,
    tokens: 2103,
    epochs: 1,
    duration: '0m 41s',
    epochLoss: [
      { task: 0.944, preference: 0.881, domain: 0.912, efficiency: 0.87, consistency: 0.95 },
    ],
    metrics: {
      accuracy: 63.1,
      quality: 61.2,
      efficiency: '-2.1%',
      adaptation: '+0.3%',
      latency: '2.3s',
    },
    baselineAccuracy: 71.2,
    notes:
      'Job failed mid-training — only 6 rounds, too few for BAL to converge. Preference Loss and Consistency Loss barely moved from baseline. Minimum 8 rounds recommended for meaningful alignment signal.',
  },
  {
    id: 1,
    date: '2026-06-11 08:00',
    status: 'completed',
    rounds: 5,
    tokens: 1820,
    epochs: 3,
    duration: '0m 58s',
    epochLoss: [
      { task: 0.98, preference: 0.97, domain: 0.99, efficiency: 0.92, consistency: 0.96 },
      { task: 0.841, preference: 0.812, domain: 0.88, efficiency: 0.79, consistency: 0.84 },
      { task: 0.681, preference: 0.66, domain: 0.73, efficiency: 0.641, consistency: 0.71 },
    ],
    metrics: {
      accuracy: 63.4,
      quality: 68.0,
      efficiency: '+3.8%',
      adaptation: '+2.1%',
      latency: '2.1s',
    },
    baselineAccuracy: 58.1,
    notes:
      'First session — established baseline BAL of ~0.95 across all components. Small dataset (5 rounds) but loss converged cleanly across all 3 epochs. Task Loss led the way; Domain and Consistency Loss will need more data to move significantly.',
  },
];

function LearningPage() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selectedSession, setSelectedSession] = useState<(typeof MOCK_SESSIONS)[number] | null>(
    null,
  );
  const [tab, setTab] = useState<'data' | 'eval' | 'sessions'>('data');

  if (selectedSession) {
    return <SessionDetailPage session={selectedSession} onBack={() => setSelectedSession(null)} />;
  }

  return (
    <div className="ll-page">
      {/* Header */}
      <div className="ll-header">
        <div className="ll-header-left">
          <div className="ll-header-icon">
            <BrainIcon size={20} />
          </div>
          <div>
            <h1 className="ll-title">Live Learning</h1>
            <p className="ll-subtitle">
              Training data collected from your conversations · last job 2h ago
            </p>
          </div>
        </div>
        <div className="ll-header-right">
          <div className="ll-stat">
            <span className="ll-stat-val">10</span>
            <span className="ll-stat-lbl">rounds</span>
          </div>
          <div className="ll-stat">
            <span className="ll-stat-val">89.0</span>
            <span className="ll-stat-lbl">avg quality</span>
          </div>
          <div className="ll-stat">
            <span className="ll-stat-val">3</span>
            <span className="ll-stat-lbl">jobs run</span>
          </div>
          <button type="button" className="ll-run-btn" onClick={() => {}}>
            Run training job
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="ll-tabs">
        <button
          type="button"
          className={`ll-tab${tab === 'data' ? ' ll-tab--active' : ''}`}
          onClick={() => setTab('data')}
        >
          Training Data
        </button>
        <button
          type="button"
          className={`ll-tab${tab === 'eval' ? ' ll-tab--active' : ''}`}
          onClick={() => setTab('eval')}
        >
          Latest Evaluation
        </button>
        <button
          type="button"
          className={`ll-tab${tab === 'sessions' ? ' ll-tab--active' : ''}`}
          onClick={() => setTab('sessions')}
        >
          Training Sessions
        </button>
      </div>

      {tab === 'data' && (
        <div className="ll-rounds">
          {MOCK_ROUNDS.map(r => (
            <div key={r.id} className={`ll-round${expanded === r.id ? ' ll-round--open' : ''}`}>
              <button
                type="button"
                className="ll-round-header"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <span className="ll-round-num">#{r.id}</span>
                <span className="ll-round-ts">{r.ts}</span>
                <span className="ll-round-preview">
                  {r.user.slice(0, 70)}
                  {r.user.length > 70 ? '…' : ''}
                </span>
                <div className="ll-round-tags">
                  {r.tags.map(t => (
                    <span key={t} className="ll-tag">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="ll-quality" style={{ color: QUALITY_COLOR(r.quality) }}>
                  {r.quality}
                </div>
                <svg
                  className={`ll-chevron${expanded === r.id ? ' ll-chevron--open' : ''}`}
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {expanded === r.id && (
                <div className="ll-round-body">
                  <div className="ll-msg ll-msg--user">
                    <span className="ll-msg-role">User</span>
                    <p className="ll-msg-text">{r.user}</p>
                  </div>
                  <div className="ll-msg ll-msg--agent">
                    <span className="ll-msg-role">Agent</span>
                    <pre className="ll-msg-text ll-msg-pre">{r.agent}</pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'eval' && (
        <div className="ll-eval">
          <div className="ll-eval-banner">
            <div className="ll-eval-banner-icon">
              <BrainIcon size={18} />
            </div>
            <div>
              <div className="ll-eval-banner-title">Training job completed · Jun 15, 14:00</div>
              <div className="ll-eval-banner-sub">10 rounds · 4,812 tokens of training data</div>
            </div>
            <div className="ll-eval-delta">+13.4% accuracy</div>
          </div>

          <div className="ll-eval-grid">
            {[
              {
                label: 'Baseline Accuracy',
                val: `${MOCK_EVAL.baselineAccuracy}%`,
                sub: 'before training',
              },
              {
                label: 'New Accuracy',
                val: `${MOCK_EVAL.newAccuracy}%`,
                sub: 'after training',
                highlight: true,
              },
              { label: 'Loss', val: MOCK_EVAL.loss, sub: 'cross-entropy' },
              { label: 'Perplexity', val: MOCK_EVAL.perplexity, sub: 'lower is better' },
              {
                label: 'Response Quality',
                val: `${MOCK_EVAL.responseQuality}%`,
                sub: 'human eval score',
                highlight: true,
              },
              {
                label: 'Domain Adaptation',
                val: MOCK_EVAL.domainAdaptation,
                sub: 'vs base model',
                highlight: true,
              },
              { label: 'Avg Response Time', val: MOCK_EVAL.avgResponseTime, sub: 'median latency' },
            ].map(m => (
              <div key={m.label} className={`ll-metric${m.highlight ? ' ll-metric--good' : ''}`}>
                <div className="ll-metric-val">{m.val}</div>
                <div className="ll-metric-label">{m.label}</div>
                <div className="ll-metric-sub">{m.sub}</div>
              </div>
            ))}
          </div>

          <div className="ll-eval-section-title">Accuracy over training jobs</div>
          <div className="ll-sparkline">
            {[58.1, 63.4, 71.2, 84.6].map((v, i) => (
              <div key={i} className="ll-sparkline-bar-wrap">
                <div
                  className="ll-sparkline-bar"
                  style={{
                    height: `${v}%`,
                    background: i === 3 ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                  }}
                />
                <span className="ll-sparkline-lbl">job {i + 1}</span>
                <span className="ll-sparkline-val">{v}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'sessions' && (
        <div className="ll-sessions">
          <div className="ll-bal-legend">
            <span className="ll-bal-title">Behavioral Alignment Loss (BAL)</span>
            <span className="ll-bal-formula">
              = 0.30·L<sub>task</sub> + 0.25·L<sub>pref</sub> + 0.20·L<sub>domain</sub> + 0.15·L
              <sub>eff</sub> + 0.10·L<sub>cons</sub>
            </span>
            <span className="ll-bal-note">
              Lower = more aligned with your usage. Measured on conversation outcomes, not token
              prediction.
            </span>
          </div>

          {MOCK_SESSIONS.map(s => {
            const zeroEpoch = { task: 0, preference: 0, domain: 0, efficiency: 0, consistency: 0 };
            const finalEpoch = s.epochLoss.at(-1) ?? zeroEpoch;
            const finalBAL = balTotal(finalEpoch);
            const firstBAL = balTotal(s.epochLoss[0] ?? zeroEpoch);
            const gain = s.metrics.accuracy - s.baselineAccuracy;
            const statusColor =
              s.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-red)';
            return (
              <button
                type="button"
                key={s.id}
                className="ll-session"
                onClick={() => setSelectedSession(s)}
              >
                <div className="ll-session-row">
                  <div className="ll-session-id">Job #{s.id}</div>
                  <div className="ll-session-date">{s.date}</div>
                  <div className="ll-session-status" style={{ color: statusColor }}>
                    {s.status === 'completed' ? '✓ Completed' : '✗ Failed'}
                  </div>
                  <div className="ll-session-pills">
                    <span className="ll-session-pill">{s.rounds} rounds</span>
                    <span className="ll-session-pill">{s.tokens.toLocaleString()} tokens</span>
                    <span className="ll-session-pill">{s.epochs} epochs</span>
                    <span className="ll-session-pill">{s.duration}</span>
                  </div>
                  <div className="ll-session-bal">
                    <span className="ll-session-bal-label">BAL</span>
                    <span className="ll-session-bal-from">{firstBAL}</span>
                    <span className="ll-session-bal-arrow">→</span>
                    <span
                      className="ll-session-bal-to"
                      style={{
                        color: finalBAL < firstBAL ? 'var(--accent-green)' : 'var(--accent-red)',
                      }}
                    >
                      {finalBAL}
                    </span>
                  </div>
                  <div
                    className="ll-session-gain"
                    style={{ color: gain >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                  >
                    {gain >= 0 ? '+' : ''}
                    {gain.toFixed(1)}%
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    style={{ opacity: 0.4, flexShrink: 0 }}
                    aria-hidden="true"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const BAL_COMPONENTS_DEF = [
  {
    key: 'task' as const,
    label: 'Task Completion',
    weight: '30%',
    desc: 'Did the agent fully complete what was asked?',
  },
  {
    key: 'preference' as const,
    label: 'Preference Align',
    weight: '25%',
    desc: "Matches the user's observed style and depth preferences",
  },
  {
    key: 'domain' as const,
    label: 'Domain Knowledge',
    weight: '20%',
    desc: "Accuracy within the user's specific knowledge domain",
  },
  {
    key: 'efficiency' as const,
    label: 'Response Efficiency',
    weight: '15%',
    desc: 'Avoids unnecessary verbosity or unhelpful brevity',
  },
  {
    key: 'consistency' as const,
    label: 'Consistency',
    weight: '10%',
    desc: 'Coherent behaviour across similar follow-up requests',
  },
];

function SessionDetailPage({
  session,
  onBack,
}: {
  session: (typeof MOCK_SESSIONS)[number];
  onBack: () => void;
}) {
  const zeroEpoch = { task: 0, preference: 0, domain: 0, efficiency: 0, consistency: 0 };
  const finalEpoch = session.epochLoss.at(-1) ?? zeroEpoch;
  const firstEpoch = session.epochLoss[0] ?? zeroEpoch;
  const finalBAL = balTotal(finalEpoch);
  const firstBAL = balTotal(firstEpoch);
  const gain = session.metrics.accuracy - session.baselineAccuracy;
  const statusColor = session.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-red)';

  return (
    <div className="ll-page">
      {/* Header */}
      <div className="ll-detail-header">
        <button type="button" className="ll-detail-back" onClick={onBack}>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            stroke="currentColor"
            strokeWidth="2.5"
            fill="none"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Training Sessions
        </button>
        <div className="ll-detail-title-block">
          <div className="ll-detail-title">
            <span>Job #{session.id}</span>
            <span className="ll-detail-status" style={{ color: statusColor }}>
              {session.status === 'completed' ? '✓ Completed' : '✗ Failed'}
            </span>
          </div>
          <div className="ll-detail-meta">
            {session.date} · {session.rounds} rounds · {session.tokens.toLocaleString()} tokens ·{' '}
            {session.epochs} epochs · {session.duration}
          </div>
        </div>
        <div className="ll-detail-bal-badge">
          <span className="ll-detail-bal-label">BAL</span>
          <span className="ll-detail-bal-from">{firstBAL}</span>
          <span style={{ color: 'var(--text-tertiary)' }}>→</span>
          <span
            style={{
              color: finalBAL < firstBAL ? 'var(--accent-green)' : 'var(--accent-red)',
              fontWeight: 700,
            }}
          >
            {finalBAL}
          </span>
        </div>
        <div
          style={{
            color: gain >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
            fontSize: 18,
          }}
        >
          {gain >= 0 ? '+' : ''}
          {gain.toFixed(1)}% accuracy
        </div>
      </div>

      {/* Body */}
      <div className="ll-detail-body">
        {/* Outcome metrics */}
        <section className="ll-detail-section">
          <h2 className="ll-detail-section-title">Outcome Metrics</h2>
          <div className="ll-eval-grid">
            {[
              {
                label: 'Accuracy',
                val: `${session.metrics.accuracy}%`,
                sub: 'after training',
                good: true,
              },
              {
                label: 'Response Quality',
                val: `${session.metrics.quality}%`,
                sub: 'human eval score',
                good: true,
              },
              {
                label: 'Efficiency',
                val: session.metrics.efficiency,
                sub: 'vs baseline',
                good: true,
              },
              {
                label: 'Domain Adaptation',
                val: session.metrics.adaptation,
                sub: 'vs base model',
                good: true,
              },
              {
                label: 'Avg Latency',
                val: session.metrics.latency,
                sub: 'median response',
                good: false,
              },
            ].map(m => (
              <div key={m.label} className={`ll-metric${m.good ? ' ll-metric--good' : ''}`}>
                <div className="ll-metric-val">{m.val}</div>
                <div className="ll-metric-label">{m.label}</div>
                <div className="ll-metric-sub">{m.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* BAL formula banner */}
        <section className="ll-detail-section">
          <h2 className="ll-detail-section-title">Behavioral Alignment Loss (BAL)</h2>
          <div className="ll-bal-legend" style={{ marginBottom: 20 }}>
            <span className="ll-bal-formula" style={{ fontSize: 13 }}>
              BAL = 0.30·L<sub>task</sub> + 0.25·L<sub>pref</sub> + 0.20·L<sub>domain</sub> + 0.15·L
              <sub>eff</sub> + 0.10·L<sub>cons</sub>
            </span>
            <span className="ll-bal-note">
              Measured on actual conversation outcomes — not next-token prediction. Lower = more
              aligned with this user's needs.
            </span>
          </div>

          {/* Component cards */}
          <div className="ll-bal-component-cards">
            {BAL_COMPONENTS_DEF.map(({ key, label, weight, desc }) => {
              const first = firstEpoch[key];
              const last = finalEpoch[key];
              const delta = +(last - first).toFixed(3);
              return (
                <div key={key} className="ll-bal-comp-card">
                  <div className="ll-bal-comp-card-top">
                    <span className="ll-bal-comp-card-name">
                      L<sub>{key.slice(0, 4)}</sub>
                    </span>
                    <span className="ll-bal-comp-card-label">{label}</span>
                    <span className="ll-bal-comp-card-weight">{weight}</span>
                  </div>
                  <div className="ll-bal-comp-card-desc">{desc}</div>
                  <div className="ll-bal-comp-card-vals">
                    {session.epochLoss.map((ep, i) => (
                      <div key={i} className="ll-bal-comp-card-epoch">
                        <span className="ll-bal-comp-epoch-label">ep {i + 1}</span>
                        <span
                          className="ll-bal-comp-epoch-val"
                          style={{
                            color:
                              i > 0 && ep[key] < (session.epochLoss[i - 1]?.[key] ?? Infinity)
                                ? 'var(--accent-green)'
                                : 'var(--text-primary)',
                          }}
                        >
                          {ep[key]}
                        </span>
                      </div>
                    ))}
                    <div
                      className="ll-bal-comp-card-delta"
                      style={{ color: delta < 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                    >
                      {delta < 0 ? '' : '+'}
                      {delta}
                    </div>
                  </div>
                  {/* Mini bar showing convergence */}
                  <div className="ll-bal-comp-bar-track">
                    <div
                      className="ll-bal-comp-bar-fill"
                      style={{ width: `${finalEpoch[key] * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* BAL total per epoch + convergence chart */}
        <section className="ll-detail-section">
          <h2 className="ll-detail-section-title">BAL Convergence per Epoch</h2>
          <div className="ll-bal-table" style={{ marginBottom: 20 }}>
            <div className="ll-bal-table-header">
              <span>Component (weight)</span>
              {session.epochLoss.map((_, i) => (
                <span key={i}>Epoch {i + 1}</span>
              ))}
              <span>Δ total</span>
            </div>
            {BAL_COMPONENTS_DEF.map(({ key, weight }) => {
              const first = firstEpoch[key];
              const last = finalEpoch[key];
              const delta = +(last - first).toFixed(3);
              return (
                <div key={key} className="ll-bal-table-row">
                  <span className="ll-bal-comp-name">
                    L<sub>{key.slice(0, 4)}</sub> <span className="ll-bal-weight">{weight}</span>
                  </span>
                  {session.epochLoss.map((ep, i) => (
                    <span
                      key={i}
                      className="ll-bal-cell"
                      style={{
                        color:
                          i > 0 && ep[key] < (session.epochLoss[i - 1]?.[key] ?? Infinity)
                            ? 'var(--accent-green)'
                            : 'var(--text-secondary)',
                      }}
                    >
                      {ep[key]}
                    </span>
                  ))}
                  <span
                    className="ll-bal-delta"
                    style={{ color: delta < 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                  >
                    {delta < 0 ? '' : '+'}
                    {delta}
                  </span>
                </div>
              );
            })}
            <div className="ll-bal-table-row ll-bal-table-total">
              <span>BAL total</span>
              {session.epochLoss.map((ep, i) => (
                <span key={i} className="ll-bal-cell">
                  {balTotal(ep)}
                </span>
              ))}
              <span className="ll-bal-delta" style={{ color: 'var(--accent-green)' }}>
                {+(finalBAL - firstBAL).toFixed(3)}
              </span>
            </div>
          </div>

          <div className="ll-loss-curve">
            {session.epochLoss.map((ep, i) => {
              const total = balTotal(ep);
              return (
                <div key={i} className="ll-loss-point">
                  <div className="ll-loss-bar-wrap">
                    <div className="ll-loss-bar" style={{ height: `${total * 100}%` }} />
                  </div>
                  <span className="ll-loss-val">{total}</span>
                  <span className="ll-loss-epoch">ep {i + 1}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Notes */}
        <section className="ll-detail-section">
          <h2 className="ll-detail-section-title">Analysis Notes</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
            {session.notes}
          </p>
        </section>
      </div>
    </div>
  );
}

function BrainIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      stroke="currentColor"
      strokeWidth="1.75"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </svg>
  );
}
