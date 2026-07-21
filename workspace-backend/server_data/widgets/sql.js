const H = window.__agentHttpBase__ || 'http://localhost:18789';
const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim();
const bgTertiary = cs.getPropertyValue('--bg-tertiary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const accentGreen = cs.getPropertyValue('--accent-green').trim() || '#2DB970';
const accentRed = cs.getPropertyValue('--accent-red').trim() || '#E5352B';
const fontMono = cs.getPropertyValue('--font-heading').trim() || 'monospace';
const fontBody = cs.getPropertyValue('--font-body').trim() || 'system-ui';

const wrap=document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden;font-family:'+fontBody;

const queryArea=document.createElement('div');
queryArea.style.cssText='flex-shrink:0;border-bottom:1px solid '+borderPrimary;
const ta=document.createElement('textarea');
ta.placeholder='SELECT * FROM users LIMIT 10;
-- Uses {{DB_URL}} credential (postgres://user:pass@host/db)';
ta.rows=4;
ta.style.cssText='width:100%;border:none;outline:none;resize:none;padding:10px 12px;font-family:'+fontMono+';font-size:12px;background:var(--bg-primary);color:'+textPrimary+';line-height:1.6;box-sizing:border-box';
const runBar=document.createElement('div');
runBar.style.cssText='display:flex;align-items:center;gap:6px;padding:4px 8px;background:'+bgSecondary;
const runBtn=document.createElement('button');
runBtn.textContent='▶ Run  Ctrl+Enter';
runBtn.style.cssText='padding:4px 14px;border-radius:6px;border:none;background:'+accentBlue+';color:#fff;font-size:11px;cursor:pointer;font-family:'+fontBody;
const status=document.createElement('span');
status.style.cssText='font-size:11px;color:'+textSecondary;
runBar.append(runBtn, status);
queryArea.append(ta, runBar);

const results=document.createElement('div');
results.style.cssText='flex:1;overflow:auto;font-size:12px';

async function run() {
  const sql=ta.value.trim(); if(!sql) return;
  status.textContent='Running…';
  results.innerHTML='';
  try {
    const res=await fetch(H+'/sql',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({sql, db:'{{DB_URL}}'})});
    const d=await res.json();
    if(d.error) throw new Error(d.error);
    status.textContent='✓ '+d.rows.length+' row(s) — '+(d.duration_ms||0).toFixed(1)+'ms';
    if(!d.rows.length){results.innerHTML='<p style="padding:16px;color:'+textSecondary+'">No rows returned</p>';return;}
    const cols=Object.keys(d.rows[0]);
    const table=document.createElement('table');
    table.style.cssText='width:100%;border-collapse:collapse;white-space:nowrap';
    const thead=document.createElement('thead');
    const trh=document.createElement('tr');
    cols.forEach(c=>{
      const th=document.createElement('th');
      th.textContent=c;
      th.style.cssText='padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:'+textSecondary+';border-bottom:2px solid '+borderPrimary+';position:sticky;top:0;background:'+bgSecondary+';font-family:'+fontMono;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody=document.createElement('tbody');
    d.rows.forEach((row,ri)=>{
      const tr=document.createElement('tr');
      tr.style.background=ri%2?bgTertiary:'transparent';
      cols.forEach(c=>{
        const td=document.createElement('td');
        td.textContent=row[c]===null?'NULL':String(row[c]);
        td.style.cssText='padding:5px 10px;border-bottom:1px solid '+borderPrimary+';color:'+(row[c]===null?textSecondary:textPrimary)+';font-family:'+fontMono;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    results.appendChild(table);
  } catch(e){
    status.textContent='Error';
    results.innerHTML='<p style="padding:16px;color:'+accentRed+';font-size:12px">'+e.message+'</p><p style="padding:0 16px;font-size:11px;color:'+textSecondary+'">Add DB_URL in Credentials (e.g. postgresql://user:pass@localhost/db)</p>';
  }
}
runBtn.onclick=run;
ta.onkeydown=e=>{ if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();run();} };

wrap.append(queryArea, results);
document.body.appendChild(wrap);