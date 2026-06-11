import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { setAccessToken, useIsLoggedIn } from '#/auth-store';
import { BoltzbitLogo } from '#/components/BoltzbitLogo';
import ThemeToggle from '#/components/ThemeToggle';
import { CubeGridBackground } from '#/components/CubeGridBackground';

export const Route = createFileRoute('/login')({
  component: Login,
});

const LOGIN_URL =
  (import.meta.env.VITE_LOGIN_URL as string | undefined)
  ?? `${import.meta.env.VITE_GATEWAY_URL ?? 'https://auth.boltzhub.com'}/authentication-service/login`;

const AGENT_HTTP =
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined)
  ?? 'http://localhost:5051';

const BZCODE_AUTH_URL =
  (import.meta.env.VITE_BZCODE_AUTH_URL as string | undefined)
  ?? 'https://boltzhub.com';

/** Parse the exp claim from a JWT (returns milliseconds epoch, or null). */
function parseJwtExpMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Push credentials to the Python server so bzcode can authenticate. */
async function pushBzcodeCredentials(
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number | null,
) {
  try {
    await fetch(`${AGENT_HTTP}/auth`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        accessToken,
        refreshToken,
        expiresAt: expiresAt ?? undefined,
        authUrl:   BZCODE_AUTH_URL,
      }),
    });
  } catch {
    // Non-fatal — bzcode will fail to authenticate but the app still works
    console.warn('[login] could not push credentials to agent server');
  }
}


function Login() {
  const navigate = useNavigate();
  const loggedIn = useIsLoggedIn();

  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (loggedIn) void navigate({ to: '/' });
  }, [loggedIn, navigate]);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(LOGIN_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userName: userName.trim(), password }),
      });

      const data = await res.json() as {
        accessToken?:  string;
        refreshToken?: string;
        message?:      string;
        error?:        string;
      };

      if (!res.ok || !data.accessToken) {
        setError(data.message ?? data.error ?? 'Invalid credentials. Please try again.');
        return;
      }

      const expiresAt = parseJwtExpMs(data.accessToken);

      // Store token for app auth
      setAccessToken(data.accessToken);

      // Push to Python server → written to ~/.boltzbit/credentials.json for bzcode
      await pushBzcodeCredentials(data.accessToken, data.refreshToken, expiresAt);

      void navigate({ to: '/' });
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
        {/* Logo + heading */}
        <div className="auth-header">
          <BoltzbitLogo size={32} />
          <h1 className="auth-title">Sign in</h1>
        </div>

        {error && <p className="error-text">{error}</p>}

        <form className="auth-form" onSubmit={e => void handleSubmit(e)}>
          <input
            className="input"
            type="text"
            placeholder="Username or email"
            autoComplete="username"
            value={userName}
            onChange={e => setUserName(e.target.value)}
            required
            disabled={loading}
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            disabled={loading}
          />

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
