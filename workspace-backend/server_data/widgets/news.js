const items = [
  {title:'AI models hit new reasoning benchmarks',source:'TechCrunch',time:'2h ago'},
  {title:'Global markets rally on rate cut hopes',source:'Reuters',time:'3h ago'},
  {title:'Open-source LLM outperforms GPT-4 on code tasks',source:'Hacker News',time:'5h ago'},
  {title:'New EU regulation targets foundation models',source:'The Verge',time:'8h ago'},
  {title:'Startup raises $120M to build AI chips',source:'Bloomberg',time:'12h ago'},
];
const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh';
const list = document.createElement('div');
list.style.cssText = 'flex:1;overflow-y:auto';

function renderList() {
  list.innerHTML = '';
  items.forEach(it => {
    const row = document.createElement('div');
    row.style.cssText = 'padding:8px 12px;border-bottom:1px solid var(--border-primary);cursor:default';
    row.onmouseover = () => row.style.background = 'var(--bg-tertiary)';
    row.onmouseout  = () => row.style.background = '';
    const title = document.createElement('div');
    title.textContent = it.title;
    title.style.cssText = 'font-size:12px;font-weight:500;color:var(--text-primary);line-height:1.4';
    const meta = document.createElement('div');
    meta.textContent = it.source + ' · ' + it.time;
    meta.style.cssText = 'font-size:10px;color:var(--text-tertiary);margin-top:2px';
    row.append(title, meta);
    list.appendChild(row);
  });
}
renderList();

const addForm = document.createElement('div');
addForm.style.cssText = 'display:none;flex-direction:column;gap:4px;padding:8px;border-top:1px solid var(--border-primary)';
const titleIn = document.createElement('input'); titleIn.placeholder = 'Headline';
const srcIn   = document.createElement('input'); srcIn.placeholder   = 'Source';
[titleIn, srcIn].forEach(i => {
  i.style.cssText = 'border:1px solid var(--border-primary);border-radius:4px;padding:3px 6px;font-size:11px;background:var(--bg-secondary);color:var(--text-primary);outline:none';
});
const addBtns = document.createElement('div');
addBtns.style.cssText = 'display:flex;gap:4px';
['Add','Cancel'].forEach((t, i) => {
  const btn = document.createElement('button');
  btn.textContent = t;
  btn.style.cssText = 'padding:2px 8px;border:1px solid var(--border-primary);border-radius:4px;background:var(--bg-secondary);color:var(--text-secondary);cursor:pointer;font-size:11px';
  btn.onclick = () => {
    if (i === 0 && titleIn.value.trim()) {
      items.unshift({title:titleIn.value.trim(),source:srcIn.value||'',time:'now'});
      titleIn.value = srcIn.value = '';
      renderList();
    }
    addForm.style.display = 'none';
    footer.style.display = '';
  };
  addBtns.appendChild(btn);
});
addForm.append(titleIn, srcIn, addBtns);

const footer = document.createElement('div');
footer.style.cssText = 'padding:4px 8px;border-top:1px solid var(--border-primary)';
const addBtn = document.createElement('button');
addBtn.textContent = '+ Add story';
addBtn.style.cssText = 'background:none;border:1px solid var(--border-primary);border-radius:4px;padding:2px 10px;font-size:11px;color:var(--text-tertiary);cursor:pointer';
addBtn.onclick = () => { addForm.style.display = 'flex'; footer.style.display = 'none'; };
footer.appendChild(addBtn);

wrap.append(list, addForm, footer);
document.body.appendChild(wrap);