import type { CSSProperties } from 'react'
import { useState } from 'react'
import {
  CheckCircle, Warning, XCircle, CaretDown, CaretRight, Plus, Trash,
  Key, HardDrive, ChatCircle,
} from '@phosphor-icons/react'
import { AppShell } from '../components/AppShell'

const INTEGRATIONS = [
  { name: 'Gmail', desc: 'Read and send emails', status: 'connected', icon: '✉️' },
  { name: 'Google Drive', desc: 'Access files and folders', status: 'connected', icon: '🗂️' },
  { name: 'Twilio / WhatsApp', desc: 'Send SMS and WhatsApp messages', status: 'partial', icon: '💬' },
  { name: 'SerpAPI', desc: 'Web search results', status: 'connected', icon: '🔍' },
  { name: 'Stripe', desc: 'Payment processing and billing', status: 'none', icon: '💳' },
  { name: 'Notion', desc: 'Sync notes and databases', status: 'none', icon: '📓' },
]

const CREDENTIALS = [
  { key: 'OPENAI_API_KEY', preview: 'sk-•••••••••••••••••••••••••••3f9a' },
  { key: 'STRIPE_SECRET_KEY', preview: 'sk_live_•••••••••••••••••••Xm2k' },
  { key: 'SENDGRID_API_KEY', preview: 'SG.•••••••••••••••••••••••••Lqp1' },
]

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; bg: string; icon: JSX.Element; label: string }> = {
    connected: { color: 'var(--accent-green)', bg: 'color-mix(in srgb, var(--accent-green) 10%, transparent)', icon: <CheckCircle size={12} weight="fill" />, label: 'Connected' },
    partial: { color: 'var(--accent-orange)', bg: 'color-mix(in srgb, var(--accent-orange) 10%, transparent)', icon: <Warning size={12} weight="fill" />, label: 'Partial' },
    none: { color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)', icon: <XCircle size={12} />, label: 'Not configured' },
  }
  const c = cfg[status]
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.color, fontSize: 11, fontWeight: 600 }}>
      {c.icon} {c.label}
    </div>
  )
}

function IntegrationCard({ name, desc, status, icon }: typeof INTEGRATIONS[0]) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', background: 'var(--bg-primary)' }}
        onClick={() => setOpen(!open)}
      >
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{desc}</div>
        </div>
        <StatusBadge status={status} />
        <CaretRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-tertiary)' }} />
      </div>
      {open && (
        <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              API Key / Access Token
            </label>
            <input
              type="password"
              placeholder={`Enter ${name} credentials…`}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--text-primary)', outline: 'none' }}
              readOnly
              defaultValue={status === 'connected' ? '••••••••••••••••••••' : ''}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }}>Save</button>
            {status === 'connected' && (
              <button className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px', color: 'var(--accent-red)', borderColor: 'color-mix(in srgb, var(--accent-red) 30%, transparent)' }}>Disconnect</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Disk usage bar
function DiskBar({ used, total }: { used: number; total: number }) {
  const pct = (used / total) * 100
  const color = pct > 80 ? 'var(--accent-red)' : pct > 60 ? 'var(--accent-orange)' : 'var(--accent-blue)'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{used.toFixed(1)} GB used of {total} GB</span>
        <span style={{ fontWeight: 600, color }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

interface Props { theme: 'light' | 'dark'; onToggleTheme: () => void; onNavigate?: (nav: string) => void }

export function Settings({ theme, onToggleTheme, onNavigate }: Props) {
  const [clearDays, setClearDays] = useState('30')

  const sectionS: CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 16,
  }
  const headingS: CSSProperties = {
    fontSize: 15, fontWeight: 600, margin: 0,
  }

  return (
    <AppShell activeNav="settings" theme={theme} onToggleTheme={onToggleTheme} onNavigate={onNavigate}>
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 800 }}>

        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Settings</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>Manage resources, integrations, and credentials</p>
        </div>

        {/* Resources */}
        <section style={sectionS}>
          <h2 style={headingS}>Resources</h2>
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <HardDrive size={14} color="var(--text-secondary)" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Disk Usage</span>
              </div>
              <DiskBar used={2.3} total={50} />
            </div>
            <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <ChatCircle size={14} color="var(--text-secondary)" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Conversation Sessions</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>24 sessions · 145 MB</div>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Clear older than</span>
                <select
                  value={clearDays}
                  onChange={e => setClearDays(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid var(--border-primary)', borderRadius: 7, background: 'var(--bg-secondary)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  {['7', '14', '30', '60', '90'].map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
                <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px', color: 'var(--accent-red)', borderColor: 'color-mix(in srgb, var(--accent-red) 30%, transparent)' }}>Clear</button>
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 16, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-heading)', padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
              Server data: /Users/user/.boltzbit &nbsp;·&nbsp; Sessions: /Users/user/.boltzbit/sessions
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section style={sectionS}>
          <h2 style={headingS}>Integrations</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {INTEGRATIONS.map(i => <IntegrationCard key={i.name} {...i} />)}
          </div>
        </section>

        {/* Custom credentials */}
        <section style={sectionS}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={headingS}>Custom Credentials</h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>Stored as <code style={{ fontFamily: 'var(--font-heading)', background: 'var(--bg-tertiary)', padding: '0 4px', borderRadius: 3 }}>{'{{KEY}}'}</code> placeholders available to widgets</p>
            </div>
            <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 12px' }}>
              <Plus size={12} weight="bold" /> Add Key
            </button>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {CREDENTIALS.map((c, i) => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < CREDENTIALS.length - 1 ? '1px solid var(--border-primary)' : 'none' }}>
                <Key size={14} color="var(--text-tertiary)" />
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 600, minWidth: 180 }}>{c.key}</span>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-heading)' }}>{c.preview}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, display: 'flex', alignItems: 'center' }}>
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
