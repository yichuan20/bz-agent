import type { CSSProperties, ReactNode } from 'react'
import { useState } from 'react'
import {
  ArrowUp, Paperclip, Robot, Palette, Article, Code,
  CaretDown, CheckCircle, Gear, ArrowLeft, DotsThree, ArrowsCounterClockwise,
  Brain, ClockCounterClockwise,
} from '@phosphor-icons/react'
import { TopBar } from '../components/AppShell'

// ─── Mock chat messages ───────────────────────────────────────────────────────
export interface Msg {
  role: 'user' | 'assistant'
  content: ReactNode
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  return (
    <div style={{ background: '#1e1e2e', borderRadius: 8, overflow: 'hidden', fontSize: 12, marginTop: 4 }}>
      <div style={{ padding: '5px 12px', background: '#2a2a3e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#888', fontFamily: 'var(--font-heading)', fontSize: 11 }}>{lang}</span>
      </div>
      <pre style={{ margin: 0, padding: '10px 14px', color: '#cdd6f4', fontFamily: 'var(--font-heading)', lineHeight: 1.6, overflow: 'auto', whiteSpace: 'pre' }}>{code}</pre>
    </div>
  )
}

function WidgetBtn({ id, label }: { id: string; label: string }) {
  return (
    <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'color-mix(in srgb, var(--accent-blue) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent)', borderRadius: 6, color: 'var(--accent-blue)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)', marginTop: 4 }}>
      <Palette size={12} />
      {label}
      <span style={{ fontSize: 10, opacity: 0.5, fontFamily: 'var(--font-heading)' }}>{id}</span>
    </button>
  )
}

export const GENERAL_MSGS: Msg[] = [
  { role: 'user', content: 'Can you analyse the Q3 sales data and create a summary report?' },
  {
    role: 'assistant', content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0 }}>I'll analyse the Q3 sales data for you. Let me start by reading the dataset…</p>
        <CodeBlock code={`import pandas as pd\n\ndf = pd.read_csv('q3_sales.csv')\nprint(df.describe())\nrevenue = df['revenue'].sum()\nprint("Total Q3 Revenue: $" + str(revenue))`} lang="python" />
        <p style={{ margin: 0 }}>Here's what I found:</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Total Q3 revenue: <strong>$2.4M</strong> (↑ 18% vs Q2)</li>
          <li>Top region: APAC <strong>+32%</strong> growth</li>
          <li>Best product line: Enterprise SaaS (+41%)</li>
        </ul>
        <p style={{ margin: 0 }}>The full report has been saved to <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>q3_analysis.md</code>.</p>
      </div>
    )
  },
  { role: 'user', content: 'Great! Can you also compare it to Q2 and highlight key trends?' },
  {
    role: 'assistant', content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0 }}>Comparing Q2 vs Q3 across all dimensions…</p>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)' }}>
                {['Metric', 'Q2', 'Q3', 'Change'].map(h => (
                  <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Revenue', '$2.03M', '$2.40M', '+18%'],
                ['Orders', '1,247', '1,508', '+21%'],
                ['Avg order value', '$1,628', '$1,592', '-2%'],
                ['New customers', '203', '289', '+42%'],
              ].map(([m, q2, q3, ch]) => (
                <tr key={m} style={{ borderTop: '1px solid var(--border-primary)' }}>
                  <td style={{ padding: '7px 12px', fontWeight: 500 }}>{m}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--text-secondary)' }}>{q2}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--text-secondary)' }}>{q3}</td>
                  <td style={{ padding: '7px 12px', color: String(ch).startsWith('+') ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>{ch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>The trend report is ready. Shall I export it to PDF or send it as a slide deck?</p>
      </div>
    )
  },
]

export const WIDGET_MSGS: Msg[] = [
  { role: 'user', content: 'Create a trading portfolio dashboard for Apple, Tesla and Google.' },
  {
    role: 'assistant', content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 12 }}>
          <Gear size={12} style={{ animation: 'spin 1.5s linear infinite' }} />
          <span>Running <em>create_widget</em>…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
        <p style={{ margin: 0 }}>I've created a portfolio dashboard with three panels:</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <WidgetBtn id="cw-a1b2c3d4e5f6" label="Portfolio Allocation" />
          <WidgetBtn id="cw-b2c3d4e5f6a1" label="Price History (90d)" />
          <WidgetBtn id="cw-c3d4e5f6a1b2" label="Holdings Table" />
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>Each widget updates every 30s. You can drag and resize them on the canvas.</p>
      </div>
    )
  },
  { role: 'user', content: 'Add a Sharpe ratio card and update the portfolio weights chart.' },
  {
    role: 'assistant', content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ margin: 0 }}>Done! I've added the Sharpe ratio card and updated the weights.</p>
        <WidgetBtn id="cw-d4e5f6a1b2c3" label="Sharpe Ratio" />
      </div>
    )
  },
]

export const WORKER_MSGS: Msg[] = [
  { role: 'user', content: 'Open the Q3 Report and summarise the key findings.' },
  {
    role: 'assistant', content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0 }}>I've opened <strong>Q3_Report.docx</strong>. Here are the key findings:</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Revenue grew 18% QoQ to $2.4M</li>
          <li>APAC was the strongest region at +32%</li>
          <li>Customer churn dropped to 2.1% (from 3.4% in Q2)</li>
          <li>New product launches contributed $340k in incremental revenue</li>
        </ul>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>Would you like me to draft an executive summary or update any sections?</p>
      </div>
    )
  },
  { role: 'user', content: 'Add a conclusion paragraph and export as PDF.' },
  { role: 'assistant', content: 'I\'ve added the conclusion and exported the document to PDF. You can find it at documents/Q3_Report_Final.pdf.' },
]

export const CODER_MSGS: Msg[] = [
  { role: 'user', content: 'Refactor the auth middleware to use JWT verification instead of session tokens.' },
  {
    role: 'assistant', content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0 }}>I'll refactor the auth middleware. Let me examine the current implementation first.</p>
        <CodeBlock code={`// src/middleware/auth.ts — Before\nexport async function authMiddleware(req, res, next) {\n  const sessionId = req.cookies['session_id']\n  const session = await db.sessions.findOne({ id: sessionId })\n  if (!session) return res.status(401).json({ error: 'Unauthorised' })\n  req.user = session.user\n  next()\n}`} lang="typescript" />
        <p style={{ margin: 0 }}>Here's the refactored version using JWT:</p>
        <CodeBlock code={`// src/middleware/auth.ts — After\nimport jwt from 'jsonwebtoken'\n\nexport async function authMiddleware(req, res, next) {\n  const token = req.headers.authorization?.split(' ')[1]\n  if (!token) return res.status(401).json({ error: 'No token' })\n  try {\n    req.user = jwt.verify(token, process.env.JWT_SECRET)\n    next()\n  } catch {\n    res.status(401).json({ error: 'Invalid token' })\n  }\n}`} lang="typescript" />
        <p style={{ margin: 0 }}>Changes applied to <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>src/middleware/auth.ts</code>. Running tests…</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-green)', fontSize: 13 }}>
          <CheckCircle size={14} weight="fill" />
          <span>All 24 tests passed</span>
        </div>
      </div>
    )
  },
]

// ─── UserMsg — full-width gray card (matches .agent-user-msg) ─────────────────
function UserMsg({ children }: { children: ReactNode }) {
  return (
    <div style={{
      marginBottom: 6,
      padding: '6px 12px',
      borderRadius: 12,
      border: '1px solid var(--border-primary)',
      background: 'var(--bg-secondary)',
      fontSize: 14,
      color: 'var(--text-primary)',
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}>
      {children}
    </div>
  )
}

// ─── AssistantMsg — 16px icon col + content (matches .agent-msg-row) ─────────
function AssistantMsg({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '16px 1fr',
      gap: 0,
      marginBottom: 6,
      minWidth: 0,
      overflow: 'hidden',
    }}>
      {/* 16px icon column — tiny block dot */}
      <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 3, color: 'var(--text-primary)', opacity: 0.3 }}>
        <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor" /></svg>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)', minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}

// ─── Input Box — matches .agent-input-box + .agent-input-controls ────────────
function InputBox({ modeColor = 'var(--accent-blue)' }: { modeColor?: string }) {
  const [value, setValue] = useState('')

  const boxS: CSSProperties = {
    maxWidth: 720,
    margin: '0 auto',
    border: `1px solid ${modeColor}`,
    borderRadius: 16,
    background: 'var(--bg-primary)',
    boxShadow: 'var(--shadow-dropdown)',
    display: 'flex',
    flexDirection: 'column',
  }
  const textareaS: CSSProperties = {
    display: 'block',
    width: '100%',
    border: 'none',
    outline: 'none',
    resize: 'none',
    background: 'transparent',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    color: 'var(--text-primary)',
    lineHeight: 1.5,
    padding: '12px 16px 4px',
    boxSizing: 'border-box',
  }
  const controlsS: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px 8px',
    gap: 2,
  }
  const ctrlBtnS: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 5,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-tertiary)',
    borderRadius: 8,
    cursor: 'pointer',
  }
  const dividerS: CSSProperties = {
    width: 1,
    height: 14,
    background: 'var(--border-primary)',
    margin: '0 4px',
    flexShrink: 0,
  }
  const submitS: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 8,
    border: 'none',
    background: value.trim() ? modeColor : 'var(--border-primary)',
    color: value.trim() ? 'white' : 'var(--text-tertiary)',
    cursor: value.trim() ? 'pointer' : 'default',
    flexShrink: 0,
    marginLeft: 2,
  }

  return (
    <div style={boxS}>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Ask the agent…"
        rows={2}
        style={textareaS}
      />
      <div style={controlsS}>
        {/* Attach */}
        <button style={ctrlBtnS} title="Attach image">
          <Paperclip size={15} />
        </button>
        <div style={dividerS} />
        {/* Live Learning toggle */}
        <button style={{ ...ctrlBtnS, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Brain size={14} />
          <span style={{ fontSize: 11, fontWeight: 500 }}>Live Learning</span>
        </button>
        <div style={dividerS} />
        {/* Token stats */}
        <span style={{ fontSize: 10, fontFamily: 'var(--font-heading)', color: 'var(--text-tertiary)', padding: '3px 4px' }}>
          in 12k · out 4k
        </span>
        {/* Spacer */}
        <span style={{ flex: 1 }} />
        {/* Mode btn */}
        <button style={{ ...ctrlBtnS, display: 'flex', gap: 4, padding: '4px 7px' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: modeColor, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-heading)', color: 'var(--text-secondary)' }}>Default</span>
          <CaretDown size={10} />
        </button>
        {/* Send */}
        <button style={submitS}>
          <ArrowUp size={14} weight="bold" />
        </button>
      </div>
    </div>
  )
}

// ─── Chat Panel — matches actual agent page layout ────────────────────────────
export function ChatPanel({ messages, width, modeColor }: {
  messages: Msg[]
  width?: number | string
  modeColor?: string
}) {
  return (
    <div style={{
      width: width ?? '100%',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      borderRight: width ? '1px solid var(--border-primary)' : 'none',
      background: 'var(--bg-primary)',
    }}>
      {/* agent-messages-wrapper: flex:1, contains the scroll area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Fade gradient at bottom */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 32, pointerEvents: 'none', zIndex: 10, background: 'linear-gradient(to top, var(--bg-primary), transparent)' }} />
        {/* chat-messages scroll container */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* chat-messages-inner — max-width 720px, centred */}
          <div style={{ maxWidth: 720, width: '100%', margin: '0 auto', padding: '16px 24px' }}>
            {messages.map((m, i) => (
              m.role === 'user'
                ? <UserMsg key={i}>{m.content}</UserMsg>
                : <AssistantMsg key={i}>{m.content}</AssistantMsg>
            ))}
          </div>
        </div>
      </div>

      {/* agent-prompt-section: flex-shrink 0, sticks to bottom */}
      <div style={{ flexShrink: 0 }}>
        {/* agent-input-bar: padding 8px 24px 16px */}
        <div style={{ padding: '8px 24px 16px' }}>
          <InputBox modeColor={modeColor ?? 'var(--accent-blue)'} />
        </div>
      </div>
    </div>
  )
}

// ─── Agent Header (40px) ──────────────────────────────────────────────────────
export function AgentHeader({ mode }: { mode: string }) {
  const modeIcon: Record<string, ReactNode> = {
    general: <Robot size={13} />,
    widget: <Palette size={13} />,
    worker: <Article size={13} />,
    coder: <Code size={13} />,
  }
  const modeColor: Record<string, string> = {
    general: 'var(--accent-blue)',
    widget: 'var(--accent-pink)',
    worker: 'var(--accent-orange)',
    coder: 'var(--accent-cyan)',
  }
  const chipBg: Record<string, string> = {
    general: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
    widget: 'color-mix(in srgb, var(--accent-pink) 12%, transparent)',
    worker: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)',
    coder: 'color-mix(in srgb, var(--accent-cyan) 12%, transparent)',
  }
  const mc = modeColor[mode]

  return (
    <div style={{
      height: 40,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      borderBottom: '1px solid var(--border-primary)',
      background: 'var(--bg-primary)',
      gap: 8,
      overflow: 'visible',
    }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12, padding: '3px 6px', borderRadius: 6 }}>
          <ArrowLeft size={13} />
          Agent
        </button>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>/</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-heading)' }}>~/projects/trading-app</span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>Trading Portfolio Dashboard</span>
      </div>

      {/* Right side badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* Eval badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 6, background: 'color-mix(in srgb, var(--accent-green) 10%, transparent)', cursor: 'pointer' }}>
          <span style={{ fontSize: 11, color: 'var(--accent-green)', fontWeight: 600 }}>92.3%</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>quality</span>
          <ArrowsCounterClockwise size={10} color="var(--text-tertiary)" />
        </div>

        {/* Mode badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 6, background: chipBg[mode], cursor: 'pointer', border: `1px solid color-mix(in srgb, ${mc} 22%, transparent)` }}>
          <span style={{ color: mc, display: 'flex', alignItems: 'center' }}>{modeIcon[mode]}</span>
          <span style={{ fontSize: 12, color: mc, fontWeight: 600, textTransform: 'capitalize' }}>{mode}</span>
          <CaretDown size={10} color={mc} />
        </div>

        {/* Connection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, color: 'var(--accent-green)', flexShrink: 0 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-green)' }} />
          Connected
        </div>

        {/* Conversations btn */}
        <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 5, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', borderRadius: 8, cursor: 'pointer' }}>
          <ClockCounterClockwise size={15} />
        </button>
      </div>
    </div>
  )
}

// ─── Agent page wrapper (no sidebar, mimics _app layout with auto-collapsed sidebar) ─
export function AgentPageShell({ mode, children, theme, onToggleTheme }: {
  mode: string; children: ReactNode; theme: 'light' | 'dark'; onToggleTheme: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      <TopBar theme={theme} onToggleTheme={onToggleTheme} />
      <AgentHeader mode={mode} />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}

export const MODE_COLORS: Record<string, string> = {
  general: 'var(--accent-blue)',
  widget: 'var(--accent-pink)',
  worker: 'var(--accent-orange)',
  coder: 'var(--accent-cyan)',
}
