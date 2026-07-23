const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const accentGreen = cs.getPropertyValue('--accent-green').trim() || '#2DB970';
const accentRed = cs.getPropertyValue('--accent-red').trim() || '#E5352B';
const fontMono = cs.getPropertyValue('--font-heading').trim() || 'monospace';

let totalSeconds = 25 * 60;
let remaining = totalSeconds;
let running = false;
let timer = null;
let mode = 'pomodoro';

const presets = {pomodoro:25*60, 'short break':5*60, 'long break':15*60, custom:0};

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px';

const tabs = document.createElement('div');
tabs.style.cssText='display:flex;gap:4px';
Object.keys(presets).filter(k=>k!=='custom').forEach(label=>{
  const btn=document.createElement('button');
  btn.textContent=label.charAt(0).toUpperCase()+label.slice(1);
  btn.dataset.mode=label;
  btn.style.cssText='padding:4px 12px;border-radius:100px;border:1px solid '+borderPrimary+';background:transparent;font-size:11px;color:'+textSecondary+';cursor:pointer;transition:.12s';
  btn.onclick=()=>{
    mode=label; remaining=totalSeconds=presets[label];
    running=false; clearInterval(timer);
    update(); highlightTab(label);
  };
  tabs.appendChild(btn);
});

function highlightTab(m) {
  tabs.querySelectorAll('button').forEach(b=>{
    const active=b.dataset.mode===m;
    b.style.background=active?accentBlue:'transparent';
    b.style.color=active?'#fff':textSecondary;
    b.style.borderColor=active?accentBlue:borderPrimary;
  });
}

const display = document.createElement('div');
display.style.cssText='font-size:52px;font-weight:700;font-family:'+fontMono+';color:'+textPrimary+';letter-spacing:-.02em';

const progress = document.createElement('div');
progress.style.cssText='width:200px;height:4px;background:'+bgSecondary+';border-radius:2px;overflow:hidden';
const bar = document.createElement('div');
bar.style.cssText='height:100%;background:'+accentBlue+';border-radius:2px;transition:width .5s ease';
progress.appendChild(bar);

const controls = document.createElement('div');
controls.style.cssText='display:flex;gap:8px';

const startBtn = document.createElement('button');
startBtn.style.cssText='padding:8px 24px;border-radius:8px;border:none;background:'+accentBlue+';color:#fff;font-size:13px;font-weight:600;cursor:pointer';

const resetBtn = document.createElement('button');
resetBtn.textContent='Reset';
resetBtn.style.cssText='padding:8px 16px;border-radius:8px;border:1px solid '+borderPrimary+';background:transparent;font-size:13px;cursor:pointer;color:'+textSecondary;

function update() {
  const m=Math.floor(remaining/60), s=remaining%60;
  display.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
  bar.style.width=(remaining/totalSeconds*100)+'%';
  bar.style.background=remaining<60?accentRed:remaining<totalSeconds*0.25?accentGreen:accentBlue;
  startBtn.textContent=running?'Pause':'Start';
}

startBtn.onclick=()=>{
  running=!running;
  if(running) timer=setInterval(()=>{ if(remaining>0){remaining--;update();}else{running=false;clearInterval(timer);update();} },1000);
  else clearInterval(timer);
  update();
};
resetBtn.onclick=()=>{ running=false; clearInterval(timer); remaining=totalSeconds; update(); };

controls.append(startBtn, resetBtn);
wrap.append(tabs, display, progress, controls);
document.body.appendChild(wrap);
highlightTab('pomodoro');
update();