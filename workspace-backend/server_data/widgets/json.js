const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim();
const bgTertiary = cs.getPropertyValue('--bg-tertiary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const accentGreen = cs.getPropertyValue('--accent-green').trim() || '#2DB970';
const accentRed = cs.getPropertyValue('--accent-red').trim() || '#E5352B';
const accentOrange = cs.getPropertyValue('--accent-orange').trim() || '#D97706';
const fontMono = cs.getPropertyValue('--font-heading').trim() || 'monospace';

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden';

const toolbar = document.createElement('div');
toolbar.style.cssText='display:flex;gap:6px;padding:6px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;
const inp = document.createElement('textarea');
inp.placeholder='Paste JSON or YAML here…';
inp.rows=1;
inp.style.cssText='flex:1;border:1px solid '+borderPrimary+';border-radius:6px;padding:4px 8px;font-size:11px;font-family:'+fontMono+';background:'+bgTertiary+';color:'+textPrimary+';resize:none;outline:none';
const parseBtn = document.createElement('button');
parseBtn.textContent='Parse';
parseBtn.style.cssText='padding:4px 12px;border-radius:6px;border:none;background:'+accentBlue+';color:#fff;font-size:11px;cursor:pointer';

const tree = document.createElement('div');
tree.style.cssText='flex:1;overflow:auto;padding:10px 12px;font-family:'+fontMono+';font-size:12px;line-height:1.7';

function valueColor(v) {
  if(v===null) return textSecondary;
  if(typeof v==='boolean') return accentBlue;
  if(typeof v==='number') return accentOrange;
  if(typeof v==='string') return accentGreen;
  return textPrimary;
}

function renderNode(val, depth) {
  const indent = '  '.repeat(depth);
  const container = document.createElement('div');

  if(val && typeof val==='object') {
    const isArr = Array.isArray(val);
    const entries = isArr ? val.map((v,i)=>[i,v]) : Object.entries(val);
    const toggle = document.createElement('span');
    toggle.textContent=(isArr?'['+'[':'{')+'…'+(isArr?']':'}');
    toggle.style.cssText='cursor:pointer;color:'+textSecondary+';font-size:11px;user-select:none';
    container.appendChild(toggle);

    const children = document.createElement('div');
    children.style.marginLeft='16px';
    entries.forEach(([k,v])=>{
      const row=document.createElement('div');
      if(!isArr){
        const key=document.createElement('span');
        key.textContent='"'+k+'": ';
        key.style.color=accentBlue;
        row.appendChild(key);
      }
      row.appendChild(renderNode(v, depth+1));
      children.appendChild(row);
    });
    container.appendChild(children);

    toggle.onclick=()=>{
      children.style.display=children.style.display==='none'?'':'none';
      toggle.textContent=children.style.display==='none'
        ?(isArr?'[':'{')+' ('+entries.length+') '+(isArr?']':'}')
        :(isArr?'[':'{')+' …';
    };
  } else {
    const span=document.createElement('span');
    span.style.color=valueColor(val);
    span.textContent=JSON.stringify(val);
    container.appendChild(span);
  }
  return container;
}

function doParse() {
  const text=inp.value.trim(); if(!text) return;
  try {
    const data=JSON.parse(text);
    tree.innerHTML='';
    tree.appendChild(renderNode(data,0));
  } catch(e){
    tree.innerHTML='<span style="color:'+accentRed+'">Parse error: '+e.message+'</span>';
  }
}
parseBtn.onclick=doParse;
inp.onkeydown=e=>{ if(e.key==='Enter'&&e.ctrlKey) doParse(); };

toolbar.append(inp, parseBtn);
wrap.append(toolbar, tree);
document.body.appendChild(wrap);
tree.innerHTML='<span style="color:'+textSecondary+'">Paste JSON and click Parse (or Ctrl+Enter)</span>';