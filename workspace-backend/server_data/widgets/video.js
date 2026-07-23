const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh';

function showInput() {
  wrap.innerHTML = '';
  const inner = document.createElement('div');
  inner.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px';
  const hint = document.createElement('p');
  hint.textContent = 'Paste a YouTube or Vimeo URL';
  hint.style.cssText = 'font-size:12px;color:var(--text-secondary);font-weight:600';
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:6px;width:100%';
  const inp = document.createElement('input');
  inp.placeholder = 'https://youtube.com/watch?v=…';
  inp.style.cssText = 'flex:1;border:1px solid var(--border-primary);border-radius:6px;padding:6px 10px;font-size:12px;background:var(--bg-secondary);color:var(--text-primary);outline:none';
  const btn = document.createElement('button');
  btn.textContent = '→';
  btn.style.cssText = 'width:32px;height:32px;border-radius:6px;border:none;background:var(--accent-blue);color:#fff;cursor:pointer;font-size:16px;flex-shrink:0';
  bar.append(inp, btn);
  const err = document.createElement('p');
  err.style.cssText = 'font-size:11px;color:var(--accent-red);display:none';
  inner.append(hint, bar, err);
  wrap.appendChild(inner);
  function load() {
    const url = inp.value.trim();
    let embed = null;
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtube.com')) { const id = u.searchParams.get('v'); if (id) embed = 'https://www.youtube.com/embed/'+id; }
      else if (u.hostname === 'youtu.be') { const id = u.pathname.slice(1); if (id) embed = 'https://www.youtube.com/embed/'+id; }
      else if (u.hostname.includes('vimeo.com')) { const id = u.pathname.split('/').filter(Boolean)[0]; if (id) embed = 'https://player.vimeo.com/video/'+id; }
      else embed = url;
    } catch(e) {}
    if (embed) showEmbed(embed);
    else { err.textContent = "Couldn’t parse that URL."; err.style.display = ''; }
  }
  btn.onclick = load;
  inp.onkeydown = (e) => { if (e.key === 'Enter') load(); };
}

function showEmbed(src) {
  wrap.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.allow = 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.style.cssText = 'flex:1;border:none;min-height:0;width:100%';
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:4px 8px;border-top:1px solid var(--border-primary)';
  const back = document.createElement('button');
  back.textContent = 'Change URL';
  back.style.cssText = 'background:none;border:1px solid var(--border-primary);border-radius:4px;padding:2px 10px;font-size:11px;color:var(--text-tertiary);cursor:pointer';
  back.onclick = showInput;
  footer.appendChild(back);
  wrap.append(iframe, footer);
}
document.body.appendChild(wrap);
showInput();