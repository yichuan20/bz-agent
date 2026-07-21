const H = window.__agentHttpBase__ || 'http://localhost:18789';
const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim();
const bgTertiary = cs.getPropertyValue('--bg-tertiary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const fontBody = cs.getPropertyValue('--font-body').trim() || 'system-ui';
const fontMono = cs.getPropertyValue('--font-heading').trim() || 'monospace';

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden';

const toolbar = document.createElement('div');
toolbar.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;
const pathInp = document.createElement('input');
pathInp.placeholder='Paste a file path or URL';
pathInp.style.cssText='flex:1;border:1px solid '+borderPrimary+';border-radius:6px;padding:4px 8px;font-size:11px;background:'+bgTertiary+';color:'+textPrimary+';font-family:'+fontMono+';outline:none';
const loadBtn = document.createElement('button');
loadBtn.textContent='Load';
loadBtn.style.cssText='padding:4px 12px;border-radius:6px;border:none;background:'+accentBlue+';color:#fff;font-size:11px;cursor:pointer';

const preview = document.createElement('div');
preview.style.cssText='flex:1;overflow-y:auto;padding:16px 20px;font-family:'+fontBody+';font-size:13px;line-height:1.7;color:'+textPrimary;

const style = document.createElement('style');
style.textContent='h1,h2,h3{margin:16px 0 8px;font-weight:700}h1{font-size:20px}h2{font-size:16px}h3{font-size:14px}'
  +'p{margin:8px 0}code{background:'+bgTertiary+';padding:1px 5px;border-radius:4px;font-family:'+fontMono+';font-size:12px}'
  +'pre{background:'+bgTertiary+';border:1px solid '+borderPrimary+';border-radius:8px;padding:12px;overflow-x:auto;margin:8px 0}'
  +'pre code{background:none;padding:0}a{color:'+accentBlue+'}blockquote{border-left:3px solid '+borderPrimary+';padding-left:12px;color:'+textSecondary+';margin:8px 0}'
  +'ul,ol{padding-left:20px;margin:8px 0}hr{border:none;border-top:1px solid '+borderPrimary+';margin:16px 0}';
document.head.appendChild(style);

// Simple markdown parser
function parseMarkdown(md) {
  return md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^#{3} (.+)$/gm,'<h3>$1</h3>')
    .replace(/^#{2} (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/**(.+?)**/g,'<strong>$1</strong>')
    .replace(/_(.+?)_/g,'<em>$1</em>')
    .replace(/```[sS]+?```/g, m=>'<pre><code>'+m.slice(3,-3).replace(/^[a-z]+
/,'')+'</code></pre>')
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^---$/gm,'<hr>')
    .replace(/[([^]]+)](([^)]+))/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^[-*] (.+)$/gm,'<li>$1</li>')
    .replace(/</li>
<li>/g,'</li><li>')
    .replace(/(<li>.*</li>)/gs,'<ul>$1</ul>')
    .replace(/

/g,'</p><p>')
    .replace(/^(?!<[hupboali])/gm,'')
    ;
}

async function loadFile() {
  const val = pathInp.value.trim(); if(!val) return;
  preview.innerHTML='<p style="color:'+textSecondary+'">Loading…</p>';
  try {
    let text;
    if(val.startsWith('http')){
      const res=await fetch(H+'/proxy',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({url:val,method:'GET',headers:{}})});
      text=await res.text();
    } else {
      const res=await fetch(H+'/shell?cmd='+encodeURIComponent('cat "'+val+'"'));
      const d=await res.json();
      if(d.error) throw new Error(d.error);
      text=d.output;
    }
    preview.innerHTML='<p>'+parseMarkdown(text)+'</p>';
  } catch(e){ preview.innerHTML='<p style="color:var(--accent-red)">Error: '+e.message+'</p>'; }
}
loadBtn.onclick=loadFile;
pathInp.onkeydown=e=>{ if(e.key==='Enter') loadFile(); };

toolbar.append(pathInp, loadBtn);
wrap.append(toolbar, preview);
document.body.appendChild(wrap);
preview.innerHTML='<p style="color:'+textSecondary+';text-align:center;margin-top:40px">Enter a file path or URL above to render Markdown.</p>';