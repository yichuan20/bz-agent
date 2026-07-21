const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh';

function showSetup() {
  wrap.innerHTML = '';
  const inner = document.createElement('div');
  inner.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;text-align:center';
  const icon = document.createElement('div'); icon.textContent = '📹'; icon.style.fontSize='36px';
  const title = document.createElement('p'); title.textContent = 'Video Call via Jitsi Meet';
  title.style.cssText = 'font-size:14px;font-weight:600;color:var(--text-primary)';
  const sub = document.createElement('p'); sub.textContent = 'Free · No account · Encrypted';
  sub.style.cssText = 'font-size:12px;color:var(--text-secondary)';
  const bar = document.createElement('div'); bar.style.cssText='display:flex;gap:6px;width:100%';
  const inp = document.createElement('input');
  inp.placeholder = 'Room name (share to invite)';
  inp.style.cssText = 'flex:1;border:1px solid var(--border-primary);border-radius:6px;padding:6px 10px;font-size:12px;background:var(--bg-secondary);color:var(--text-primary);outline:none';
  const btn = document.createElement('button');
  btn.textContent = '→';
  btn.style.cssText = 'width:32px;height:32px;border-radius:6px;border:none;background:var(--accent-blue);color:#fff;cursor:pointer;font-size:16px;flex-shrink:0';
  bar.append(inp, btn);
  const hint = document.createElement('p'); hint.textContent = 'Leave blank to generate a random room';
  hint.style.cssText = 'font-size:10px;color:var(--text-tertiary)';
  inner.append(icon, title, sub, bar, hint);
  wrap.appendChild(inner);
  function join() {
    const r = inp.value.trim() || 'canvas-'+Math.random().toString(36).slice(2,8);
    showCall(r);
  }
  btn.onclick = join;
  inp.onkeydown = (e) => { if (e.key==='Enter') join(); };
}

function showCall(room) {
  wrap.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = 'https://meet.jit.si/'+encodeURIComponent(room);
  iframe.allow = 'camera;microphone;fullscreen;display-capture;autoplay';
  iframe.style.cssText = 'flex:1;border:none;min-height:0;width:100%';
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-top:1px solid var(--border-primary)';
  const label = document.createElement('span');
  label.style.cssText = 'font-size:11px;color:var(--text-secondary);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  label.textContent = 'Room: '+room;
  const leave = document.createElement('button');
  leave.textContent = 'Leave';
  leave.style.cssText = 'background:none;border:1px solid var(--border-primary);border-radius:4px;padding:2px 10px;font-size:11px;color:var(--text-tertiary);cursor:pointer;flex-shrink:0';
  leave.onclick = showSetup;
  footer.append(label, leave);
  wrap.append(iframe, footer);
}

document.body.appendChild(wrap);
showSetup();