import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { isLoggedIn, useIsLoggedIn } from '#/auth-store';
import { BoltzbitLogo } from '#/components/BoltzbitLogo';
import ThemeToggle from '#/components/ThemeToggle';
import { CubeGridBackground } from '#/components/CubeGridBackground';

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    if (isLoggedIn()) throw redirect({ to: '/' });
  },
  component: Login,
});

const AGENT_HTTP =
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined)
  || (import.meta.env.PROD ? window.location.origin : 'http://localhost:18789');

function Login() {
  const navigate = useNavigate();
  const loggedIn = useIsLoggedIn();

  const [apiKey,  setApiKey]  = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (loggedIn) void navigate({ to: '/' });
  }, [loggedIn, navigate]);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${AGENT_HTTP}/agent-key`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: 'BZ_API_KEY', value: apiKey.trim() }),
      });
      if (!res.ok) {
        setError('Failed to save API key. Please try again.');
        return;
      }
      const returnUrl = sessionStorage.getItem('bz:returnUrl');
      sessionStorage.removeItem('bz:returnUrl');
      if (returnUrl) {
        window.location.href = returnUrl;
      } else {
        void navigate({ to: '/' });
      }
    } catch {
      setError('Could not reach the server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <CubeGridBackground />
      <div className="auth-page-controls">
        <ThemeToggle />
      </div>
      <div className="card auth-card">
        <div className="auth-header">
          <BoltzbitLogo size={32} />
          <h1 className="auth-title">Sign in</h1>
        </div>

        <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Enter your API key to continue.{' '}
          <a href="https://boltzhub.com/settings/api" target="_blank" rel="noreferrer"
            style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>
            Create one at BoltzHub →
          </a>
        </p>

        {error && <p className="error-text">{error}</p>}

        <form className="auth-form" onSubmit={e => void handleSubmit(e)}>
          <input
            className="input"
            type="password"
            placeholder="BZ_API_KEY"
            autoComplete="off"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            required
            disabled={loading}
            autoFocus
          />
          <button type="submit" className="auth-submit-btn" disabled={loading || !apiKey.trim()}>
            {loading ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
