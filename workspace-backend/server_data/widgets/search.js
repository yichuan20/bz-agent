const HTTP_BASE = window.__agentHttpBase__ || 'http://localhost:18789';
let apiKey = localStorage.getItem('serpapi-key') || '';

const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh;overflow:hidden';

const bar = document.createElement('div');
bar.style.cssText = 'display:flex;gap:6px;align-items:center;padding:8px;border-bottom:1px solid var(--border-primary)';

const inp = document.createElement('input');
inp.value = 'boltzbit'; inp.placeholder = 'Search…';
inp.style.cssText = 'flex:1;border:1px solid var(--border-primary);border-radius:6px;padding:6px 10px;font-size:13px;background:var(--bg-secondary);color:var(--text-primary);outline:none';

const searchBtn = document.createElement('button');
searchBtn.textContent = '→';
searchBtn.style.cssText = 'width:32px;height:32px;border-radius:6px;border:none;background:var(--accent-blue);color:#fff;cursor:pointer;font-size:16px;flex-shrink:0';

const settBtn = document.createElement('button');
settBtn.textContent = '⚙️';
settBtn.style.cssText = 'width:32px;height:32px;border:1px solid var(--border-primary);border-radius:6px;background:var(--bg-secondary);cursor:pointer;font-size:14px;flex-shrink:0';

bar.append(inp, searchBtn, settBtn);

const settPanel = document.createElement('div');
settPanel.style.cssText = 'display:none;flex-direction:column;gap:4px;padding:8px;border-bottom:1px solid var(--border-primary);background:var(--bg-secondary)';
const keyInp = document.createElement('input');
keyInp.type = 'password'; keyInp.placeholder = 'SerpAPI key'; keyInp.value = apiKey;
keyInp.style.cssText = 'border:1px solid var(--border-primary);border-radius:4px;padding:5px 8px;font-size:12px;background:var(--bg-primary);color:var(--text-primary);outline:none';
keyInp.oninput = (e) => { apiKey = e.target.value; localStorage.setItem('serpapi-key', apiKey); };
const hint = document.createElement('a');
hint.href = 'https://serpapi.com/dashboard'; hint.target = '_blank';
hint.textContent = 'Get key from serpapi.com →';
hint.style.cssText = 'font-size:11px;color:var(--accent-blue)';
settPanel.append(keyInp, hint);

settBtn.onclick = () => { settPanel.style.display = settPanel.style.display === 'none' ? 'flex' : 'none'; };

const results = document.createElement('div');
results.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column';

const noKey = document.createElement('div');
noKey.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-tertiary);font-size:13px;text-align:center;padding:16px';
noKey.innerHTML = '<div style="font-size:28px">🔍</div><p>Add a <strong>SerpAPI key</strong> via ⚙️ to see inline results.</p>';

wrap.append(bar, settPanel, results);
document.body.appendChild(wrap);

async function doSearch() {
  const q = inp.value.trim();
  if (!q) return;
  if (!apiKey) { results.innerHTML = ''; results.appendChild(noKey); return; }
  results.innerHTML = '<div style="padding:16px;color:var(--text-tertiary);font-size:13px">Searching…</div>';
  try {
    const res = await fetch(HTTP_BASE + '/search?q=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(apiKey));
    const d = await res.json();
    if (!res.ok || d.error) { results.innerHTML = '<div style="padding:8px 12px;color:var(--accent-red);font-size:12px">' + (d.error||'Error') + '</div>'; return; }
    results.innerHTML = '';
    if (!d.results || !d.results.length) { results.innerHTML = '<div style="padding:16px;color:var(--text-tertiary)">No results</div>'; return; }
    d.results.forEach(r => {
      const a = document.createElement('a');
      a.href = r.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.style.cssText = 'display:flex;flex-direction:column;gap:2px;padding:9px 12px;border-bottom:1px solid var(--border-primary);text-decoration:none';
      a.onmouseover = () => a.style.background = 'var(--bg-secondary)';
      a.onmouseout  = () => a.style.background = '';
      const meta = document.createElement('div');
      meta.style.cssText = 'display:flex;align-items:center;gap:5px';
      const img = document.createElement('img');
      img.src = r.favicon || ('https://www.google.com/s2/favicons?domain=' + r.displayLink + '&sz=16');
      img.style.cssText = 'width:14px;height:14px;border-radius:2px;flex-shrink:0';
      img.onerror = () => img.style.display = 'none';
      const domain = document.createElement('span');
      domain.textContent = r.displayLink;
      domain.style.cssText = 'font-size:10px;color:var(--text-tertiary);font-family:monospace';
      meta.append(img, domain);
      const title = document.createElement('div');
      title.textContent = r.title;
      title.style.cssText = 'font-size:13px;font-weight:600;color:var(--accent-blue);line-height:1.3';
      const snip = document.createElement('div');
      snip.textContent = r.snippet || '';
      snip.style.cssText = 'font-size:11px;color:var(--text-secondary);line-height:1.5';
      a.append(meta, title, snip);
      results.appendChild(a);
    });
  } catch(e) { results.innerHTML = '<div style="padding:8px 12px;color:var(--accent-red);font-size:12px">' + e.message + '</div>'; }
}

searchBtn.onclick = doSearch;
inp.onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };

if (!apiKey) results.appendChild(noKey);
else doSearch();