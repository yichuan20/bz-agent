import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const config = defineConfig({
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    viteReact(),
  ],
  server: {
    port: 5010,
    proxy: {
      // Forward all backend paths to the backend so the FE can use same-origin
      // relative URLs (HTTP_BASE = '') in dev; in prod the backend serves the SPA
      // on the same origin anyway.
      //
      // Paths covered:
      //   /api       — all /api/v1/* REST + SSE routes
      //   /healthz   — liveness probe
      //   /boltzhub  — BoltzHub integration (prefix kept at old path, not /api/v1/)
      //   /canvas    — widget canvas (old prefix, not /api/v1/)
      //   /widgets   — widget registry
      //   /custom-widgets — per-session custom widgets
      //   /db        — widget per-row data store (/db/widget/*)
      //   /proxy     — HTTP proxy for widget iframes
      //   /search    — SerpAPI search proxy
      // All backend routes start with /api (covers /api/v1/*), plus a few kept at their old paths
      '/api': { target: process.env.VITE_BACKEND_URL ?? 'http://localhost:18789', changeOrigin: true },
      '/healthz': { target: process.env.VITE_BACKEND_URL ?? 'http://localhost:18789', changeOrigin: true },
      // BoltzHub kept at old /boltzhub/ prefix (agent.tsx calls it directly, not through /api/v1/)
      '/boltzhub': { target: process.env.VITE_BACKEND_URL ?? 'http://localhost:18789', changeOrigin: true },
      // Widget runtime helpers kept at old paths (called from inside widget iframes)
      '/proxy': { target: process.env.VITE_BACKEND_URL ?? 'http://localhost:18789', changeOrigin: true },
      '/search': { target: process.env.VITE_BACKEND_URL ?? 'http://localhost:18789', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    // Raise the chunk warning threshold — the agent UI is intentionally large
    chunkSizeWarningLimit: 1500,
  },
  optimizeDeps: {
    include: ['recharts'],
  },
});

export default config;
