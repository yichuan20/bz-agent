const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh';

const bar = document.createElement('div');
bar.style.cssText = 'display:flex;gap:4px;align-items:center;padding:8px;border-bottom:1px solid var(--border-primary)';

const inp = document.createElement('input');
inp.placeholder = 'Search Google Maps…';
inp.style.cssText = 'flex:1;border:1px solid var(--border-primary);border-radius:6px;padding:6px 10px;font-size:13px;background:var(--bg-secondary);color:var(--text-primary);outline:none';

const searchBtn = document.createElement('button');
searchBtn.textContent = '→';
searchBtn.style.cssText = 'width:32px;height:32px;border-radius:6px;border:none;background:var(--accent-blue);color:#fff;cursor:pointer;font-size:16px;flex-shrink:0';

const keyBtn = document.createElement('button');
keyBtn.textContent = '🔑';
keyBtn.style.cssText = 'width:32px;height:32px;border:1px solid var(--border-primary);border-radius:6px;background:var(--bg-secondary);cursor:pointer;font-size:14px;flex-shrink:0';

bar.append(inp, searchBtn, keyBtn);

const keyPanel = document.createElement('div');
keyPanel.style.cssText = 'display:none;flex-direction:column;gap:4px;padding:8px;border-bottom:1px solid var(--border-primary);background:var(--bg-secondary)';
const cxInp = document.createElement('input');
cxInp.placeholder = 'Google Maps API key (optional)';
cxInp.type = 'password';
cxInp.value = localStorage.getItem('maps-api-key')||'';
cxInp.style.cssText = 'border:1px solid var(--border-primary);border-radius:4px;padding:5px 8px;font-size:12px;background:var(--bg-primary);color:var(--text-primary);outline:none';
cxInp.oninput = (e) => localStorage.setItem('maps-api-key', e.target.value);
keyPanel.appendChild(cxInp);
keyBtn.onclick = () => { keyPanel.style.display = keyPanel.style.display==='none'?'flex':'none'; };

const content = document.createElement('div');
content.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0';
const empty = document.createElement('div');
empty.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-tertiary);font-size:13px;text-align:center;padding:16px';
empty.innerHTML = '<div style="font-size:32px">🗺️</div><p>Search a location above</p>';
content.appendChild(empty);

let currentIframe = null;
function doSearch() {
  const q = inp.value.trim();
  if (!q) return;
  const key = cxInp.value.trim();
  const src = key
    ? 'https://www.google.com/maps/embed/v1/search?q='+encodeURIComponent(q)+'&key='+key
    : 'https://maps.google.com/maps?q='+encodeURIComponent(q)+'&output=embed&hl=en';
  content.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.style.cssText = 'flex:1;border:none;width:100%;min-height:0;height:100%';
  iframe.referrerPolicy = 'no-referrer-when-downgrade';
  iframe.allowFullscreen = true;
  content.appendChild(iframe);
}
searchBtn.onclick = doSearch;
inp.onkeydown = (e) => { if (e.key==='Enter') doSearch(); };

wrap.append(bar, keyPanel, content);
document.body.appendChild(wrap);