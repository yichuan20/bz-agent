const H = window.__agentHttpBase__ || 'http://localhost:18789';
const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim();
const bgTertiary = cs.getPropertyValue('--bg-tertiary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const fontMono = cs.getPropertyValue('--font-heading').trim() || 'monospace';

const wrap=document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh';

const toolbar=document.createElement('div');
toolbar.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;
const backBtn=document.createElement('button');
backBtn.textContent='←';
backBtn.style.cssText='padding:3px 8px;border:1px solid '+borderPrimary+';border-radius:6px;background:transparent;color:'+textSecondary+';cursor:pointer;font-size:13px';
const urlInp=document.createElement('input');
urlInp.placeholder='https://example.com';
urlInp.style.cssText='flex:1;border:1px solid '+borderPrimary+';border-radius:6px;padding:4px 10px;font-size:11px;font-family:'+fontMono+';background:'+bgTertiary+';color:'+textPrimary+';outline:none';
const goBtn=document.createElement('button');
goBtn.textContent='Go';
goBtn.style.cssText='padding:4px 12px;border-radius:6px;border:none;background:'+accentBlue+';color:#fff;font-size:11px;cursor:pointer';

const preview=document.createElement('div');
preview.style.cssText='flex:1;overflow-y:auto;padding:16px;font-size:13px;color:'+textPrimary+';line-height:1.6';

const style=document.createElement('style');
style.textContent='a{color:'+accentBlue+'}img{max-width:100%;border-radius:4px}h1,h2,h3{margin:12px 0 6px}p,ul,ol{margin:6px 0}pre,code{background:'+bgTertiary+';border-radius:4px;padding:2px 5px;font-family:'+fontMono+';font-size:11px}';
document.head.appendChild(style);

let history=[];

async function load(url) {
  if(!url.startsWith('http')) url='https://'+url;
  urlInp.value=url;
  preview.innerHTML='<p style="color:'+textSecondary+'">Fetching…</p>';
  try {
    const res=await fetch(H+'/proxy',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({url,method:'GET',headers:{'User-Agent':'Mozilla/5.0'}})});
    const html=await res.text();
    const parser=new DOMParser();
    const doc=parser.parseFromString(html,'text/html');
    // Remove scripts, styles, navs for clean reading view
    doc.querySelectorAll('script,style,nav,footer,aside,[role="banner"]').forEach(e=>e.remove());
    const main=doc.querySelector('article,main,[role="main"]')||doc.body;
    preview.innerHTML=main?main.innerHTML:'<p>No content found</p>';
    // Make links load in widget
    preview.querySelectorAll('a[href]').forEach(a=>{
      const href=a.getAttribute('href');
      a.onclick=e=>{e.preventDefault();if(href&&href.startsWith('http')){history.push(url);load(href);}};
    });
    history.push(url);
  } catch(e){ preview.innerHTML='<p style="color:var(--accent-red)">Failed: '+e.message+'</p>'; }
}

goBtn.onclick=()=>load(urlInp.value.trim());
urlInp.onkeydown=e=>{ if(e.key==='Enter') load(urlInp.value.trim()); };
backBtn.onclick=()=>{ if(history.length>1){history.pop();load(history.pop());} };

toolbar.append(backBtn, urlInp, goBtn);
wrap.append(toolbar, preview);
document.body.appendChild(wrap);
preview.innerHTML='<p style="color:'+textSecondary+';text-align:center;margin-top:40px">Enter a URL to browse in reader mode.</p>';