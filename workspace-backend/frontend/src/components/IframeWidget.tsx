import { useEffect, useRef } from 'react';

const THEME_VARS = [
  '--bg-primary',
  '--bg-secondary',
  '--bg-tertiary',
  '--text-primary',
  '--text-secondary',
  '--text-tertiary',
  '--border-primary',
  '--border-secondary',
  '--accent-blue',
  '--accent-green',
  '--accent-red',
  '--accent-orange',
  '--accent-pink',
  '--accent-cyan',
  '--accent-yellow',
  '--font-body',
  '--font-heading',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--spacing-xs',
  '--spacing-sm',
  '--spacing-md',
  '--shadow-dropdown',
  '--text-on-accent',
];

function getThemeCss(): string {
  const cs = getComputedStyle(document.documentElement);
  return THEME_VARS.map(v => `${v}:${cs.getPropertyValue(v).trim() || 'inherit'}`).join(';');
}

function buildSrcdoc(
  code: string,
  agentHttpBase: string,
  canvasId?: string,
  sessionId?: string | null,
): string {
  const themeCss = getThemeCss();
  const safeCode = code.replace(/<\/script>/gi, '<\\/script>');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const safeId = canvasId ?? '';
  const safeSession = sessionId ?? '';

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
 * window.__agentHttpBase__  — base URL of the Python backend (e.g. http://localhost:18789)
 * window.__isDark__         — true when dark mode is active
 * window.__canvasId__       — unique ID for this widget placement on the canvas
 *
 * window.db  — persistent data store scoped to this widget (JSON file on disk, no DB needed)
 *
 *   // No schema declaration needed — just insert any dict and it's stored.
 *
 *   // 2. Query rows
 *   const { rows, total } = await db.query({ order: 'id', dir: 'asc', limit: 100 });
 *
 *   // 3. Insert
 *   const { inserted } = await db.insert({ label: 'Jan', value: 42 });
 *
 *   // 4. Update row by id
 *   await db.update(inserted[0].id, { value: 50 });
 *
 *   // 5. Delete row by id
 *   await db.delete(inserted[0].id);
 *
 * To call external APIs with stored credentials, route requests through the proxy:
 *
 *   const res = await fetch(window.__agentHttpBase__ + '/api/v1/runtime/proxy', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       url:    'https://api.openai.com/v1/chat/completions',
 *       method: 'POST',
 *       headers: { 'Authorization': 'Bearer {{OPENAI_API_KEY}}' },
 *       body:   JSON.stringify({ model: 'gpt-4o-mini', messages: [...] })
 *     })
 *   });
 */
window.__agentHttpBase__ = '${agentHttpBase}';
window.__isDark__        = ${isDark};
window.__canvasId__      = '${safeId}';
window.__sessionId__     = '${safeSession}';
(function(){
  const _base = window.__agentHttpBase__;
  const _id   = window.__canvasId__;
  const _sid  = window.__sessionId__;
  const _sq   = _sid ? '?sessionId=' + encodeURIComponent(_sid) : '';
  const _sq2  = _sid ? '&sessionId=' + encodeURIComponent(_sid) : '';
  if (!_id) { window.db = null; return; }
  window.db = {
    ensure: function(columns) {
      return fetch(_base + '/api/v1/db/widget/' + _id + '/schema' + _sq, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: columns })
      }).then(function(r){ return r.json(); });
    },
    query: function(opts) {
      opts = opts || {};
      var p = new URLSearchParams();
      if (opts.limit  != null) p.set('limit',  opts.limit);
      if (opts.offset != null) p.set('offset', opts.offset);
      if (opts.order)          p.set('order',  opts.order);
      if (opts.dir)            p.set('dir',    opts.dir);
      if (opts.filter) {
        Object.keys(opts.filter).forEach(function(k){
          p.append('filter', k + '=' + opts.filter[k]);
        });
      }
      return fetch(_base + '/api/v1/db/widget/' + _id + '/rows?' + p + _sq2).then(function(r){ return r.json(); });
    },
    insert: function(rowOrRows) {
      var body = Array.isArray(rowOrRows) ? { rows: rowOrRows } : { row: rowOrRows };
      return fetch(_base + '/api/v1/db/widget/' + _id + '/rows' + _sq, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function(r){ return r.json(); });
    },
    update: function(id, data) {
      return fetch(_base + '/api/v1/db/widget/' + _id + '/rows/' + id + _sq, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: data })
      }).then(function(r){ return r.json(); });
    },
    delete: function(id) {
      return fetch(_base + '/api/v1/db/widget/' + _id + '/rows/' + id + _sq, {
        method: 'DELETE'
      }).then(function(r){ return r.json(); });
    },
    exec: function(code) {
      return fetch(_base + '/api/v1/db/widget/' + _id + '/exec' + _sq, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code })
      }).then(function(r){ return r.json(); });
    }
  };
})();
(function(){
  try{
    ${safeCode}
  }catch(e){
    document.body.innerHTML='<pre style="color:var(--accent-red,#e53);padding:10px;font-size:11px;white-space:pre-wrap">'+e.message+'</pre>';
  }
})();
</script>
</body>
</html>`;
}

type Props = {
  code: string;
  agentHttpBase?: string;
  canvasId?: string;
  sessionId?: string | null;
  refreshKey?: string | number;
};

export function IframeWidget({
  code,
  agentHttpBase = 'http://localhost:18789',
  canvasId,
  sessionId,
  refreshKey: _refreshKey,
}: Props) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    iframe.srcdoc = buildSrcdoc(code, agentHttpBase, canvasId, sessionId);
  }, [code, agentHttpBase, canvasId, sessionId]);

  useEffect(() => {
    const rebuild = () => {
      const iframe = ref.current;
      if (iframe) iframe.srcdoc = buildSrcdoc(code, agentHttpBase, canvasId);
    };
    window.addEventListener('themechange', rebuild);
    return () => window.removeEventListener('themechange', rebuild);
  }, [code, agentHttpBase, canvasId]);

  return (
    <iframe
      ref={ref}
      sandbox="allow-scripts allow-popups allow-forms allow-same-origin"
      style={{ border: 'none', width: '100%', height: '100%', display: 'block' }}
      title="widget"
    />
  );
}
