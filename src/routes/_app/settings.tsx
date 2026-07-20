import {
  ArrowClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  HardDriveIcon,
  InfoIcon,
  KeyIcon,
  LinkIcon,
  TerminalIcon,
  TrashIcon,
  WarningCircleIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { FRONTEND_VERSION } from '#/version';

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
});

const HTTP_BASE =
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:18789';

// ── Types ─────────────────────────────────────────────────────────────────────

type Resources = {
  sessions: { count: number; bytes: number };
  serverData: { bytes: number };
  disk: { total: number; used: number; free: number };
};

type IntegrationField = {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  hint?: string;
};

type Integration = {
  id: string;
  name: string;
  description: string;
  docsUrl?: string;
  fields: IntegrationField[];
};

// ── Integration definitions ───────────────────────────────────────────────────

const INTEGRATIONS: Integration[] = [
  {
    id: 'twilio',
    name: 'Twilio / WhatsApp',
    description:
      'Receive and reply to WhatsApp messages through the agent. Set the sandbox webhook to your server URL.',
    docsUrl: 'https://www.twilio.com/docs/whatsapp/sandbox',
    fields: [
      {
        key: 'TWILIO_ACCOUNT_SID',
        label: 'Account SID',
        placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      },
      {
        key: 'TWILIO_AUTH_TOKEN',
        label: 'Auth Token',
        placeholder: 'your_auth_token',
        secret: true,
      },
      {
        key: 'TWILIO_FROM',
        label: 'From Number',
        placeholder: 'whatsapp:+14155238886',
        hint: 'Twilio sandbox number in the format whatsapp:+1…',
      },
    ],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Let the agent read and send emails on your behalf via the Gmail API.',
    docsUrl: 'https://developers.google.com/gmail/api/quickstart',
    fields: [
      {
        key: 'GMAIL_CLIENT_ID',
        label: 'OAuth Client ID',
        placeholder: 'xxxx.apps.googleusercontent.com',
      },
      {
        key: 'GMAIL_CLIENT_SECRET',
        label: 'OAuth Client Secret',
        placeholder: 'GOCSPX-…',
        secret: true,
      },
      {
        key: 'GMAIL_REFRESH_TOKEN',
        label: 'Refresh Token',
        placeholder: 'your_refresh_token',
        secret: true,
      },
    ],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Give the agent access to read and write files in your Google Drive.',
    docsUrl: 'https://developers.google.com/drive/api/quickstart',
    fields: [
      {
        key: 'GDRIVE_CLIENT_ID',
        label: 'OAuth Client ID',
        placeholder: 'xxxx.apps.googleusercontent.com',
      },
      {
        key: 'GDRIVE_CLIENT_SECRET',
        label: 'OAuth Client Secret',
        placeholder: 'GOCSPX-…',
        secret: true,
      },
      {
        key: 'GDRIVE_REFRESH_TOKEN',
        label: 'Refresh Token',
        placeholder: 'your_refresh_token',
        secret: true,
      },
    ],
  },
  {
    id: 'serpapi',
    name: 'SerpAPI (Web Search)',
    description: 'Enable the agent to search the web via Google Search results.',
    docsUrl: 'https://serpapi.com',
    fields: [
      { key: 'SERPAPI_KEY', label: 'API Key', placeholder: 'your_serpapi_key', secret: true },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function pct(used: number, total: number): number {
  if (!total) return 0;
  return Math.round((used / total) * 100);
}

// ── Version section ───────────────────────────────────────────────────────────

type VersionInfo = { backend?: string; bzcode?: string | null; bzcode_latest?: string | null };

function VersionSection() {
  const [info, setInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    fetch(`${HTTP_BASE}/api/version`)
      .then(r => r.json())
      .then((d: VersionInfo) => setInfo(d))
      .catch(() => null);
  }, []);

  function isOutdated(): boolean {
    if (!info?.bzcode || !info?.bzcode_latest) return false;
    const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
    const cur = parse(info.bzcode);
    const lat = parse(info.bzcode_latest);
    for (let i = 0; i < Math.max(cur.length, lat.length); i++) {
      const c = cur[i] ?? 0,
        l = lat[i] ?? 0;
      if (c < l) return true;
      if (c > l) return false;
    }
    return false;
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    borderBottom: '1px solid var(--border-primary)',
    fontSize: 13,
  };
  const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)', minWidth: 80 };
  const codeStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 12,
    color: 'var(--text-primary)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 4,
    padding: '2px 6px',
  };
  const metaStyle: React.CSSProperties = {
    color: 'var(--text-tertiary)',
    fontSize: 11,
    marginLeft: 'auto',
  };

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">
        <InfoIcon size={15} />
        Version Information
      </h2>
      <div className="settings-cards">
        <div className="settings-card">
          <div style={{ ...rowStyle }}>
            <span style={labelStyle}>Frontend</span>
            <code style={codeStyle}>v{FRONTEND_VERSION}</code>
          </div>
          <div style={{ ...rowStyle }}>
            <span style={labelStyle}>Backend</span>
            <code style={codeStyle}>{info?.backend ? `v${info.backend}` : '—'}</code>
          </div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <span style={labelStyle}>bzcode</span>
            <code style={codeStyle}>{info?.bzcode ? `v${info.bzcode}` : '—'}</code>
            {info?.bzcode_latest && <span style={metaStyle}>latest: v{info.bzcode_latest}</span>}
          </div>
          {isOutdated() && (
            <a
              href="https://boltzagent.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginTop: 12,
                padding: '9px 12px',
                background: 'rgba(249,115,22,0.08)',
                border: '1px solid rgba(249,115,22,0.30)',
                borderRadius: 7,
                color: '#f97316',
                fontSize: 12,
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              <WarningCircleIcon size={14} weight="fill" style={{ flexShrink: 0 }} />
              bzcode update available — visit boltzagent.com to update
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Resource card ─────────────────────────────────────────────────────────────

function ResourcesSection() {
  const [res, setRes] = useState<Resources | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearDays, setClearDays] = useState(30);
  const [clearMsg, setClearMsg] = useState('');

  const load = useCallback(() => {
    fetch(`${HTTP_BASE}/settings/resources`)
      .then(r => r.json())
      .then((d: Resources) => setRes(d))
      .catch(() => null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClear() {
    setClearing(true);
    setClearMsg('');
    const r = await fetch(`${HTTP_BASE}/settings/sessions/clear?olderThanDays=${clearDays}`, {
      method: 'DELETE',
    }).catch(() => null);
    if (r?.ok) {
      const d = (await r.json()) as { deleted: number };
      setClearMsg(`Deleted ${d.deleted} session${d.deleted !== 1 ? 's' : ''}.`);
      load();
    } else {
      setClearMsg('Failed to clear sessions.');
    }
    setClearing(false);
  }

  const diskUsed = res ? pct(res.disk.used, res.disk.total) : 0;

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">
        <HardDriveIcon size={15} />
        Resources
      </h2>

      <div className="settings-cards">
        {/* Disk usage */}
        <div className="settings-card">
          <div className="settings-card-header">
            <span className="settings-card-label">Disk usage</span>
            {res && (
              <span className="settings-card-meta">
                {fmtBytes(res.disk.used)} / {fmtBytes(res.disk.total)}
              </span>
            )}
          </div>
          {res && (
            <>
              <div className="settings-disk-bar">
                <div
                  className="settings-disk-fill"
                  style={{
                    width: `${diskUsed}%`,
                    background:
                      diskUsed > 85
                        ? 'var(--accent-red)'
                        : diskUsed > 65
                          ? 'var(--accent-orange)'
                          : 'var(--accent-blue)',
                  }}
                />
              </div>
              <div className="settings-disk-legend">
                <span>{diskUsed}% used</span>
                <span>{fmtBytes(res.disk.free)} free</span>
              </div>
            </>
          )}
        </div>

        {/* Sessions */}
        <div className="settings-card">
          <div className="settings-card-header">
            <span className="settings-card-label">Conversation sessions</span>
            {res && (
              <span className="settings-card-meta">
                {res.sessions.count} files · {fmtBytes(res.sessions.bytes)}
              </span>
            )}
          </div>
          <p className="settings-card-hint">
            Remove old sessions to free disk space. Active sessions are unaffected.
          </p>
          <div className="settings-clear-row">
            <span className="settings-card-hint" style={{ flexShrink: 0 }}>
              Delete sessions older than
            </span>
            <select
              className="settings-select"
              value={clearDays}
              onChange={e => setClearDays(Number(e.target.value))}
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
            <button
              type="button"
              className="settings-btn settings-btn--danger"
              onClick={() => void handleClear()}
              disabled={clearing}
            >
              <TrashIcon size={13} />
              {clearing ? 'Clearing…' : 'Clear'}
            </button>
          </div>
          {clearMsg && <p className="settings-feedback">{clearMsg}</p>}
        </div>

        {/* Server data */}
        {res && res.serverData.bytes > 0 && (
          <div className="settings-card">
            <div className="settings-card-header">
              <span className="settings-card-label">Server data (widgets, credentials)</span>
              <span className="settings-card-meta">{fmtBytes(res.serverData.bytes)}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Integration card ──────────────────────────────────────────────────────────

function IntegrationCard({
  integration,
  credKeys,
}: {
  integration: Integration;
  credKeys: string[];
}) {
  const configured = integration.fields.every(f => credKeys.includes(f.key));
  const partial = !configured && integration.fields.some(f => credKeys.includes(f.key));
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    setSavedOk(false);
    try {
      for (const [key, value] of Object.entries(values)) {
        if (!value.trim()) continue;
        const r = await fetch(`${HTTP_BASE}/credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: value.trim() }),
        });
        if (!r.ok) throw new Error(`Failed to save ${key}`);
      }
      setSavedOk(true);
      setTimeout(() => {
        setSavedOk(false);
        setOpen(false);
      }, 1500);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const statusColor = configured
    ? 'var(--accent-green)'
    : partial
      ? 'var(--accent-orange)'
      : 'var(--text-tertiary)';
  const statusLabel = configured ? 'Connected' : partial ? 'Partial' : 'Not configured';
  const StatusIcon = configured ? CheckCircleIcon : partial ? WarningCircleIcon : XCircleIcon;

  return (
    <div className={`settings-integration${open ? ' settings-integration--open' : ''}`}>
      <button
        type="button"
        className="settings-integration-header"
        onClick={() => setOpen(v => !v)}
      >
        <span className="settings-integration-name">{integration.name}</span>
        <span className="settings-integration-status" style={{ color: statusColor }}>
          <StatusIcon size={12} weight="fill" />
          {statusLabel}
        </span>
        {open ? (
          <CaretDownIcon size={13} color="var(--text-tertiary)" />
        ) : (
          <CaretRightIcon size={13} color="var(--text-tertiary)" />
        )}
      </button>

      {open && (
        <div className="settings-integration-body">
          <p className="settings-card-hint">{integration.description}</p>
          {integration.docsUrl && (
            <a
              href={integration.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="settings-docs-link"
            >
              <LinkIcon size={11} />
              Documentation
            </a>
          )}
          <div className="settings-fields">
            {integration.fields.map(f => (
              <label key={f.key} className="settings-field">
                <span className="settings-field-label">
                  {f.label}
                  {credKeys.includes(f.key) && <span className="settings-field-saved">saved</span>}
                </span>
                <input
                  type={f.secret ? 'password' : 'text'}
                  className="settings-input"
                  placeholder={credKeys.includes(f.key) ? '••••••••' : f.placeholder}
                  value={values[f.key] ?? ''}
                  onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                  autoComplete="off"
                />
                {f.hint && <span className="settings-field-hint">{f.hint}</span>}
              </label>
            ))}
          </div>
          {error && <p className="settings-error">{error}</p>}
          <div className="settings-integration-actions">
            <button
              type="button"
              className="settings-btn settings-btn--primary"
              onClick={() => void handleSave()}
              disabled={saving || Object.values(values).every(v => !v.trim())}
            >
              {savedOk ? <CheckCircleIcon size={13} weight="fill" /> : null}
              {saving ? 'Saving…' : savedOk ? 'Saved' : 'Save credentials'}
            </button>
            <button type="button" className="settings-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Custom credential manager (raw key-value) ─────────────────────────────────

function CustomCredentials({ credKeys, onRefresh }: { credKeys: string[]; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [saving, setSaving] = useState(false);

  const knownKeys = new Set(INTEGRATIONS.flatMap(i => i.fields.map(f => f.key)));
  const customKeys = credKeys.filter(k => !knownKeys.has(k));

  async function handleAdd() {
    if (!newKey.trim() || !newVal.trim()) return;
    setSaving(true);
    await fetch(`${HTTP_BASE}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newKey.trim(), value: newVal.trim() }),
    }).catch(() => null);
    setNewKey('');
    setNewVal('');
    setSaving(false);
    onRefresh();
  }

  async function handleDelete(key: string) {
    await fetch(`${HTTP_BASE}/credentials/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(
      () => null,
    );
    onRefresh();
  }

  return (
    <div className={`settings-integration${open ? ' settings-integration--open' : ''}`}>
      <button
        type="button"
        className="settings-integration-header"
        onClick={() => setOpen(v => !v)}
      >
        <span className="settings-integration-name">Custom credentials</span>
        <span className="settings-integration-status" style={{ color: 'var(--text-tertiary)' }}>
          {customKeys.length} key{customKeys.length !== 1 ? 's' : ''}
        </span>
        {open ? (
          <CaretDownIcon size={13} color="var(--text-tertiary)" />
        ) : (
          <CaretRightIcon size={13} color="var(--text-tertiary)" />
        )}
      </button>
      {open && (
        <div className="settings-integration-body">
          <p className="settings-card-hint">
            Store arbitrary API keys and tokens for use in widgets via{' '}
            <code className="settings-code">{'{{KEY}}'}</code> placeholders.
          </p>
          {customKeys.length > 0 && (
            <div className="settings-cred-list">
              {customKeys.map(k => (
                <div key={k} className="settings-cred-row">
                  <code className="settings-code settings-cred-key">{k}</code>
                  <button
                    type="button"
                    className="settings-btn settings-btn--danger settings-btn--sm"
                    onClick={() => void handleDelete(k)}
                  >
                    <TrashIcon size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="settings-cred-add">
            <input
              className="settings-input"
              placeholder="KEY_NAME"
              value={newKey}
              onChange={e => setNewKey(e.target.value.toUpperCase().replace(/\s/g, '_'))}
            />
            <input
              className="settings-input"
              placeholder="value"
              value={newVal}
              type="password"
              onChange={e => setNewVal(e.target.value)}
            />
            <button
              type="button"
              className="settings-btn settings-btn--primary"
              onClick={() => void handleAdd()}
              disabled={saving || !newKey.trim() || !newVal.trim()}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Integrations section ──────────────────────────────────────────────────────

function IntegrationsSection() {
  const [credKeys, setCredKeys] = useState<string[]>([]);

  const loadKeys = useCallback(() => {
    fetch(`${HTTP_BASE}/credentials`)
      .then(r => r.json())
      .then((d: { keys?: string[] }) => setCredKeys(d.keys ?? []))
      .catch(() => null);
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">
        <LinkIcon size={15} />
        Integrations
      </h2>
      <div className="settings-integrations">
        {INTEGRATIONS.map(int => (
          <IntegrationCard key={int.id} integration={int} credKeys={credKeys} />
        ))}
        <CustomCredentials credKeys={credKeys} onRefresh={loadKeys} />
      </div>
    </section>
  );
}

// ── API key section ───────────────────────────────────────────────────────────

function ApiKeySection() {
  const [status, setStatus] = useState<{ present: boolean; last4: string | null } | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = useCallback(() => {
    fetch(`${HTTP_BASE}/api/apikey-status`)
      .then(r => r.json())
      .then((d: { present: boolean; last4: string | null }) => setStatus(d))
      .catch(() => null);
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    setError('');
    setSavedOk(false);
    try {
      const r = await fetch(`${HTTP_BASE}/agent-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'BZ_API_KEY', value: value.trim() }),
      });
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      setSavedOk(true);
      setValue('');
      loadStatus();
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await fetch(`${HTTP_BASE}/agent-key/BZ_API_KEY`, { method: 'DELETE' }).catch(() => null);
    loadStatus();
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">
        <KeyIcon size={15} />
        AI API Key
      </h2>
      <div className="settings-cards">
        <div className="settings-card">
          <p className="settings-card-hint">
            The <code className="settings-code">BZ_API_KEY</code> authorises bzcode to make AI model
            calls. Required for chat to work on remote deployments.
          </p>

          {status && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              {status.present ? (
                <>
                  <CheckCircleIcon size={14} weight="fill" color="var(--accent-green)" />
                  <span>Key set</span>
                  <code className="settings-code">····{status.last4}</code>
                  <button
                    type="button"
                    className="settings-btn settings-btn--danger settings-btn--sm"
                    onClick={() => void handleDelete()}
                    style={{ marginLeft: 'auto' }}
                  >
                    <TrashIcon size={11} /> Remove
                  </button>
                </>
              ) : (
                <>
                  <XCircleIcon size={14} weight="fill" color="var(--accent-red)" />
                  <span style={{ color: 'var(--text-secondary)' }}>No key set</span>
                </>
              )}
            </div>
          )}

          <div className="settings-cred-add">
            <input
              className="settings-input"
              type="password"
              placeholder="Paste BZ_API_KEY here"
              value={value}
              onChange={e => setValue(e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              className="settings-btn settings-btn--primary"
              onClick={() => void handleSave()}
              disabled={saving || !value.trim()}
            >
              {savedOk ? <CheckCircleIcon size={13} weight="fill" /> : null}
              {saving ? 'Saving…' : savedOk ? 'Saved' : 'Save'}
            </button>
          </div>
          {error && <p className="settings-error">{error}</p>}
        </div>
      </div>
    </section>
  );
}

// ── Server log section ────────────────────────────────────────────────────────

type ServerLogInfo = { bzHome: string; logFile: string; lines: string[] };

function ServerLogSection() {
  const [info, setInfo] = useState<ServerLogInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${HTTP_BASE}/api/server/log?lines=200`)
      .then(r => r.json())
      .then((d: ServerLogInfo) => setInfo(d))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const codeStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 11,
    color: 'var(--text-primary)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 4,
    padding: '2px 6px',
    wordBreak: 'break-all',
  };

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">
        <TerminalIcon size={15} />
        Server Log
      </h2>
      <div className="settings-cards">
        <div className="settings-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)', minWidth: 72 }}>BZ_HOME</span>
              <code style={codeStyle}>{info?.bzHome ?? '—'}</code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)', minWidth: 72 }}>Log file</span>
              <code style={codeStyle}>{info?.logFile ?? '—'}</code>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 14,
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Last {info?.lines.length ?? 0} lines
            </span>
            <button
              type="button"
              className="settings-btn"
              onClick={load}
              disabled={loading}
              style={{ padding: '3px 8px', fontSize: 12 }}
            >
              <ArrowClockwiseIcon size={12} />
              Refresh
            </button>
          </div>

          <pre
            style={{
              margin: 0,
              padding: '8px 10px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 6,
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--text-primary)',
              overflowX: 'auto',
              overflowY: 'auto',
              maxHeight: 360,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {info?.lines.length
              ? info.lines.join('\n')
              : loading
                ? 'Loading…'
                : 'No log entries yet.'}
          </pre>
        </div>
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function SettingsPage() {
  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Manage resources, integrations, and credentials</p>
      </div>
      <div className="settings-body">
        <VersionSection />
        <ApiKeySection />
        <ResourcesSection />
        <IntegrationsSection />
        <ServerLogSection />
      </div>
    </div>
  );
}
