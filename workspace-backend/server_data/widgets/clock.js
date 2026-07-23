const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:8px';
const time = document.createElement('div');
const date = document.createElement('div');
time.style.cssText = 'font-size:28px;font-weight:700;letter-spacing:-0.02em;color:var(--text-primary);font-family:monospace';
date.style.cssText = 'font-size:12px;color:var(--text-secondary)';
wrap.append(time, date);
document.body.appendChild(wrap);
(function tick() {
  const n = new Date();
  time.textContent = n.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  date.textContent = n.toLocaleDateString([], {weekday:'long',year:'numeric',month:'long',day:'numeric'});
  setTimeout(tick, 1000);
})();