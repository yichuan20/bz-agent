const cs = getComputedStyle(document.documentElement);
const bgPrimary = cs.getPropertyValue('--bg-primary').trim() || '#fff';
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const accentRed = cs.getPropertyValue('--accent-red').trim() || '#E5352B';
const accentGreen = cs.getPropertyValue('--accent-green').trim() || '#2DB970';

const wrap=document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden';

const toolbar=document.createElement('div');
toolbar.style.cssText='display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;

const canvas=document.createElement('canvas');
canvas.style.cssText='flex:1;cursor:crosshair;touch-action:none;background:'+bgPrimary;

let tool='pen', color='#000000', size=3, drawing=false, lastX=0, lastY=0;
let undoStack=[];

function resize(){
  const rect=canvas.getBoundingClientRect();
  const img=ctx.getImageData(0,0,canvas.width,canvas.height);
  canvas.width=rect.width; canvas.height=rect.height;
  ctx.putImageData(img,0,0);
}
const ctx=canvas.getContext('2d');

function saveUndo(){ undoStack.push(ctx.getImageData(0,0,canvas.width,canvas.height)); if(undoStack.length>30) undoStack.shift(); }

// Tools
const TOOLS=[
  {id:'pen',   label:'✏️', title:'Pen'},
  {id:'eraser',label:'⬜', title:'Eraser'},
  {id:'line',  label:'↗', title:'Line'},
  {id:'rect',  label:'□',  title:'Rectangle'},
  {id:'circle',label:'○', title:'Circle'},
];
const COLORS=['#000000','#ffffff',accentBlue,accentRed,accentGreen,'#F59E0B','#EC4899','#6B6358'];
const SIZES=[2,4,8,16];

let startX=0, startY=0, snapshot=null;

TOOLS.forEach(t=>{
  const btn=document.createElement('button');
  btn.title=t.title; btn.textContent=t.label; btn.dataset.tool=t.id;
  btn.style.cssText='width:28px;height:28px;border:1px solid '+borderPrimary+';border-radius:6px;background:'+bgPrimary+';cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0';
  btn.onclick=()=>{ tool=t.id; updateToolBtns(); };
  toolbar.appendChild(btn);
});
function updateToolBtns(){
  toolbar.querySelectorAll('[data-tool]').forEach(b=>{
    b.style.background=b.dataset.tool===tool?accentBlue:bgPrimary;
    b.style.color=b.dataset.tool===tool?'#fff':textSecondary;
    b.style.borderColor=b.dataset.tool===tool?accentBlue:borderPrimary;
  });
}
updateToolBtns();

const sep1=document.createElement('span');
sep1.style.cssText='width:1px;height:16px;background:'+borderPrimary+';margin:0 2px;flex-shrink:0';
toolbar.appendChild(sep1);

COLORS.forEach(c=>{
  const btn=document.createElement('button');
  btn.style.cssText='width:18px;height:18px;border-radius:50%;background:'+c+';border:2px solid '+(c==='#ffffff'?borderPrimary:'transparent')+';cursor:pointer;flex-shrink:0;transition:.1s';
  btn.onclick=()=>{ color=c; updateColorBtns(); };
  toolbar.appendChild(btn);
});
function updateColorBtns(){
  let i=0;
  toolbar.querySelectorAll('[style*="border-radius:50%"]').forEach(b=>{
    b.style.border=COLORS[i]===color?'2px solid '+accentBlue:'2px solid '+(COLORS[i]==='#ffffff'?borderPrimary:'transparent');
    i++;
  });
}

const sep2=document.createElement('span');
sep2.style.cssText='width:1px;height:16px;background:'+borderPrimary+';margin:0 2px;flex-shrink:0';
toolbar.appendChild(sep2);

SIZES.forEach(s=>{
  const btn=document.createElement('button');
  btn.style.cssText='width:28px;height:28px;border:1px solid '+borderPrimary+';border-radius:6px;background:'+bgPrimary+';cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0';
  const dot=document.createElement('div');
  dot.style.cssText='width:'+s+'px;height:'+s+'px;border-radius:50%;background:'+textSecondary;
  btn.appendChild(dot);
  btn.onclick=()=>{ size=s; };
  toolbar.appendChild(btn);
});

const sep3=document.createElement('span');
sep3.style.cssText='width:1px;height:16px;background:'+borderPrimary+';margin:0 2px;flex-shrink:0';
toolbar.appendChild(sep3);

const undoBtn=document.createElement('button');
undoBtn.textContent='↩ Undo';
undoBtn.style.cssText='padding:2px 8px;border:1px solid '+borderPrimary+';border-radius:6px;background:transparent;color:'+textSecondary+';cursor:pointer;font-size:11px;flex-shrink:0';
undoBtn.onclick=()=>{ if(undoStack.length) ctx.putImageData(undoStack.pop(),0,0); };
const clearBtn=document.createElement('button');
clearBtn.textContent='Clear';
clearBtn.style.cssText=undoBtn.style.cssText;
clearBtn.onclick=()=>{ saveUndo(); ctx.clearRect(0,0,canvas.width,canvas.height); };
toolbar.append(undoBtn, clearBtn);

function getPos(e){
  const r=canvas.getBoundingClientRect();
  const src=e.touches?e.touches[0]:e;
  return {x:src.clientX-r.left, y:src.clientY-r.top};
}

canvas.addEventListener('pointerdown',e=>{
  const {x,y}=getPos(e); drawing=true; lastX=x; lastY=y; startX=x; startY=y;
  if(['line','rect','circle'].includes(tool)) snapshot=ctx.getImageData(0,0,canvas.width,canvas.height);
  else saveUndo();
  ctx.beginPath(); ctx.moveTo(x,y);
});
canvas.addEventListener('pointermove',e=>{
  if(!drawing) return;
  const {x,y}=getPos(e);
  ctx.strokeStyle=tool==='eraser'?bgPrimary:color;
  ctx.lineWidth=tool==='eraser'?size*4:size;
  ctx.lineCap='round'; ctx.lineJoin='round';
  if(tool==='pen'||tool==='eraser'){
    ctx.lineTo(x,y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y);
  } else if(snapshot){
    ctx.putImageData(snapshot,0,0);
    ctx.beginPath();
    if(tool==='line'){ctx.moveTo(startX,startY);ctx.lineTo(x,y);ctx.stroke();}
    else if(tool==='rect'){ctx.strokeRect(startX,startY,x-startX,y-startY);}
    else if(tool==='circle'){
      const rx=(x-startX)/2,ry=(y-startY)/2;
      ctx.ellipse(startX+rx,startY+ry,Math.abs(rx),Math.abs(ry),0,0,2*Math.PI);
      ctx.stroke();
    }
  }
  lastX=x; lastY=y;
});
['pointerup','pointerleave'].forEach(ev=>canvas.addEventListener(ev,()=>drawing=false));

wrap.append(toolbar, canvas);
document.body.appendChild(wrap);
requestAnimationFrame(()=>{ resize(); });
new ResizeObserver(resize).observe(canvas);