import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';

type Agent = {
  id: string;
  projectDir: string;
  status: string;
  isRunning: boolean;
  title?: string;
  messageCount?: number;
  lastModified?: number;
  createdAt: string;
};

export const Route = createFileRoute('/agents/')({
  component: AgentsPage,
});

function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [projectDir, setProjectDir] = useState('');

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      const data = (await res.json()) as { agents: Agent[] };
      setAgents(data.agents ?? []);
    } catch {
      // server unreachable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAgents();
    const interval = setInterval(() => void fetchAgents(), 5000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  async function handleStart() {
    if (!projectDir.trim()) return;
    setStarting(true);
    try {
      await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDir: projectDir.trim() }),
      });
      setProjectDir('');
      await fetchAgents();
    } catch {
      // error
    } finally {
      setStarting(false);
    }
  }

  async function handleStop(id: string) {
    await fetch(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await fetchAgents();
  }

  function formatTime(ts?: number) {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleString();
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Agents</h1>
      </div>

      {/* Start new agent */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          padding: '12px 16px',
          background: 'var(--color-surface)',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
        }}
      >
        <input
          value={projectDir}
          onChange={e => setProjectDir(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void handleStart()}
          placeholder="Project directory (e.g. /home/user/my-app)"
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={starting || !projectDir.trim()}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 500,
            color: '#fff',
            background: starting ? 'var(--color-text-muted)' : 'var(--color-primary)',
            border: 'none',
            borderRadius: '6px',
            cursor: starting ? 'default' : 'pointer',
          }}
        >
          {starting ? 'Starting...' : 'Start Agent'}
        </button>
      </div>

      {/* Agent list */}
      {loading ? (
        <div style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Loading...</div>
      ) : agents.length === 0 ? (
        <div style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
          No agent sessions found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {agents.map(agent => (
            <div
              key={agent.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                background: 'var(--color-surface)',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
              }}
            >
              {/* Status dot */}
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: agent.isRunning ? 'var(--color-success)' : 'var(--color-text-muted)',
                }}
              />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {agent.title || agent.id}
                  </span>
                  {agent.isRunning && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(52, 211, 153, 0.15)',
                        color: 'var(--color-success)',
                      }}
                    >
                      running
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--color-text-muted)',
                    fontFamily: 'var(--font-mono)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: '2px',
                  }}
                >
                  {agent.projectDir}
                </div>
                <div
                  style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}
                >
                  {agent.messageCount ? `${agent.messageCount} messages` : ''}
                  {agent.messageCount && agent.lastModified ? ' · ' : ''}
                  {agent.lastModified ? formatTime(agent.lastModified) : ''}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {agent.isRunning && (
                  <Link
                    to="/agents/$agentId"
                    params={{ agentId: agent.id }}
                    style={{
                      padding: '5px 12px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#fff',
                      background: 'var(--color-primary)',
                      border: 'none',
                      borderRadius: '5px',
                      textDecoration: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Chat
                  </Link>
                )}
                {!agent.isRunning && (
                  <button
                    type="button"
                    onClick={() => {
                      void fetch('/api/agents', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ projectDir: agent.projectDir, sessionId: agent.id }),
                      }).then(() => fetchAgents());
                    }}
                    style={{
                      padding: '5px 12px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--color-text)',
                      background: 'transparent',
                      border: '1px solid var(--color-border)',
                      borderRadius: '5px',
                      cursor: 'pointer',
                    }}
                  >
                    Resume
                  </button>
                )}
                {agent.isRunning && (
                  <button
                    type="button"
                    onClick={() => void handleStop(agent.id)}
                    style={{
                      padding: '5px 12px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--color-error)',
                      background: 'transparent',
                      border: '1px solid var(--color-border)',
                      borderRadius: '5px',
                      cursor: 'pointer',
                    }}
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
