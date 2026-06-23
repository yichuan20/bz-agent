import type { CSSProperties } from 'react'
import { useState } from 'react'
import {
  Lightning, CheckCircle, XCircle, Brain, ChartLineUp,
} from '@phosphor-icons/react'
import { AppShell } from '../components/AppShell'

const ROUNDS = [
  { id: 1, user: 'Build a REST API for user management with JWT auth', agent: 'Created Express server with JWT middleware, user CRUD endpoints, and input validation. Added rate limiting and error handling.', quality: 97, tags: ['code', 'api', 'jwt'] },
  { id: 2, user: 'Analyse this sales CSV and find seasonal trends', agent: 'Loaded the dataset with pandas, applied seasonal decomposition, and identified Q4 peaks with +34% baseline. Exported a trend report.', quality: 91, tags: ['python', 'data', 'analysis'] },
  { id: 3, user: 'Create a pie chart widget for the canvas', agent: 'Generated a reactive SVG pie chart with configurable colours, legend, and hover tooltips. Widget registered to canvas.', quality: 89, tags: ['widget', 'canvas', 'svg'] },
  { id: 4, user: 'Summarise this 40-page PDF into key bullet points', agent: 'Extracted text, applied chunked summarisation, and produced a 12-bullet executive summary covering financials, strategy, and risk.', quality: 94, tags: ['worker', 'summarise', 'pdf'] },
  { id: 5, user: 'Refactor the auth middleware to use async/await', agent: 'Converted callback-based middleware to async/await pattern, added proper error propagation, and updated unit tests.', quality: 88, tags: ['refactor', 'async', 'typescript'] },
  { id: 6, user: 'Write a market analysis report for APAC entry', agent: 'Produced a 5-section report covering market size, competitive landscape, regulatory requirements, and recommended entry strategy.', quality: 82, tags: ['worker', 'research', 'report'] },
  { id: 7, user: 'Create a real-time stock ticker widget', agent: 'Built a WebSocket-backed ticker component with 30s polling, sparklines, and colour-coded delta indicators.', quality: 95, tags: ['widget', 'websocket', 'typescript'] },
  { id: 8, user: 'Debug the memory leak in the data pipeline', agent: 'Traced the leak to an unclosed file handle in the CSV reader. Applied context manager fix and added resource monitoring.', quality: 93, tags: ['debug', 'python', 'performance'] },
  { id: 9, user: 'Generate SQL queries for the product catalogue', agent: 'Created optimised queries for product listing, category filtering, full-text search, and inventory aggregation.', quality: 86, tags: ['sql', 'database'] },
  { id: 10, user: 'Build a drag-and-drop dashboard layout', agent: 'Implemented a responsive grid with drag-and-drop reordering, widget persistence, and undo/redo history.', quality: 90, tags: ['widget', 'canvas', 'ux'] },
]

const SESSIONS = [
  { id: 'job-001', date: '2024-10-15', status: 'completed', rounds: 10, tokens: '2.4M', epochs: 3, duration: '14m', bal: 0.412, acc: '+3.2%' },
  { id: 'job-002', date: '2024-10-12', status: 'completed', rounds: 8, tokens: '1.9M', epochs: 3, duration: '11m', bal: 0.438, acc: '+2.8%' },
  { id: 'job-003', date: '2024-10-08', status: 'failed', rounds: 6, tokens: '1.1M', epochs: 2, duration: '7m', bal: null, acc: null },
  { id: 'job-004', date: '2024-10-04', status: 'completed', rounds: 10, tokens: '2.3M', epochs: 3, duration: '13m', bal: 0.461, acc: '+2.1%' },
  { id: 'job-005', date: '2024-09-29', status: 'completed', rounds: 9, tokens: '2.1M', epochs: 3, duration: '12m', bal: 0.489, acc: '+1.7%' },
]

const EVAL_METRICS = [
  { label: 'Task Accuracy', baseline: '86.2%', trained: '89.4%', delta: '+3.2%' },
  { label: 'Response Quality', baseline: '81.5%', trained: '87.0%', delta: '+5.5%' },
  { label: 'Domain Adaptation', baseline: '78.3%', trained: '84.1%', delta: '+5.8%' },
  { label: 'Efficiency (lat.)', baseline: '92.1%', trained: '93.4%', delta: '+1.3%' },
  { label: 'Consistency', baseline: '83.7%', trained: '87.9%', delta: '+4.2%' },
]

const BAL_COMPONENTS = [
  { label: 'Task Loss (L_task)', weight: 30, value: 0.38, color: 'var(--accent-blue)' },
  { label: 'Preference Loss (L_pref)', weight: 25, value: 0.44, color: 'var(--accent-pink)' },
  { label: 'Domain Loss (L_domain)', weight: 20, value: 0.41, color: 'var(--accent-orange)' },
  { label: 'Efficiency Loss (L_eff)', weight: 15, value: 0.39, color: 'var(--accent-cyan)' },
  { label: 'Consistency Loss (L_cons)', weight: 10, value: 0.43, color: 'var(--accent-green)' },
]

function QualityBar({ value }: { value: number }) {
  const color = value >= 90 ? 'var(--accent-green)' : value >= 80 ? 'var(--accent-orange)' : 'var(--accent-red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--bg-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 28, textAlign: 'right' }}>{value}%</span>
    </div>
  )
}

function Tag({ label }: { label: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '1px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-heading)' }}>
      {label}
    </span>
  )
}

// Mini sparkline for accuracy progression
function AccuracySparkline() {
  const pts = [82.5, 84.1, 86.2, 89.4]
  const w = 200, h = 40
  const min = 80, max = 92
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w)
  const ys = pts.map(v => h - ((v - min) / (max - min)) * h)
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ')
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <path d={path} fill="none" stroke="var(--accent-blue)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((v, i) => (
        <g key={i}>
          <circle cx={xs[i]} cy={ys[i]} r={4} fill="var(--accent-blue)" />
          <text x={xs[i]} y={ys[i] - 8} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">{v}%</text>
        </g>
      ))}
    </svg>
  )
}

interface Props { theme: 'light' | 'dark'; onToggleTheme: () => void; onNavigate?: (nav: string) => void }

export function Learning({ theme, onToggleTheme, onNavigate }: Props) {
  const [tab, setTab] = useState<'data' | 'eval' | 'sessions'>('data')
  const [expanded, setExpanded] = useState<number | null>(null)

  const tabS = (active: boolean): CSSProperties => ({
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
    borderBottom: active ? '2px solid var(--accent-blue)' : '2px solid transparent',
    background: 'transparent',
    border: 'none',
    fontFamily: 'var(--font-body)',
    transition: 'all 0.15s',
  })

  return (
    <AppShell activeNav="learning" theme={theme} onToggleTheme={onToggleTheme} onNavigate={onNavigate}>
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Live Learning</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Align the model to your preferences using conversation data</p>
          </div>
          <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lightning size={14} weight="fill" />
            Run Training Job
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { label: 'Training Rounds', value: '10', icon: <Brain size={14} /> },
            { label: 'Avg Quality', value: '89.0%', icon: <ChartLineUp size={14} /> },
            { label: 'Jobs Run', value: '5', icon: <Lightning size={14} /> },
            { label: 'BAL Score', value: '0.412', icon: <ChartLineUp size={14} /> },
          ].map(s => (
            <div key={s.label} className="card" style={{ flex: 1, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: 'var(--accent-blue)', opacity: 0.7 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-primary)', padding: '0 16px' }}>
            <button style={tabS(tab === 'data')} onClick={() => setTab('data')}>Training Data</button>
            <button style={tabS(tab === 'eval')} onClick={() => setTab('eval')}>Latest Evaluation</button>
            <button style={tabS(tab === 'sessions')} onClick={() => setTab('sessions')}>Training Sessions</button>
          </div>

          {/* Training Data */}
          {tab === 'data' && (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ROUNDS.map(r => (
                <div key={r.id} style={{ borderRadius: 8, border: '1px solid var(--border-primary)', overflow: 'hidden' }}>
                  <div
                    style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-heading)', minWidth: 24 }}>#{r.id}</span>
                    <span style={{ flex: 1, fontSize: 13 }}>{r.user}</span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {r.tags.map(t => <Tag key={t} label={t} />)}
                    </div>
                    <div style={{ width: 120, flexShrink: 0 }}>
                      <QualityBar value={r.quality} />
                    </div>
                  </div>
                  {expanded === r.id && (
                    <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border-primary)', background: 'var(--bg-secondary)' }}>
                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 8 }}>
                        User: "{r.user}"
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{r.agent}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Evaluation */}
          {tab === 'eval' && (
            <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
              <div>
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600 }}>Metric Comparison — Job job-001</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Metric', 'Baseline', 'Trained', 'Δ'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-tertiary)', fontSize: 11, borderBottom: '1px solid var(--border-primary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {EVAL_METRICS.map(m => (
                      <tr key={m.label} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 500 }}>{m.label}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{m.baseline}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{m.trained}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--accent-green)', fontWeight: 700 }}>{m.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600 }}>Accuracy Progression</h3>
                <div style={{ marginBottom: 20 }}><AccuracySparkline /></div>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>BAL Components</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {BAL_COMPONENTS.map(c => (
                    <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 200 }}>{c.label} <span style={{ color: 'var(--text-tertiary)' }}>({c.weight}%)</span></span>
                      <div style={{ flex: 1, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${c.value * 100}%`, height: '100%', background: c.color, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, minWidth: 36, textAlign: 'right', fontFamily: 'var(--font-heading)' }}>{c.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sessions */}
          {tab === 'sessions' && (
            <div style={{ padding: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    {['Job ID', 'Date', 'Status', 'Rounds', 'Tokens', 'Duration', 'BAL', 'Accuracy Gain'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-tertiary)', fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SESSIONS.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-primary)', cursor: 'pointer' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-heading)', fontSize: 11 }}>{s.id}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{s.date}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: s.status === 'completed' ? 'color-mix(in srgb, var(--accent-green) 12%, transparent)' : 'color-mix(in srgb, var(--accent-red) 12%, transparent)', fontSize: 11, fontWeight: 600, color: s.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {s.status === 'completed' ? <CheckCircle size={11} weight="fill" /> : <XCircle size={11} weight="fill" />}
                          {s.status}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>{s.rounds}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{s.tokens}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{s.duration}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-heading)', fontSize: 12 }}>{s.bal ?? '—'}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: s.acc ? 'var(--accent-green)' : 'var(--text-tertiary)' }}>{s.acc ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
