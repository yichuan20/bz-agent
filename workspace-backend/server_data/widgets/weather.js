const H = window.__agentHttpBase__ || 'http://localhost:18789';
const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim();
const bgTertiary = cs.getPropertyValue('--bg-tertiary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const fontBody = cs.getPropertyValue('--font-body').trim() || 'system-ui';

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden';

const toolbar = document.createElement('div');
toolbar.style.cssText='display:flex;gap:6px;padding:6px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;
const cityInp = document.createElement('input');
cityInp.value='London'; cityInp.placeholder='City name';
cityInp.style.cssText='flex:1;border:1px solid '+borderPrimary+';border-radius:6px;padding:4px 8px;font-size:11px;background:'+bgTertiary+';color:'+textPrimary+';outline:none';
const searchBtn = document.createElement('button');
searchBtn.textContent='Search';
searchBtn.style.cssText='padding:4px 12px;border-radius:6px;border:none;background:'+accentBlue+';color:#fff;font-size:11px;cursor:pointer';
toolbar.append(cityInp, searchBtn);

const content = document.createElement('div');
content.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px;text-align:center;font-family:'+fontBody;

async function fetchWeather() {
  const city=cityInp.value.trim(); if(!city) return;
  content.innerHTML='<p style="color:'+textSecondary+'">Loading…</p>';
  try {
    const url='https://api.openweathermap.org/data/2.5/weather?q='+encodeURIComponent(city)+'&appid={{OPENWEATHERMAP_API_KEY}}&units=metric';
    const res=await fetch(H+'/proxy',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({url,method:'GET',headers:{}})});
    const d=await res.json();
    if(d.cod&&d.cod!==200) throw new Error(d.message);
    const icon='https://openweathermap.org/img/wn/'+d.weather[0].icon+'@2x.png';
    content.innerHTML='';
    const img=document.createElement('img');
    img.src=icon; img.style.cssText='width:80px;height:80px';
    const temp=document.createElement('div');
    temp.textContent=Math.round(d.main.temp)+'°C';
    temp.style.cssText='font-size:48px;font-weight:700;color:'+textPrimary;
    const desc=document.createElement('div');
    desc.textContent=d.weather[0].description;
    desc.style.cssText='font-size:14px;color:'+textSecondary+';text-transform:capitalize';
    const loc=document.createElement('div');
    loc.textContent=d.name+', '+d.sys.country;
    loc.style.cssText='font-size:12px;color:'+textSecondary;
    const details=document.createElement('div');
    details.style.cssText='display:flex;gap:16px;font-size:11px;color:'+textSecondary+';margin-top:8px';
    ['💧 '+d.main.humidity+'%','💨 '+d.wind.speed+'m/s','👁 '+Math.round((d.visibility||0)/1000)+'km'].forEach(t=>{
      const s=document.createElement('span'); s.textContent=t; details.appendChild(s);
    });
    content.append(img,temp,desc,loc,details);
  } catch(e){
    content.innerHTML='<p style="color:var(--accent-red)">Error: '+e.message+'</p><p style="font-size:11px;color:'+textSecondary+'">Add OPENWEATHERMAP_API_KEY in Credentials</p>';
  }
}
searchBtn.onclick=fetchWeather;
cityInp.onkeydown=e=>{ if(e.key==='Enter') fetchWeather(); };

wrap.append(toolbar, content);
document.body.appendChild(wrap);
fetchWeather();