import type { CSSProperties } from 'react'
import { useState } from 'react'
import {
  FolderOpen, ChatCircle, ArrowRight, Plus,
  Robot, Article, Code, Palette,
} from '@phosphor-icons/react'
import { AppShell } from '../components/AppShell'

const SESSIONS = [
  { id: 'bz-a1b2c3d4', title: 'Trading Portfolio Dashboard', path: '/projects/trading-app', messages: 23, mode: 'widget', running: true, ago: '3 min ago' },
  { id: 'bz-e5f6g7h8', title: 'Marketing Report Generator', path: '/projects/marketing', messages: 8, mode: 'general', running: false, ago: '2h ago' },
  { id: 'bz-i9j0k1l2', title: 'API Server Refactoring', path: '/projects/api-server', messages: 45, mode: 'coder', running: false, ago: 'Yesterday' },
  { id: 'bz-m3n4o5p6', title: 'Data Analysis Pipeline', path: '/projects/analytics', messages: 12, mode: 'worker', running: false, ago: '2 days ago' },
  { id: 'bz-q7r8s9t0', title: 'Customer Support Bot', path: '/projects/support', messages: 3, mode: 'general', running: false, ago: '3 days ago' },
  { id: 'bz-u1v2w3x4', title: 'Document Summarizer', path: '/home/user/documents', messages: 31, mode: 'worker', running: false, ago: 'Last week' },
]

const RECENT_QUERIES = [
  { session: 'Trading Portfolio Dashboard', text: 'Add a Sharpe ratio card and update the portfolio weights chart', ago: '3 min ago' },
  { session: 'Marketing Report Generator', text: 'Generate Q3 executive summary with YoY comparisons', ago: '2h ago' },
  { session: 'API Server Refactoring', text: 'Refactor the authentication middleware to use JWT verification', ago: 'Yesterday' },
  { session: 'Data Analysis Pipeline', text: 'Add outlier detection step before the normalisation stage', ago: '2 days ago' },
  { session: 'Document Summarizer', text: 'Summarise all reports from last month into one executive brief', ago: 'Last week' },
]

const MODE_ICONS: Record<string, JSX.Element> = {
  general: <Robot size={13} />,
  widget: <Palette size={13} />,
  worker: <Article size={13} />,
  coder: <Code size={13} />,
}

interface HomeProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onNavigate?: (nav: string) => void
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: '16px 20px', flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--accent-green)', marginTop: 4, fontWeight: 500 }}>{sub}</div>}
    </div>
  )
}

export function Home({ theme, onToggleTheme, onNavigate }: HomeProps) {
  const [prompt, setPrompt] = useState('')

  const contentS: CSSProperties = {
    flex: 1,
    overflow: 'auto',
    padding: '32px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
    maxWidth: 1100,
    width: '100%',
    margin: '0 auto',
  }

  const gridS: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
  }

  return (
    <AppShell activeNav="home" theme={theme} onToggleTheme={onToggleTheme} onNavigate={onNavigate}>
      <div style={contentS}>

        {/* Greeting */}
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Good afternoon, welcome back
          </h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
            You have 2 active sessions and 3 pending tasks
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12 }}>
          <StatCard label="Sessions" value="6" sub="2 running" />
          <StatCard label="Messages (24h)" value="147" />
          <StatCard label="Tokens used" value="24k" sub="↑ 18% vs yesterday" />
          <StatCard label="Training rounds" value="10" sub="Last run: 2h ago" />
        </div>

        {/* Prompt box */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Send to all selected sessions
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Type a message to send to selected sessions…"
              rows={2}
              style={{ flex: 1, resize: 'none', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '10px 12px', fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
            />
            <button className="btn-primary" style={{ height: 40, paddingLeft: 16, paddingRight: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowRight size={14} weight="bold" />
              Send
            </button>
          </div>
        </div>

        {/* Sessions grid + recent queries */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

          {/* Sessions */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Recent Sessions</h2>
              <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12 }}>
                <Plus size={12} weight="bold" /> New session
              </button>
            </div>
            <div style={gridS}>
              {SESSIONS.map(s => (
                <div key={s.id} className="card" style={{ padding: 16, cursor: 'pointer', transition: 'all 0.15s', position: 'relative' }}>
                  {s.running && (
                    <div style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)' }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)' }}>
                      {MODE_ICONS[s.mode]}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                      {s.mode}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, lineHeight: 1.3 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <FolderOpen size={11} />
                    {s.path}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ChatCircle size={11} /> {s.messages} messages
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.ago}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent queries */}
          <div>
            <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600 }}>Recent Queries</h2>
            <div className="card" style={{ overflow: 'hidden' }}>
              {RECENT_QUERIES.map((q, i) => (
                <div key={i} style={{ padding: '12px 16px', borderBottom: i < RECENT_QUERIES.length - 1 ? '1px solid var(--border-primary)' : 'none', cursor: 'pointer' }}>
                  <div style={{ fontSize: 11, color: 'var(--accent-blue)', fontWeight: 500, marginBottom: 4 }}>{q.session}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 4 }}>{q.text}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{q.ago}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  )
}
