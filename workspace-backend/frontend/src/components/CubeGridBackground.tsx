import { useEffect, useRef } from 'react';

interface Props {
  style?: React.CSSProperties;
  speed?: number; // multiplier, default 1
  opacity?: number; // peak alpha multiplier, default 1
}

/**
 * Domain-warped cube grid background — identical to the login page animation.
 * Renders into a <canvas> that fills its parent (position:absolute, inset:0).
 * Colors adapt to light/dark mode via CSS custom properties.
 */
export function CubeGridBackground({ style, speed = 1, opacity = 1 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cv = canvas as HTMLCanvasElement;
    const c2d = ctx as CanvasRenderingContext2D;

    const CELL = 8;
    const GAP = 2;
    const STEP = CELL + GAP;

    let animId: number;
    let t = 0;

    function resize() {
      cv.width = cv.offsetWidth;
      cv.height = cv.offsetHeight;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
    const token = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    function draw() {
      const dark = isDark();
      const cols = Math.ceil(cv.width / STEP) + 1;
      const rows = Math.ceil(cv.height / STEP) + 1;

      c2d.clearRect(0, 0, cv.width, cv.height);

      const accent = token('--text-tertiary') || (dark ? '#555' : '#9E9488');

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const wx =
            Math.sin(col * 0.11 + row * 0.08 + t * 0.55) * 14 +
            Math.cos(col * 0.07 - row * 0.13 - t * 0.4) * 8;
          const wy =
            Math.cos(col * 0.09 + row * 0.12 - t * 0.48) * 14 +
            Math.sin(col * 0.14 - row * 0.06 + t * 0.35) * 8;

          const wc = col + wx;
          const wr = row + wy;
          const wx2 =
            Math.sin(wc * 0.1 + wr * 0.07 + t * 0.6) * 7 +
            Math.cos(wc * 0.06 - wr * 0.1 - t * 0.45) * 4;
          const wy2 =
            Math.cos(wc * 0.08 + wr * 0.11 - t * 0.52) * 7 +
            Math.sin(wc * 0.12 - wr * 0.05 + t * 0.38) * 4;

          const fc = wc + wx2;
          const fr = wr + wy2;
          const wave =
            Math.sin(fc * 0.13 + fr * 0.1 + t * 0.5) * 0.5 +
            Math.sin(fc * 0.26 - fr * 0.2 - t * 0.65) * 0.28 +
            Math.cos(fc * 0.19 + fr * 0.23 + t * 0.42) * 0.16 +
            Math.sin(fc * 0.38 - fr * 0.31 - t * 0.55) * 0.09;

          const norm = (wave + 1.03) / 2.06;
          const curved = Math.max(0, norm) ** 2.8;

          c2d.globalAlpha = (dark ? curved * 0.32 + 0.02 : curved * 0.2 + 0.02) * opacity;
          c2d.fillStyle = accent;

          c2d.beginPath();
          c2d.roundRect(col * STEP, row * STEP, CELL, CELL, 2);
          c2d.fill();
        }
      }

      c2d.globalAlpha = 1;
      t += 0.006 * speed;
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [speed, opacity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        ...style,
      }}
    />
  );
}
