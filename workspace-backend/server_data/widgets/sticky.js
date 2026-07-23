const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const fontBody = cs.getPropertyValue('--font-body').trim() || 'system-ui';

const COLORS=['#fef08a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff','#fed7aa'];
let notes=JSON.parse(localStorage.getItem('stickies')||'[]');
if(!notes.length) notes=[{id:1,text:'Click + to add a sticky note',color:'#fef08a'}];
let nextId=Math.max(0,...notes.map(n=>n.id))+1;

function save(){localStorage.setItem('stickies',JSON.stringify(notes));}

const wrap=document.createElement('div');
wrap.style.cssText='display:flex;flex-wrap:wrap;gap:10px;padding:10px;height:100vh;overflow-y:auto;align-content:flex-start;position:relative';

const addBtn=document.createElement('button');
addBtn.textContent='+';
addBtn.style.cssText='position:fixed;bottom:16px;right:16px;width:36px;height:36px;border-radius:50%;border:none;background:#333;color:#fff;font-size:22px;cursor:pointer;z-index:10;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.2)';
addBtn.onclick=()=>{
  const color=COLORS[Math.floor(Math.random()*COLORS.length)];
  notes.push({id:nextId++,text:'',color}); save(); render();
};

function render(){
  wrap.innerHTML='';
  notes.forEach(note=>{
    const card=document.createElement('div');
    card.style.cssText='width:160px;min-height:140px;background:'+note.color+';border-radius:4px;padding:8px;display:flex;flex-direction:column;gap:6px;box-shadow:2px 2px 6px rgba(0,0,0,.1);position:relative;flex-shrink:0';
    const colorRow=document.createElement('div');
    colorRow.style.cssText='display:flex;gap:4px;align-items:center';
    COLORS.forEach(c=>{
      const dot=document.createElement('button');
      dot.style.cssText='width:12px;height:12px;border-radius:50%;background:'+c+';border:'+(c===note.color?'2px solid #333':'1px solid rgba(0,0,0,.15)')+';cursor:pointer;padding:0;flex-shrink:0';
      dot.onclick=()=>{note.color=c;save();render();};
      colorRow.appendChild(dot);
    });
    const del=document.createElement('button');
    del.textContent='×';
    del.style.cssText='margin-left:auto;background:none;border:none;cursor:pointer;font-size:14px;color:rgba(0,0,0,.4);padding:0;line-height:1';
    del.onclick=()=>{notes=notes.filter(n=>n.id!==note.id);save();render();};
    colorRow.appendChild(del);
    const ta=document.createElement('textarea');
    ta.value=note.text; ta.placeholder='Type here…';
    ta.style.cssText='flex:1;border:none;background:transparent;resize:none;font-family:'+fontBody+';font-size:12px;color:#1a1a1a;outline:none;line-height:1.5;min-height:90px';
    ta.oninput=e=>{note.text=e.target.value;save();};
    card.append(colorRow,ta);
    wrap.appendChild(card);
  });
}

document.body.appendChild(wrap);
document.body.appendChild(addBtn);
render();