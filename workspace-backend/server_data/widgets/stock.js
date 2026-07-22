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

const DEFAULT_TICKERS = ['bitcoin','ethereum','solana','cardano'];

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden;font-family:'+fontBody;

const toolbar = document.createElement('div');
toolbar.style.cssText='display:flex;gap:6px;align-items:center;padding:6px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;
const label = document.createElement('span');
label.textContent='Crypto (CoinGecko · free)';
label.style.cssText='font-size:11px;color:'+textSecondary;
const refreshBtn = document.createElement('button');
refreshBtn.textContent='↻ Refresh';
refreshBtn.style.cssText='margin-left:auto;padding:3px 10px;border-radius:6px;border:1px solid '+borderPrimary+';background:transparent;font-size:11px;color:'+textSecondary+';cursor:pointer';
toolbar.append(label, refreshBtn);

const grid = document.createElement('div');
grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px;overflow-y:auto;flex:1';

async function load() {
  grid.innerHTML='<p style="color:'+textSecondary+';font-size:12px;grid-column:1/-1;padding:16px 0;text-align:center">Loading…</p>';
  try {
    const url='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids='+DEFAULT_TICKERS.join(',')+'&order=market_cap_desc&per_page=10&page=1&sparkline=false';
    const res=await fetch(H+'/api/v1/runtime/proxy',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({url,method:'GET',headers:{}})});
    const coins=await res.json();
    grid.innerHTML='';
    coins.forEach(c=>{
      const card=document.createElement('div');
      card.style.cssText='border:1px solid '+borderPrimary+';border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;background:'+bgSecondary;
      const up=c.price_change_percentage_24h>=0;
      card.innerHTML='<div style="display:flex;align-items:center;gap:6px"><img src="'+c.image+'" style="width:20px;height:20px;border-radius:50%"><span style="font-size:12px;font-weight:600;color:'+textPrimary+'">'+c.symbol.toUpperCase()+'</span></div>'
        +'<div style="font-size:18px;font-weight:700;font-family:'+fontMono+';color:'+textPrimary+'">$'+c.current_price.toLocaleString()+'</div>'
        +'<div style="font-size:11px;color:'+(up?accentGreen:accentRed)+';font-weight:600">'+(up?'+':'')+c.price_change_percentage_24h.toFixed(2)+'% 24h</div>'
        +'<div style="font-size:10px;color:'+textSecondary+'">Vol: $'+Math.round(c.total_volume/1e6)+'M</div>';
      grid.appendChild(card);
    });
  } catch(e){
    grid.innerHTML='<p style="color:var(--accent-red);font-size:12px;padding:16px;grid-column:1/-1">'+e.message+'</p>';
  }
}
refreshBtn.onclick=load;
wrap.append(toolbar, grid);
document.body.appendChild(wrap);
load();
setInterval(load, 60000);