const data = [['','',''],['','',''],['','','']];
const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh;overflow:hidden';

const scrollArea = document.createElement('div');
scrollArea.style.cssText = 'flex:1;overflow:auto';

const table = document.createElement('table');
table.style.cssText = 'border-collapse:collapse;width:100%';

function renderTable() {
  table.innerHTML = '';
  data.forEach((row, r) => {
    const tr = document.createElement('tr');
    row.forEach((cell, c) => {
      const td = document.createElement('td');
      td.style.border = '1px solid var(--border-primary)';
      const inp = document.createElement('input');
      inp.value = cell;
      inp.style.cssText = 'width:100%;border:none;outline:none;padding:5px 8px;background:transparent;color:var(--text-primary);font-size:12px';
      inp.oninput = (e) => { data[r][c] = e.target.value; };
      td.appendChild(inp);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
}
renderTable();
scrollArea.appendChild(table);

const actions = document.createElement('div');
actions.style.cssText = 'padding:4px 6px;border-top:1px solid var(--border-primary);display:flex;gap:4px';
['+ Row','+ Col'].forEach((label, i) => {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = 'padding:2px 8px;border:1px solid var(--border-primary);border-radius:4px;background:var(--bg-secondary);color:var(--text-secondary);cursor:pointer;font-size:11px';
  btn.onclick = () => {
    if (i === 0) data.push(Array(data[0].length).fill(''));
    else data.forEach(r => r.push(''));
    renderTable();
  };
  actions.appendChild(btn);
});
wrap.append(scrollArea, actions);
document.body.appendChild(wrap);