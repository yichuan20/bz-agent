const H = window.__agentHttpBase__ || 'http://localhost:18789';
const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim();
const bgTertiary = cs.getPropertyValue('--bg-tertiary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const fontMono = cs.getPropertyValue('--font-heading').trim() || 'monospace';
const fontBody = cs.getPropertyValue('--font-body').trim() || 'system-ui';

let currentPath = '';

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden';

const toolbar = document.createElement('div');
toolbar.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;
const upBtn = document.createElement('button');
upBtn.textContent='↑';
upBtn.title='Parent directory';
upBtn.style.cssText='padding:3px 8px;border:1px solid '+borderPrimary+';border-radius:6px;background:transparent;color:'+textSecondary+';cursor:pointer;font-size:13px';
const pathLbl = document.createElement('span');
pathLbl.style.cssText='flex:1;font-size:11px;font-family:'+fontMono+';color:'+textSecondary+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

const list = document.createElement('div');
list.style.cssText='flex:1;overflow-y:auto';

async function loadDir(path) {
  list.innerHTML='<div style="padding:16px;color:'+textSecondary+';font-size:12px">Loading…</div>';
  try {
    const res = await fetch(H+'/api/v1/files?path='+encodeURIComponent(path||'.'));
    const d = await res.json();
    if(d.error) throw new Error(d.error);
    currentPath=d.path;
    pathLbl.textContent=currentPath;
    list.innerHTML='';
    d.entries.forEach(entry=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:'+(entry.isDir?'pointer':'default')+';border-bottom:1px solid '+borderPrimary+';font-size:12px;font-family:'+fontBody+';color:'+textPrimary+';transition:background 100ms';
      row.onmouseover=()=>row.style.background=bgTertiary;
      row.onmouseout=()=>row.style.background='transparent';
      const icon=document.createElement('span');
      icon.textContent=entry.isDir?'📁':'📄';
      icon.style.fontSize='14px';
      const name=document.createElement('span');
      name.textContent=entry.name+(entry.isDir?'/':'');
      name.style.flex='1';
      const size=document.createElement('span');
      size.textContent=entry.isDir?'':formatSize(entry.size);
      size.style.cssText='color:'+textSecondary+';font-size:10px;font-family:'+fontMono;
      row.append(icon, name, size);
      if(entry.isDir) row.onclick=()=>loadDir(entry.path);
      list.appendChild(row);
    });
  } catch(e){
    list.innerHTML='<div style="padding:16px;color:var(--accent-red);font-size:12px">Error: '+e.message+'</div>';
  }
}

function formatSize(b) {
  if(b<1024) return b+'B';
  if(b<1048576) return (b/1024).toFixed(1)+'KB';
  return (b/1048576).toFixed(1)+'MB';
}

upBtn.onclick=()=>{
  const parent=currentPath.replace(/\/[^\/]+$/, '')||'/';
  loadDir(parent);
};

toolbar.append(upBtn, pathLbl);
wrap.append(toolbar, list);
document.body.appendChild(wrap);
loadDir('.');