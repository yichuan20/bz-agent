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
const fontBody = cs.getPropertyValue('--font-body').trim() || 'system-ui';

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden;font-family:'+fontBody;

const toolbar = document.createElement('div');
toolbar.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;
const repoInp = document.createElement('input');
repoInp.placeholder='owner/repo (e.g. torvalds/linux)';
repoInp.style.cssText='flex:1;border:1px solid '+borderPrimary+';border-radius:6px;padding:4px 8px;font-size:11px;background:'+bgTertiary+';color:'+textPrimary+';outline:none';
const loadBtn = document.createElement('button');
loadBtn.textContent='Load';
loadBtn.style.cssText='padding:4px 12px;border-radius:6px;border:none;background:'+accentBlue+';color:#fff;font-size:11px;cursor:pointer';

const tabs = document.createElement('div');
tabs.style.cssText='display:flex;border-bottom:1px solid '+borderPrimary+';flex-shrink:0';
const list = document.createElement('div');
list.style.cssText='flex:1;overflow-y:auto';

let activeTab='prs';
['PRs','Issues','Commits'].forEach((label,i)=>{
  const t=['prs','issues','commits'][i];
  const btn=document.createElement('button');
  btn.textContent=label; btn.dataset.tab=t;
  btn.style.cssText='flex:1;padding:6px 4px;border:none;background:transparent;font-size:var(--font-size-xs,11px);color:'+textSecondary+';cursor:pointer;border-bottom:2px solid transparent;transition:.1s';
  btn.onclick=()=>{ activeTab=t; updateTabStyles(); loadData(); };
  tabs.appendChild(btn);
});
function updateTabStyles(){
  tabs.querySelectorAll('button').forEach(b=>{
    const active=b.dataset.tab===activeTab;
    b.style.color=active?accentBlue:textSecondary;
    b.style.borderBottomColor=active?accentBlue:'transparent';
  });
}
updateTabStyles();

async function loadData() {
  const repo=repoInp.value.trim(); if(!repo) return;
  list.innerHTML='<p style="padding:16px;font-size:12px;color:'+textSecondary+'">Loading…</p>';
  try {
    const endpoints={
      prs:'https://api.github.com/repos/'+repo+'/pulls?state=all&per_page=20',
      issues:'https://api.github.com/repos/'+repo+'/issues?state=all&per_page=20',
      commits:'https://api.github.com/repos/'+repo+'/commits?per_page=20',
    };
    const res=await fetch(H+'/api/v1/runtime/proxy',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({url:endpoints[activeTab],method:'GET',headers:{'Authorization':'Bearer {{GITHUB_TOKEN}}','Accept':'application/vnd.github.v3+json'}})});
    const items=await res.json();
    if(!Array.isArray(items)) throw new Error(items.message||JSON.stringify(items));
    list.innerHTML='';
    items.forEach(item=>{
      const row=document.createElement('div');
      row.style.cssText='padding:8px 12px;border-bottom:1px solid '+borderPrimary+';display:flex;flex-direction:column;gap:2px';
      const title=document.createElement('a');
      title.href=item.html_url||'#'; title.target='_blank';
      title.textContent=(activeTab==='commits'?item.commit?.message?.split('\n')[0]:item.title)||'—';
      title.style.cssText='font-size:12px;color:'+accentBlue+';text-decoration:none;line-height:1.4';
      const meta=document.createElement('span');
      const state=item.state||(item.commit?'':'open');
      const stateColor=state==='closed'?accentRed:state==='merged'?accentBlue:accentGreen;
      meta.innerHTML='<span style="color:'+stateColor+';font-size:10px;font-weight:600">'+(state||'').toUpperCase()+'</span>'
        +'<span style="color:'+textSecondary+';font-size:10px;margin-left:8px">'+(item.user?.login||item.commit?.author?.name||'')+'</span>';
      row.append(title,meta);
      list.appendChild(row);
    });
  } catch(e){ list.innerHTML='<p style="padding:16px;font-size:12px;color:var(--accent-red)">'+e.message+'</p>'; }
}
loadBtn.onclick=loadData;
repoInp.onkeydown=e=>{ if(e.key==='Enter') loadData(); };

toolbar.append(repoInp, loadBtn);
wrap.append(toolbar, tabs, list);
document.body.appendChild(wrap);