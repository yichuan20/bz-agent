import { useEffect, useRef } from 'react';

const THEME_VARS = [
  '--bg-primary', '--bg-secondary', '--bg-tertiary',
  '--text-primary', '--text-secondary', '--text-tertiary',
  '--border-primary', '--border-secondary',
  '--accent-blue', '--accent-green', '--accent-red', '--accent-orange',
  '--accent-pink', '--accent-cyan', '--accent-yellow',
  '--font-body', '--font-heading',
  '--radius-sm', '--radius-md', '--radius-lg',
  '--spacing-xs', '--spacing-sm', '--spacing-md',
  '--shadow-dropdown', '--text-on-accent',
];

function getThemeCss(): string {
  const cs = getComputedStyle(document.documentElement);
  return THEME_VARS.map(v => `${v}:${cs.getPropertyValue(v).trim() || 'inherit'}`).join(';');
}

function buildSrcdoc(code: string, agentHttpBase: string): string {
  const themeCss = getThemeCss();
  const safeCode = code.replace(/<\/script>/gi, '<\\/script>');
  const isDark   = document.documentElement.getAttribute('data-theme') === 'dark';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{${themeCss}}
html,body{width:100%;height:100vh;overflow:hidden;background:transparent}
body{font-family:var(--font-body,system-ui,sans-serif);color:var(--text-primary);font-size:13px;line-height:1.5}
a{color:var(--accent-blue)}
input,textarea,select,button{font-family:inherit;font-size:inherit}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border-primary);border-radius:2px}
</style>
</head>
<body>
<script>
/**
 * window.__agentHttpBase__  — base URL of the Python backend (e.g. http://localhost:5081)
 * window.__isDark__         — true when dark mode is active
 *
 * To call external APIs with stored credentials, route requests through the proxy:
 *
 *   const res = await fetch(window.__agentHttpBase__ + '/proxy', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       url:    'https://api.openai.com/v1/chat/completions',
 *       method: 'POST',
 *       headers: { 'Authorization': 'Bearer {{OPENAI_API_KEY}}' },
 *       body:   JSON.stringify({ model: 'gpt-4o-mini', messages: [...] })
 *     })
 *   });
 *
 * The server replaces {{OPENAI_API_KEY}} with the stored credential before forwarding.
 * Credentials are managed via the 🔑 Credentials button in the canvas toolbar.
 */
window.__agentHttpBase__ = '${agentHttpBase}';
window.__isDark__        = ${isDark};
(function(){
  try{
    ${safeCode}
  }catch(e){
    document.body.innerHTML='<pre style="color:var(--accent-red,#e53);padding:10px;font-size:11px;white-space:pre-wrap">'+e.message+'</pre>';
  }
})();
<\/script>
</body>
</html>`;
}

type Props = {
  code:           string;
  agentHttpBase?: string;
  refreshKey?:    string | number;
};

export function IframeWidget({ code, agentHttpBase = 'http://localhost:5081', refreshKey }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    iframe.srcdoc = buildSrcdoc(code, agentHttpBase);
  }, [code, agentHttpBase, refreshKey]);

  useEffect(() => {
    const rebuild = () => {
      const iframe = ref.current;
      if (iframe) iframe.srcdoc = buildSrcdoc(code, agentHttpBase);
    };
    window.addEventListener('themechange', rebuild);
    return () => window.removeEventListener('themechange', rebuild);
  }, [code, agentHttpBase]);

  return (
    <iframe
      ref={ref}
      sandbox="allow-scripts allow-popups allow-forms"
      style={{ border: 'none', width: '100%', height: '100%', display: 'block' }}
      title="widget"
    />
  );
}
