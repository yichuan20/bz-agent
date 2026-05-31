import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { setAccessToken, useIsLoggedIn } from '#/auth-store';
import { BoltzbitLogo } from '#/components/BoltzbitLogo';
import ThemeToggle from '#/components/ThemeToggle';

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

// Canvas-based cube grid animation — matches the screenshot style.
// A dense grid of small rounded squares with an organic interference-wave pattern.
// Colors are read from CSS custom properties so they adapt to light/dark mode.
function CubeGridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Capture as non-null for use inside nested closures
    const cv  = canvas as HTMLCanvasElement;
    const c2d = ctx    as CanvasRenderingContext2D;

    const CELL = 8;
    const GAP  = 2;
    const STEP = CELL + GAP;

    let animId: number;
    let t = 0;

    function resize() {
      cv.width  = cv.offsetWidth;
      cv.height = cv.offsetHeight;
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
    const token  = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    function draw() {
      const dark = isDark();
      const cols = Math.ceil(cv.width  / STEP) + 1;
      const rows = Math.ceil(cv.height / STEP) + 1;

      c2d.fillStyle = token('--bg-secondary') || (dark ? '#000' : '#E8E2D7');
      c2d.fillRect(0, 0, cv.width, cv.height);

      // Use a muted colour so the grid stays in the background
      const accent = token('--text-tertiary') || (dark ? '#555' : '#9E9488');

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // ── Domain warping (Inigo Quilez technique) ──────────────────────
          // Layer 1 — compute a warp displacement field from raw grid coords.
          // Two independent warp axes move in opposite temporal directions,
          // which creates regions that flow and swirl against each other.
          const wx =
            Math.sin(col * 0.11 + row * 0.08 + t * 0.55) * 14 +
            Math.cos(col * 0.07 - row * 0.13 - t * 0.40) *  8;
          const wy =
            Math.cos(col * 0.09 + row * 0.12 - t * 0.48) * 14 +
            Math.sin(col * 0.14 - row * 0.06 + t * 0.35) *  8;

          // Layer 2 — warp the warp (double domain warp = cloud turbulence)
          const wc = col + wx;
          const wr = row + wy;
          const wx2 =
            Math.sin(wc * 0.10 + wr * 0.07 + t * 0.60) * 7 +
            Math.cos(wc * 0.06 - wr * 0.10 - t * 0.45) * 4;
          const wy2 =
            Math.cos(wc * 0.08 + wr * 0.11 - t * 0.52) * 7 +
            Math.sin(wc * 0.12 - wr * 0.05 + t * 0.38) * 4;

          // Layer 3 — evaluate the brightness at doubly-warped coordinates.
          // Multiple scales create fBm-like cloud texture.
          const fc = wc + wx2;
          const fr = wr + wy2;
          const wave =
            Math.sin(fc * 0.13 + fr * 0.10 + t * 0.50) * 0.50 +
            Math.sin(fc * 0.26 - fr * 0.20 - t * 0.65) * 0.28 +
            Math.cos(fc * 0.19 + fr * 0.23 + t * 0.42) * 0.16 +
            Math.sin(fc * 0.38 - fr * 0.31 - t * 0.55) * 0.09;

          // Normalise and apply contrast curve — only peaks glow brightly
          const norm   = (wave + 1.03) / 2.06;
          const curved = Math.max(0, norm) ** 2.8;

          c2d.globalAlpha = dark ? curved * 0.32 + 0.02 : curved * 0.20 + 0.02;
          c2d.fillStyle   = accent;

          c2d.beginPath();
          c2d.roundRect(col * STEP, row * STEP, CELL, CELL, 2);
          c2d.fill();
        }
      }

      c2d.globalAlpha = 1;
      t += 0.006; // doubled speed — ~18 s per full cycle
      animId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
               pointerEvents: 'none', zIndex: 0 }}
    />
  );
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
