const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim();
const bgTertiary = cs.getPropertyValue('--bg-tertiary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const fontBody = cs.getPropertyValue('--font-body').trim() || 'system-ui';

const COLS=['Todo','In Progress','Done'];
let data=JSON.parse(localStorage.getItem('kanban')||'null')||{
  Todo:[{id:1,text:'Plan the feature'},{id:2,text:'Write tests'}],
  'In Progress':[{id:3,text:'Implement UI'}],
  Done:[{id:4,text:'Setup project'}]
};
let nextId=Math.max(...Object.values(data).flat().map(c=>c.id),0)+1;

function save(){localStorage.setItem('kanban',JSON.stringify(data));}

const wrap=document.createElement('div');
wrap.style.cssText='display:flex;height:100vh;gap:8px;padding:10px;overflow-x:auto;font-family:'+fontBody;
document.body.appendChild(wrap);

let dragItem=null, dragFrom=null;

function render(){
  wrap.innerHTML='';
  COLS.forEach(col=>{
    const colEl=document.createElement('div');
    colEl.style.cssText='display:flex;flex-direction:column;min-width:180px;flex:1;gap:6px';
    colEl.dataset.col=col;
    colEl.ondragover=e=>{e.preventDefault();colEl.style.background=bgSecondary;};
    colEl.ondragleave=()=>colEl.style.background='transparent';
    colEl.ondrop=e=>{
      e.preventDefault();colEl.style.background='transparent';
      if(!dragItem||!dragFrom) return;
      data[dragFrom]=data[dragFrom].filter(c=>c.id!==dragItem.id);
      data[col].push(dragItem); dragItem=null; dragFrom=null;
      save(); render();
    };

    const header=document.createElement('div');
    header.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:4px 2px';
    const title=document.createElement('span');
    title.textContent=col+' ('+data[col].length+')';
    title.style.cssText='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:'+textSecondary;
    const addBtn=document.createElement('button');
    addBtn.textContent='+';
    addBtn.style.cssText='background:none;border:none;cursor:pointer;font-size:16px;color:'+textSecondary+';padding:0 4px;line-height:1';
    addBtn.onclick=()=>{
      const text=window.prompt('New card:'); if(!text) return;
      data[col].push({id:nextId++,text}); save(); render();
    };
    header.append(title,addBtn);
    colEl.appendChild(header);

    data[col].forEach(card=>{
      const cardEl=document.createElement('div');
      cardEl.draggable=true;
      cardEl.style.cssText='background:'+bgSecondary+';border:1px solid '+borderPrimary+';border-radius:8px;padding:8px 10px;font-size:12px;color:'+textPrimary+';cursor:grab;line-height:1.4;position:relative;user-select:none';
      cardEl.textContent=card.text;
      const del=document.createElement('button');
      del.textContent='×';
      del.style.cssText='position:absolute;top:4px;right:6px;background:none;border:none;cursor:pointer;color:'+textSecondary+';font-size:14px;opacity:0;transition:.1s;padding:0;line-height:1';
      cardEl.onmouseover=()=>del.style.opacity='1';
      cardEl.onmouseout=()=>del.style.opacity='0';
      del.onclick=e=>{e.stopPropagation();data[col]=data[col].filter(c=>c.id!==card.id);save();render();};
      cardEl.appendChild(del);
      cardEl.ondragstart=()=>{dragItem=card;dragFrom=col;setTimeout(()=>cardEl.style.opacity='.4',0);};
      cardEl.ondragend=()=>cardEl.style.opacity='1';
      colEl.appendChild(cardEl);
    });
    wrap.appendChild(colEl);
  });
}
render();