const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const today = new Date();
let view = {year:today.getFullYear(), month:today.getMonth()};
let selected = null;

const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;padding:10px;gap:8px;height:100vh';
document.body.appendChild(wrap);

function render() {
  wrap.innerHTML = '';
  const {year, month} = view;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
  const prev = document.createElement('button'); prev.textContent = '‹';
  prev.style.cssText = 'background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-secondary);padding:2px 6px;border-radius:4px';
  prev.onmouseover = () => prev.style.background = 'var(--bg-tertiary)';
  prev.onmouseout  = () => prev.style.background = '';
  prev.onclick = () => {
    if (view.month === 0) { view = {year:view.year-1, month:11}; }
    else { view = {...view, month:view.month-1}; }
    render();
  };
  const next = document.createElement('button'); next.textContent = '›';
  next.style.cssText = prev.style.cssText;
  next.onmouseover = () => next.style.background = 'var(--bg-tertiary)';
  next.onmouseout  = () => next.style.background = '';
  next.onclick = () => {
    if (view.month === 11) { view = {year:view.year+1, month:0}; }
    else { view = {...view, month:view.month+1}; }
    render();
  };
  const title = document.createElement('span');
  title.textContent = MONTHS[month] + ' ' + year;
  title.style.cssText = 'font-size:12px;font-weight:600;font-family:monospace;color:var(--text-primary)';
  header.append(prev, title, next);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:2px';
  DOW.forEach(d => {
    const el = document.createElement('span');
    el.textContent = d;
    el.style.cssText = 'text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-tertiary);padding:2px 0 4px';
    grid.appendChild(el);
  });
  for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement('span'));
  for (let day = 1; day <= daysInMonth; day++) {
    const key = year+'-'+month+'-'+day;
    const isToday = year===today.getFullYear() && month===today.getMonth() && day===today.getDate();
    const isSel   = selected === key;
    const btn = document.createElement('button');
    btn.textContent = day;
    btn.style.cssText = 'aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:11px;font-family:monospace;border:none;border-radius:50%;cursor:pointer;transition:background .12s;'
      + (isSel ? 'background:var(--accent-blue);color:#fff;' : isToday ? 'color:var(--accent-blue);font-weight:700;background:transparent;' : 'background:transparent;color:var(--text-secondary);');
    btn.onmouseover = () => { if (!isSel) btn.style.background = 'var(--bg-tertiary)'; };
    btn.onmouseout  = () => { if (!isSel) btn.style.background = isToday ? 'transparent' : 'transparent'; };
    btn.onclick = () => { selected = isSel ? null : key; render(); };
    grid.appendChild(btn);
  }
  wrap.append(header, grid);
}
render();