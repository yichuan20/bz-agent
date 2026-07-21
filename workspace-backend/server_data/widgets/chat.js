function uid() { return Math.random().toString(36).slice(2); }
function now() { return new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
const messages = [{id:uid(),text:'Hello! Type a message below.',from:'them',time:now()}];

const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh';
const msgArea = document.createElement('div');
msgArea.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:10px';

function renderMessages() {
  msgArea.innerHTML = '';
  messages.forEach(m => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:2px;max-width:80%;align-self:'+(m.from==='me'?'flex-end':'flex-start')
      +';align-items:'+(m.from==='me'?'flex-end':'flex-start');
    const bubble = document.createElement('div');
    bubble.textContent = m.text;
    bubble.style.cssText = 'padding:6px 10px;border-radius:12px;font-size:12px;line-height:1.5;'
      +(m.from==='me'?'background:var(--accent-blue);color:#fff;border-bottom-right-radius:3px':'background:var(--bg-tertiary);color:var(--text-primary);border-bottom-left-radius:3px');
    const time = document.createElement('div');
    time.textContent = m.time;
    time.style.cssText = 'font-size:9px;color:var(--text-tertiary);padding:0 4px';
    row.append(bubble, time);
    msgArea.appendChild(row);
  });
  msgArea.scrollTop = msgArea.scrollHeight;
}
renderMessages();

const inputRow = document.createElement('div');
inputRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px;border-top:1px solid var(--border-primary)';
const inp = document.createElement('input');
inp.placeholder = 'Type a message…';
inp.style.cssText = 'flex:1;border:1px solid var(--border-primary);border-radius:6px;padding:6px 10px;font-size:12px;background:var(--bg-secondary);color:var(--text-primary);outline:none';
const btn = document.createElement('button');
btn.textContent = '→';
btn.style.cssText = 'width:32px;height:32px;border-radius:6px;border:none;background:var(--accent-blue);color:#fff;cursor:pointer;font-size:16px;flex-shrink:0';

function send() {
  const text = inp.value.trim();
  if (!text) return;
  messages.push({id:uid(),text,from:'me',time:now()});
  inp.value = '';
  renderMessages();
}
btn.onclick = send;
inp.onkeydown = (e) => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

inputRow.append(inp, btn);
wrap.append(msgArea, inputRow);
document.body.appendChild(wrap);