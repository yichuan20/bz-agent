import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const [health, setHealth] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          setHealth('ok');
        } else {
          setHealth('error');
        }
      } catch {
        setHealth('error');
      }
    };
    check();
    const interval = setInterval(check, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 600 }}>Dashboard</h1>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          background: 'var(--color-surface)',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
          width: 'fit-content',
        }}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background:
              health === 'ok'
                ? 'var(--color-success)'
                : health === 'error'
                  ? 'var(--color-error)'
                  : 'var(--color-text-muted)',
          }}
        />
        <span style={{ fontSize: '14px' }}>
          Backend:{' '}
          {health === 'loading' ? 'checking...' : health === 'ok' ? 'healthy' : 'unreachable'}
        </span>
      </div>
    </div>
  );
}
