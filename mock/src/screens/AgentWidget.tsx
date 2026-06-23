import type { CSSProperties } from 'react'
import { AgentPageShell, ChatPanel, WIDGET_MSGS } from './AgentShared'
import { DotsNine, ArrowsOut } from '@phosphor-icons/react'

// ─── Pie Chart SVG widget ─────────────────────────────────────────────────────
function PieChart() {
  const slices = [
    { label: 'Software', pct: 45, color: '#1473DF' },
    { label: 'Services', pct: 30, color: '#2DB970' },
    { label: 'Hardware', pct: 25, color: '#D97706' },
  ]
  let cumAngle = -90
  const r = 60, cx = 80, cy = 80

  const paths = slices.map(s => {
    const start = cumAngle
    const sweep = (s.pct / 100) * 360
    cumAngle += sweep
    const startR = (start * Math.PI) / 180
    const endR = ((start + sweep) * Math.PI) / 180
    const x1 = cx + r * Math.cos(startR)
    const y1 = cy + r * Math.sin(startR)
    const x2 = cx + r * Math.cos(endR)
    const y2 = cy + r * Math.sin(endR)
    const large = sweep > 180 ? 1 : 0
    return { path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`, ...s }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0' }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        {paths.map(p => <path key={p.label} d={p.path} fill={p.color} />)}
        <circle cx={cx} cy={cy} r={30} fill="var(--bg-primary)" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {slices.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.pct}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Bar Chart SVG widget ─────────────────────────────────────────────────────
function BarChart() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  const values = [180, 220, 195, 260, 310, 285]
  const max = Math.max(...values)
  const w = 260, h = 100, barW = 28, gap = 12, padL = 10

  return (
    <svg width={w} height={h + 20} viewBox={`0 0 ${w} ${h + 20}`} style={{ overflow: 'visible' }}>
      {values.map((v, i) => {
        const x = padL + i * (barW + gap)
        const barH = (v / max) * h
        const y = h - barH
        return (
          <g key={months[i]}>
            <rect x={x} y={y} width={barW} height={barH} rx={4} fill="var(--accent-blue)" opacity={0.85} />
            <text x={x + barW / 2} y={h + 14} textAnchor="middle" fontSize={10} fill="var(--text-tertiary)">{months[i]}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Table widget ─────────────────────────────────────────────────────────────
function TableWidget() {
  const rows = [
    { symbol: 'AAPL', name: 'Apple', weight: '35%', value: '$42,350', gain: '+2.4%', pos: true },
    { symbol: 'TSLA', name: 'Tesla', weight: '25%', value: '$30,250', gain: '-1.2%', pos: false },
    { symbol: 'GOOGL', name: 'Alphabet', weight: '25%', value: '$30,250', gain: '+0.8%', pos: true },
    { symbol: 'MSFT', name: 'Microsoft', weight: '15%', value: '$18,150', gain: '+1.6%', pos: true },
  ]
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
          {['Symbol', 'Name', 'Weight', 'Value', 'Day'].map(h => (
            <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-tertiary)', fontSize: 11 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.symbol} style={{ borderBottom: '1px solid var(--border-primary)' }}>
            <td style={{ padding: '7px 8px', fontFamily: 'var(--font-heading)', fontSize: 11, fontWeight: 700 }}>{r.symbol}</td>
            <td style={{ padding: '7px 8px', color: 'var(--text-secondary)' }}>{r.name}</td>
            <td style={{ padding: '7px 8px' }}>{r.weight}</td>
            <td style={{ padding: '7px 8px', fontWeight: 500 }}>{r.value}</td>
            <td style={{ padding: '7px 8px', color: r.pos ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>{r.gain}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Sharpe ratio card ────────────────────────────────────────────────────────
function SharpeCard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6 }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Sharpe Ratio</div>
      <div style={{ fontSize: 42, fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--accent-blue)' }}>1.84</div>
      <div style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 500 }}>↑ Excellent risk-adjusted return</div>
    </div>
  )
}

// ─── Widget card ─────────────────────────────────────────────────────────────
function WidgetCard({ title, w = 340, h = 220, children }: { title: string; w?: number; h?: number; children: React.ReactNode }) {
  const s: CSSProperties = {
    width: w, height: h,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-sm)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }
  return (
    <div style={s}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2 }}><ArrowsOut size={12} /></button>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2 }}><DotsNine size={12} /></button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: 12 }}>{children}</div>
    </div>
  )
}

// ─── Canvas ───────────────────────────────────────────────────────────────────
function Canvas() {
  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-secondary)', padding: 24, position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignContent: 'flex-start' }}>
        <WidgetCard title="Portfolio Allocation" w={340} h={230}>
          <PieChart />
        </WidgetCard>
        <WidgetCard title="Price History (90d)" w={340} h={160}>
          <BarChart />
        </WidgetCard>
        <WidgetCard title="Holdings" w={700} h={200}>
          <div style={{ overflow: 'auto', height: '100%' }}>
            <TableWidget />
          </div>
        </WidgetCard>
        <WidgetCard title="Sharpe Ratio" w={200} h={160}>
          <SharpeCard />
        </WidgetCard>
      </div>
    </div>
  )
}

interface Props { theme: 'light' | 'dark'; onToggleTheme: () => void }

export function AgentWidget({ theme, onToggleTheme }: Props) {
  return (
    <AgentPageShell mode="widget" theme={theme} onToggleTheme={onToggleTheme}>
      <ChatPanel messages={WIDGET_MSGS} width={420} />
      <Canvas />
    </AgentPageShell>
  )
}
