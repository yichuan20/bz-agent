const H = window.__agentHttpBase__ || 'http://localhost:18789';
const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgPrimary = cs.getPropertyValue('--bg-primary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentGreen = cs.getPropertyValue('--accent-green').trim() || '#2DB970';
const accentRed = cs.getPropertyValue('--accent-red').trim() || '#E5352B';
const fontMono = cs.getPropertyValue('--font-heading').trim() || 'monospace';

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;background:#0a0a0a;color:#e0e0e0;font-family:'+fontMono;

const output = document.createElement('div');
output.style.cssText='flex:1;overflow-y:auto;padding:10px 12px;font-size:11px;line-height:1.7;white-space:pre-wrap;word-break:break-all';

const inputRow = document.createElement('div');
inputRow.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 12px;border-top:1px solid #222;flex-shrink:0';
const prompt = document.createElement('span');
prompt.textContent='$ ';
prompt.style.cssText='color:'+accentGreen+';font-size:12px;flex-shrink:0';
const cmdInp = document.createElement('input');
cmdInp.placeholder='ls -la';
cmdInp.style.cssText='flex:1;background:transparent;border:none;outline:none;font-family:'+fontMono+';font-size:12px;color:#e0e0e0';

let cwd = window.__agentHttpBase__ ? '' : '';

function appendLine(text, color) {
  const line = document.createElement('span');
  line.style.color = color || '#e0e0e0';
  line.textContent = text + '\n';
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

appendLine('Terminal — commands run on the Python server', '#555');
appendLine('Type a command and press Enter', '#555');
appendLine('', '');

async function runCmd() {
  const cmd = cmdInp.value.trim(); if(!cmd) return;
  appendLine('$ ' + cmd, accentGreen);
  cmdInp.value = '';
  try {
    const url = H+'/shell?cmd='+encodeURIComponent(cmd)+(cwd?'&cwd='+encodeURIComponent(cwd):'');
    const res = await fetch(url);
    const d = await res.json();
    if(d.error) { appendLine(d.error, accentRed); }
    else {
      if(d.output) appendLine(d.output.replace(/\n$/, ''), d.returncode===0?'#e0e0e0':accentRed);
      if(cmd.trim().startsWith('cd ')) {
        // track cwd
        const r2 = await fetch(H+'/shell?cmd=pwd'+(cwd?'&cwd='+encodeURIComponent(cwd):''));
        const d2 = await r2.json();
        if(!d2.error) cwd = d2.output.trim();
      }
    }
  } catch(e){ appendLine('Error: '+e.message, accentRed); }
}
cmdInp.onkeydown=e=>{ if(e.key==='Enter') runCmd(); };

wrap.append(output, inputRow);
inputRow.append(prompt, cmdInp);
document.body.appendChild(wrap);
cmdInp.focus();