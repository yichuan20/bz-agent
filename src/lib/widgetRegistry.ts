/**
 * Widget registry — each widget is vanilla JS that runs inside a sandboxed iframe.
 * The iframe has access to: document, window, fetch, CSS custom properties (theme vars).
 * Charts use Chart.js loaded from CDN for hover interactions.
 */

export type WidgetKind =
  | 'clock'      | 'editor'      | 'table'
  | 'bar'        | 'pie'         | 'kpi'
  | 'news'       | 'search'      | 'calendar'
  | 'video'      | 'email'       | 'map'
  | 'chat'       | 'videocall'
  // New widgets
  | 'llm-chat'   | 'terminal'    | 'line-chart'
  | 'markdown'   | 'json'        | 'files'
  | 'timer'      | 'weather'     | 'github'
  | 'stock'      | 'kanban'      | 'sticky'
  | 'web-preview'| 'sql'         | 'whiteboard'
  | 'custom';

export type WidgetMeta = {
  author:   string;
  version:  string;
  category: string;
};

export type WidgetDef = {
  kind:        WidgetKind;
  label:       string;
  emoji:       string;
  defaultW:    number;
  defaultH:    number;
  code:        string;
  keywords:    string[];
  description: string;
  meta:        WidgetMeta;
};

// ─── Widget code strings ──────────────────────────────────────────────────────
// Each is self-contained vanilla JS. Theme CSS vars are pre-injected into :root.
// Escape rule: use \\${ inside template literals to avoid TS interpolation.

const CLOCK_CODE = `
const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:8px';
const time = document.createElement('div');
const date = document.createElement('div');
time.style.cssText = 'font-size:28px;font-weight:700;letter-spacing:-0.02em;color:var(--text-primary);font-family:monospace';
date.style.cssText = 'font-size:12px;color:var(--text-secondary)';
wrap.append(time, date);
document.body.appendChild(wrap);
(function tick() {
  const n = new Date();
  time.textContent = n.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  date.textContent = n.toLocaleDateString([], {weekday:'long',year:'numeric',month:'long',day:'numeric'});
  setTimeout(tick, 1000);
})();
`.trim();

const EDITOR_CODE = `
const ta = document.createElement('textarea');
ta.placeholder = 'Start typing…';
ta.style.cssText = 'width:100%;height:100%;border:none;outline:none;resize:none;'
  + 'padding:10px 12px;background:transparent;font-family:monospace;'
  + 'font-size:12px;color:var(--text-primary);line-height:1.6;';
document.body.style.height = '100vh';
document.body.appendChild(ta);
ta.focus();
`.trim();

const TABLE_CODE = `
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
`.trim();

const BAR_CODE = `
const COLORS = ['#1473DF','#3FDC7E','#F59E0B','#FA4B42','#EC4899','#06B6D4','#EAB308'];
const DEFAULT_DATA = [
  {name:'Jan',value:42},{name:'Feb',value:67},{name:'Mar',value:53},
  {name:'Apr',value:88},{name:'May',value:61}
];
// Each row: { id, name, value }  — id comes from Postgres (null for in-memory fallback)
let chartData = [];
let chart, editing = false;

// ── DB helpers (no-op if window.db is unavailable, e.g. in the preview editor) ──
function dbEnsure() {
  return Promise.resolve(!!window.db); // file-based storage needs no schema setup
}
async function dbLoad() {
  if (!window.db) return null;
  const { rows } = await window.db.query({ order: 'sort', dir: 'asc' });
  return rows;
}
async function dbInsert(name, value, sort) {
  if (!window.db) return null;
  const { inserted } = await window.db.insert({ name, value, sort });
  return inserted[0];
}
async function dbUpdate(id, name, value) {
  if (!window.db) return;
  await window.db.update(id, { name, value });
}
async function dbDelete(id) {
  if (!window.db) return;
  await window.db.delete(id);
}

// Read actual resolved CSS var values — Chart.js cannot resolve CSS custom properties itself
const cs = getComputedStyle(document.documentElement);
const colorText   = cs.getPropertyValue('--text-primary').trim()   || '#1C1917';
const colorMuted  = cs.getPropertyValue('--text-secondary').trim() || '#6B6358';
const colorBorder = cs.getPropertyValue('--border-primary').trim() || '#D5CFC0';
const colorBg2    = cs.getPropertyValue('--bg-secondary').trim()   || '#E8E2D7';
const fontFamily  = cs.getPropertyValue('--font-body').trim()      || 'system-ui,sans-serif';

// Subtle grid colour — 15% opacity tint of the border colour
function alphaColor(hex, alpha) {
  const r = parseInt(hex.slice(1,3)||'80',16);
  const g = parseInt(hex.slice(3,5)||'80',16);
  const b = parseInt(hex.slice(5,7)||'80',16);
  return 'rgba('+r+','+g+','+b+','+alpha+')';
}
const gridColor = alphaColor(colorBorder, 0.5);

// Layout
const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh;overflow:hidden';

// Toolbar with toggle button
const toolbar = document.createElement('div');
toolbar.style.cssText = 'display:flex;justify-content:flex-end;padding:6px 10px 0;flex-shrink:0';
const editBtn = document.createElement('button');
editBtn.textContent = 'Edit data';
editBtn.style.cssText = 'background:none;border:1px solid '+colorBorder+';border-radius:4px;padding:2px 10px;font-size:11px;color:'+colorMuted+';cursor:pointer;font-family:'+fontFamily;
toolbar.appendChild(editBtn);

const chartWrap = document.createElement('div');
chartWrap.style.cssText = 'flex:1;min-height:0;padding:4px 12px 10px 8px;position:relative';
const canvas = document.createElement('canvas');
canvas.style.cssText = 'width:100%;height:100%';
chartWrap.appendChild(canvas);

const editArea = document.createElement('div');
editArea.style.cssText = 'display:none;flex:1;overflow-y:auto;flex-direction:column;gap:6px;padding:10px';

wrap.append(toolbar, chartWrap, editArea);
document.body.appendChild(wrap);

function renderEdit() {
  editArea.innerHTML = '';
  chartData.forEach((d, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px';
    const nameI = document.createElement('input');
    nameI.value = d.name; nameI.placeholder = 'Label';
    nameI.style.cssText = 'flex:1;border:1px solid '+colorBorder+';border-radius:4px;padding:4px 8px;font-size:12px;background:'+colorBg2+';color:'+colorText+';font-family:'+fontFamily;
    nameI.onchange = (e) => { chartData[i].name = e.target.value; dbUpdate(d.id, chartData[i].name, chartData[i].value); refreshChart(); };
    const valI = document.createElement('input');
    valI.type = 'number'; valI.value = d.value;
    valI.style.cssText = 'width:70px;border:1px solid '+colorBorder+';border-radius:4px;padding:4px 8px;font-size:12px;background:'+colorBg2+';color:'+colorText+';text-align:right;font-family:'+fontFamily;
    valI.onchange = (e) => { chartData[i].value = +e.target.value; dbUpdate(d.id, chartData[i].name, chartData[i].value); refreshChart(); };
    const rm = document.createElement('button');
    rm.textContent = '×'; rm.style.cssText = 'background:none;border:none;cursor:pointer;color:'+colorMuted+';font-size:16px;padding:0 2px;line-height:1';
    rm.onclick = () => { dbDelete(d.id); chartData.splice(i,1); renderEdit(); refreshChart(); };
    row.append(nameI, valI, rm);
    editArea.appendChild(row);
  });
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Row';
  addBtn.style.cssText = 'padding:3px 10px;border:1px solid '+colorBorder+';border-radius:4px;background:'+colorBg2+';color:'+colorMuted+';cursor:pointer;font-size:11px;align-self:flex-start;font-family:'+fontFamily;
  addBtn.onclick = async () => {
    const sort = chartData.length;
    const rec = await dbInsert('', 0, sort);
    chartData.push({ id: rec ? rec.id : null, name: '', value: 0 });
    renderEdit();
  };
  editArea.appendChild(addBtn);
}

function refreshChart() {
  if (!chart) return;
  chart.data.labels = chartData.map(d => d.name);
  chart.data.datasets[0].data = chartData.map(d => d.value);
  chart.data.datasets[0].backgroundColor = chartData.map((_,i) => COLORS[i%COLORS.length]);
  chart.update();
}

editBtn.onclick = () => {
  editing = !editing;
  editBtn.textContent = editing ? '← Chart' : 'Edit data';
  chartWrap.style.display = editing ? 'none' : '';
  editArea.style.display  = editing ? 'flex'  : 'none';
  if (editing) renderEdit();
};

const s = document.createElement('script');
s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
s.onload = async () => {
  // ── Load data from DB, or seed defaults ──────────────────────────────────
  const hasDb = await dbEnsure();
  if (hasDb) {
    const rows = await dbLoad();
    if (rows && rows.length > 0) {
      chartData = rows.map(r => ({ id: r.id, name: r.name, value: Number(r.value) }));
    } else {
      // First time: seed the DB with default data
      for (let i = 0; i < DEFAULT_DATA.length; i++) {
        const d = DEFAULT_DATA[i];
        const rec = await dbInsert(d.name, d.value, i);
        chartData.push({ id: rec ? rec.id : null, name: d.name, value: d.value });
      }
    }
  } else {
    // No DB (preview editor) — use hardcoded defaults
    chartData = DEFAULT_DATA.map(d => ({ id: null, name: d.name, value: d.value }));
  }

  // Apply resolved colours as Chart.js defaults
  Chart.defaults.color           = colorMuted;
  Chart.defaults.borderColor     = gridColor;
  Chart.defaults.font.family     = fontFamily;
  Chart.defaults.font.size       = 12;

  chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: chartData.map(d => d.name),
      datasets: [{
        data: chartData.map(d => d.value),
        backgroundColor: chartData.map((_,i) => COLORS[i%COLORS.length]),
        borderRadius: 5,
        borderSkipped: false,
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 8, right: 4, bottom: 0, left: 0 } },
      plugins: { legend: { display: false }, tooltip: { titleFont: { size: 12 }, bodyFont: { size: 12 } } },
      scales: {
        x: {
          grid: { color: gridColor, lineWidth: 1 },
          border: { display: false },
          ticks: { color: colorMuted, font: { size: 12, family: fontFamily }, maxRotation: 0 },
        },
        y: {
          grid: { color: gridColor, lineWidth: 1 },
          border: { display: false },
          ticks: { color: colorMuted, font: { size: 12, family: fontFamily }, padding: 6 },
          beginAtZero: true,
        }
      }
    }
  });
};
document.head.appendChild(s);
`.trim();

const PIE_CODE = `
const COLORS = ['#1473DF','#3FDC7E','#F59E0B','#FA4B42','#EC4899','#06B6D4'];
const DEFAULT_DATA = [{name:'Alpha',value:35},{name:'Beta',value:25},{name:'Gamma',value:20},{name:'Delta',value:20}];
let chartData = [];
let chart, editing = false;

// ── DB helpers (fall back to in-memory if no canvasId, e.g. preview editor) ──
function dbLoad() { return window.db ? window.db.query({order:'sort',dir:'asc'}) : Promise.resolve({rows:[]}); }
function dbInsert(name, value, sort) { return window.db ? window.db.insert({name, value, sort}) : Promise.resolve({inserted:[{id:null,name,value}]}); }
function dbUpdate(id, name, value) { if (window.db && id != null) window.db.update(id, {name, value}); }
function dbDelete(id) { if (window.db && id != null) window.db.delete(id); }

// Resolve CSS vars to actual values — Chart.js cannot read CSS custom properties
const cs = getComputedStyle(document.documentElement);
const colorText   = cs.getPropertyValue('--text-primary').trim()   || '#1C1917';
const colorMuted  = cs.getPropertyValue('--text-secondary').trim() || '#6B6358';
const colorBorder = cs.getPropertyValue('--border-primary').trim() || '#D5CFC0';
const colorBg2    = cs.getPropertyValue('--bg-secondary').trim()   || '#E8E2D7';
const colorBg     = cs.getPropertyValue('--bg-primary').trim()     || '#F7F3EC';
const fontFamily  = cs.getPropertyValue('--font-body').trim()      || 'system-ui,sans-serif';

// Layout
const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh;overflow:hidden';

const toolbar = document.createElement('div');
toolbar.style.cssText = 'display:flex;justify-content:flex-end;padding:6px 10px 0;flex-shrink:0';
const editBtn = document.createElement('button');
editBtn.textContent = 'Edit data';
editBtn.style.cssText = 'background:none;border:1px solid '+colorBorder+';border-radius:4px;padding:2px 10px;font-size:11px;color:'+colorMuted+';cursor:pointer;font-family:'+fontFamily;
toolbar.appendChild(editBtn);

const chartWrap = document.createElement('div');
chartWrap.style.cssText = 'flex:1;min-height:0;padding:4px 8px 8px;position:relative';
const canvas = document.createElement('canvas');
canvas.style.cssText = 'width:100%;height:100%';
chartWrap.appendChild(canvas);

const editArea = document.createElement('div');
editArea.style.cssText = 'display:none;flex:1;overflow-y:auto;flex-direction:column;gap:6px;padding:10px';

wrap.append(toolbar, chartWrap, editArea);
document.body.appendChild(wrap);

function renderEdit() {
  editArea.innerHTML = '';
  chartData.forEach((d, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px';
    const dot = document.createElement('span');
    dot.style.cssText = 'width:10px;height:10px;border-radius:50%;flex-shrink:0;background:'+COLORS[i%COLORS.length];
    const nameI = document.createElement('input');
    nameI.value = d.name; nameI.placeholder = 'Label';
    nameI.style.cssText = 'flex:1;border:1px solid '+colorBorder+';border-radius:4px;padding:4px 8px;font-size:12px;background:'+colorBg2+';color:'+colorText+';font-family:'+fontFamily;
    nameI.oninput  = (e) => { chartData[i].name = e.target.value; refreshChart(); };
    nameI.onchange = () => { dbUpdate(d.id, chartData[i].name, chartData[i].value); };
    const valI = document.createElement('input');
    valI.type = 'number'; valI.value = d.value;
    valI.style.cssText = 'width:70px;border:1px solid '+colorBorder+';border-radius:4px;padding:4px 8px;font-size:12px;background:'+colorBg2+';color:'+colorText+';text-align:right;font-family:'+fontFamily;
    valI.oninput  = (e) => { chartData[i].value = +e.target.value; refreshChart(); };
    valI.onchange = () => { dbUpdate(d.id, chartData[i].name, chartData[i].value); };
    const rm = document.createElement('button');
    rm.textContent = '×'; rm.style.cssText = 'background:none;border:none;cursor:pointer;color:'+colorMuted+';font-size:16px;padding:0 2px;line-height:1';
    rm.onclick = () => { dbDelete(d.id); chartData.splice(i,1); renderEdit(); refreshChart(); };
    row.append(dot, nameI, valI, rm);
    editArea.appendChild(row);
  });
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Slice';
  addBtn.style.cssText = 'padding:3px 10px;border:1px solid '+colorBorder+';border-radius:4px;background:'+colorBg2+';color:'+colorMuted+';cursor:pointer;font-size:11px;align-self:flex-start;font-family:'+fontFamily;
  addBtn.onclick = async () => {
    const sort = chartData.length;
    const res = await dbInsert('', 0, sort);
    chartData.push({id: res.inserted?.[0]?.id ?? null, name:'', value:0});
    renderEdit(); refreshChart();
  };
  editArea.appendChild(addBtn);
}

function refreshChart() {
  if (!chart) return;
  chart.data.labels = chartData.map(d => d.name);
  chart.data.datasets[0].data = chartData.map(d => d.value);
  chart.update();
}

editBtn.onclick = () => {
  editing = !editing;
  editBtn.textContent = editing ? '← Chart' : 'Edit data';
  chartWrap.style.display = editing ? 'none' : '';
  editArea.style.display  = editing ? 'flex'  : 'none';
  if (editing) renderEdit();
};

const s = document.createElement('script');
s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
s.onload = async () => {
  // Load from DB or seed defaults on first use
  const { rows } = await dbLoad();
  if (rows && rows.length > 0) {
    chartData = rows.map(r => ({id: r.id, name: r.name, value: Number(r.value)}));
  } else {
    for (let i = 0; i < DEFAULT_DATA.length; i++) {
      const d = DEFAULT_DATA[i];
      const res = await dbInsert(d.name, d.value, i);
      chartData.push({id: res.inserted?.[0]?.id ?? null, name: d.name, value: d.value});
    }
  }

  Chart.defaults.color       = colorMuted;
  Chart.defaults.font.family = fontFamily;
  Chart.defaults.font.size   = 12;

  chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: chartData.map(d => d.name),
      datasets: [{
        data: chartData.map(d => d.value),
        backgroundColor: COLORS,
        borderWidth: 3,
        borderColor: colorBg,    // matches the card background for clean slice separation
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '52%',
      layout: { padding: { top: 4, bottom: 4 } },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color:     colorText,
            font:      { size: 12, family: fontFamily },
            boxWidth:  12,
            boxHeight: 12,
            padding:   14,
            usePointStyle: true,
            pointStyle: 'circle',
          }
        },
        tooltip: {
          titleFont: { size: 12, family: fontFamily },
          bodyFont:  { size: 12, family: fontFamily },
        }
      }
    }
  });
};
document.head.appendChild(s);
`.trim();

const KPI_CODE = `
const kpis = [
  {label:'Revenue',value:'$48,200',change:'+12%',up:true},
  {label:'Users',value:'3,841',change:'+7%',up:true},
  {label:'Churn',value:'2.4%',change:'-0.3%',up:false},
  {label:'Latency',value:'142 ms',change:'+8ms',up:false},
];
const grid = document.createElement('div');
grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px;height:100vh;align-content:start';

kpis.forEach(k => {
  const card = document.createElement('div');
  card.style.cssText = 'border:1px solid var(--border-primary);border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:2px;background:var(--bg-secondary)';

  const label = document.createElement('input');
  label.value = k.label;
  label.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-tertiary);background:none;border:none;outline:none;width:100%';

  const value = document.createElement('input');
  value.value = k.value;
  value.style.cssText = 'font-size:20px;font-weight:700;color:var(--text-primary);background:none;border:none;outline:none;width:100%;font-family:monospace';

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;align-items:center;gap:4px';
  const change = document.createElement('input');
  change.value = k.change;
  change.style.cssText = 'font-size:11px;font-weight:600;background:none;border:none;outline:none;width:60px;color:'+(k.up?'var(--accent-green)':'var(--accent-red)');
  const arrow = document.createElement('button');
  arrow.textContent = k.up ? '↑' : '↓';
  arrow.style.cssText = 'background:none;border:none;cursor:pointer;font-size:13px;color:var(--text-tertiary);padding:0';
  let isUp = k.up;
  arrow.onclick = () => {
    isUp = !isUp;
    arrow.textContent = isUp ? '↑' : '↓';
    change.style.color = isUp ? 'var(--accent-green)' : 'var(--accent-red)';
  };
  footer.append(change, arrow);
  card.append(label, value, footer);
  grid.appendChild(card);
});
document.body.appendChild(grid);
`.trim();

const NEWS_CODE = `
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
`.trim();

const SEARCH_CODE = `
const HTTP_BASE = window.__agentHttpBase__ || 'http://localhost:18789';
let apiKey = localStorage.getItem('serpapi-key') || '';

const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh;overflow:hidden';

const bar = document.createElement('div');
bar.style.cssText = 'display:flex;gap:6px;align-items:center;padding:8px;border-bottom:1px solid var(--border-primary)';

const inp = document.createElement('input');
inp.value = 'boltzbit'; inp.placeholder = 'Search…';
inp.style.cssText = 'flex:1;border:1px solid var(--border-primary);border-radius:6px;padding:6px 10px;font-size:13px;background:var(--bg-secondary);color:var(--text-primary);outline:none';

const searchBtn = document.createElement('button');
searchBtn.textContent = '→';
searchBtn.style.cssText = 'width:32px;height:32px;border-radius:6px;border:none;background:var(--accent-blue);color:#fff;cursor:pointer;font-size:16px;flex-shrink:0';

const settBtn = document.createElement('button');
settBtn.textContent = '⚙️';
settBtn.style.cssText = 'width:32px;height:32px;border:1px solid var(--border-primary);border-radius:6px;background:var(--bg-secondary);cursor:pointer;font-size:14px;flex-shrink:0';

bar.append(inp, searchBtn, settBtn);

const settPanel = document.createElement('div');
settPanel.style.cssText = 'display:none;flex-direction:column;gap:4px;padding:8px;border-bottom:1px solid var(--border-primary);background:var(--bg-secondary)';
const keyInp = document.createElement('input');
keyInp.type = 'password'; keyInp.placeholder = 'SerpAPI key'; keyInp.value = apiKey;
keyInp.style.cssText = 'border:1px solid var(--border-primary);border-radius:4px;padding:5px 8px;font-size:12px;background:var(--bg-primary);color:var(--text-primary);outline:none';
keyInp.oninput = (e) => { apiKey = e.target.value; localStorage.setItem('serpapi-key', apiKey); };
const hint = document.createElement('a');
hint.href = 'https://serpapi.com/dashboard'; hint.target = '_blank';
hint.textContent = 'Get key from serpapi.com →';
hint.style.cssText = 'font-size:11px;color:var(--accent-blue)';
settPanel.append(keyInp, hint);

settBtn.onclick = () => { settPanel.style.display = settPanel.style.display === 'none' ? 'flex' : 'none'; };

const results = document.createElement('div');
results.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column';

const noKey = document.createElement('div');
noKey.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-tertiary);font-size:13px;text-align:center;padding:16px';
noKey.innerHTML = '<div style="font-size:28px">🔍</div><p>Add a <strong>SerpAPI key</strong> via ⚙️ to see inline results.</p>';

wrap.append(bar, settPanel, results);
document.body.appendChild(wrap);

async function doSearch() {
  const q = inp.value.trim();
  if (!q) return;
  if (!apiKey) { results.innerHTML = ''; results.appendChild(noKey); return; }
  results.innerHTML = '<div style="padding:16px;color:var(--text-tertiary);font-size:13px">Searching…</div>';
  try {
    const res = await fetch(HTTP_BASE + '/search?q=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(apiKey));
    const d = await res.json();
    if (!res.ok || d.error) { results.innerHTML = '<div style="padding:8px 12px;color:var(--accent-red);font-size:12px">' + (d.error||'Error') + '</div>'; return; }
    results.innerHTML = '';
    if (!d.results || !d.results.length) { results.innerHTML = '<div style="padding:16px;color:var(--text-tertiary)">No results</div>'; return; }
    d.results.forEach(r => {
      const a = document.createElement('a');
      a.href = r.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.style.cssText = 'display:flex;flex-direction:column;gap:2px;padding:9px 12px;border-bottom:1px solid var(--border-primary);text-decoration:none';
      a.onmouseover = () => a.style.background = 'var(--bg-secondary)';
      a.onmouseout  = () => a.style.background = '';
      const meta = document.createElement('div');
      meta.style.cssText = 'display:flex;align-items:center;gap:5px';
      const img = document.createElement('img');
      img.src = r.favicon || ('https://www.google.com/s2/favicons?domain=' + r.displayLink + '&sz=16');
      img.style.cssText = 'width:14px;height:14px;border-radius:2px;flex-shrink:0';
      img.onerror = () => img.style.display = 'none';
      const domain = document.createElement('span');
      domain.textContent = r.displayLink;
      domain.style.cssText = 'font-size:10px;color:var(--text-tertiary);font-family:monospace';
      meta.append(img, domain);
      const title = document.createElement('div');
      title.textContent = r.title;
      title.style.cssText = 'font-size:13px;font-weight:600;color:var(--accent-blue);line-height:1.3';
      const snip = document.createElement('div');
      snip.textContent = r.snippet || '';
      snip.style.cssText = 'font-size:11px;color:var(--text-secondary);line-height:1.5';
      a.append(meta, title, snip);
      results.appendChild(a);
    });
  } catch(e) { results.innerHTML = '<div style="padding:8px 12px;color:var(--accent-red);font-size:12px">' + e.message + '</div>'; }
}

searchBtn.onclick = doSearch;
inp.onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };

if (!apiKey) results.appendChild(noKey);
else doSearch();
`.trim();

const CALENDAR_CODE = `
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
`.trim();

const VIDEO_CODE = `
const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh';

function showInput() {
  wrap.innerHTML = '';
  const inner = document.createElement('div');
  inner.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px';
  const hint = document.createElement('p');
  hint.textContent = 'Paste a YouTube or Vimeo URL';
  hint.style.cssText = 'font-size:12px;color:var(--text-secondary);font-weight:600';
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:6px;width:100%';
  const inp = document.createElement('input');
  inp.placeholder = 'https://youtube.com/watch?v=…';
  inp.style.cssText = 'flex:1;border:1px solid var(--border-primary);border-radius:6px;padding:6px 10px;font-size:12px;background:var(--bg-secondary);color:var(--text-primary);outline:none';
  const btn = document.createElement('button');
  btn.textContent = '→';
  btn.style.cssText = 'width:32px;height:32px;border-radius:6px;border:none;background:var(--accent-blue);color:#fff;cursor:pointer;font-size:16px;flex-shrink:0';
  bar.append(inp, btn);
  const err = document.createElement('p');
  err.style.cssText = 'font-size:11px;color:var(--accent-red);display:none';
  inner.append(hint, bar, err);
  wrap.appendChild(inner);
  function load() {
    const url = inp.value.trim();
    let embed = null;
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtube.com')) { const id = u.searchParams.get('v'); if (id) embed = 'https://www.youtube.com/embed/'+id; }
      else if (u.hostname === 'youtu.be') { const id = u.pathname.slice(1); if (id) embed = 'https://www.youtube.com/embed/'+id; }
      else if (u.hostname.includes('vimeo.com')) { const id = u.pathname.split('/').filter(Boolean)[0]; if (id) embed = 'https://player.vimeo.com/video/'+id; }
      else embed = url;
    } catch(e) {}
    if (embed) showEmbed(embed);
    else { err.textContent = "Couldn’t parse that URL."; err.style.display = ''; }
  }
  btn.onclick = load;
  inp.onkeydown = (e) => { if (e.key === 'Enter') load(); };
}

function showEmbed(src) {
  wrap.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.allow = 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.style.cssText = 'flex:1;border:none;min-height:0;width:100%';
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:4px 8px;border-top:1px solid var(--border-primary)';
  const back = document.createElement('button');
  back.textContent = 'Change URL';
  back.style.cssText = 'background:none;border:1px solid var(--border-primary);border-radius:4px;padding:2px 10px;font-size:11px;color:var(--text-tertiary);cursor:pointer';
  back.onclick = showInput;
  footer.appendChild(back);
  wrap.append(iframe, footer);
}
document.body.appendChild(wrap);
showInput();
`.trim();

const EMAIL_CODE = `
const PROVIDERS = [
  {label:'Gmail',    compose:(to,sub,body) => 'https://mail.google.com/mail/?view=cm&fs=1&to='+enc(to)+'&su='+enc(sub)+'&body='+enc(body)},
  {label:'Outlook',  compose:(to,sub,body) => 'https://outlook.live.com/mail/0/deeplink/compose?to='+enc(to)+'&subject='+enc(sub)+'&body='+enc(body)},
  {label:'Yahoo',    compose:(to,sub,body) => 'https://compose.mail.yahoo.com/?to='+enc(to)+'&subject='+enc(sub)+'&body='+enc(body)},
  {label:'ProtonMail',compose:(to,sub,body)=> 'https://mail.proton.me/u/0/inbox#compose&to='+enc(to)+'&subject='+enc(sub)+'&body='+enc(body)},
];
function enc(s) { return encodeURIComponent(s); }
let provider = 0;

const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh';

const tabs = document.createElement('div');
tabs.style.cssText = 'display:flex;border-bottom:1px solid var(--border-primary)';
PROVIDERS.forEach((p, i) => {
  const btn = document.createElement('button');
  btn.textContent = p.label;
  btn.dataset.idx = i;
  btn.style.cssText = 'flex:1;padding:6px 4px;border:none;background:transparent;font-size:10px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-tertiary);transition:.12s';
  btn.onclick = () => { provider = i; updateTabs(); };
  tabs.appendChild(btn);
});

function updateTabs() {
  Array.from(tabs.children).forEach((btn, i) => {
    btn.style.borderBottomColor = i===provider ? 'var(--accent-blue)' : 'transparent';
    btn.style.color = i===provider ? 'var(--accent-blue)' : 'var(--text-tertiary)';
  });
}
updateTabs();

const form = document.createElement('div');
form.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:8px;padding:10px;overflow-y:auto';

function field(label, type='text') {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  lbl.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-tertiary)';
  const inp = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  if (type !== 'textarea') inp.type = type;
  else { inp.rows = 5; }
  inp.style.cssText = 'border:1px solid var(--border-primary);border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit;background:var(--bg-secondary);color:var(--text-primary);outline:none;resize:none;width:100%;box-sizing:border-box';
  wrap.append(lbl, inp);
  return {wrap, inp};
}

const {wrap:toW,   inp:toI}   = field('To', 'email');
const {wrap:subW,  inp:subI}  = field('Subject');
const {wrap:bodyW, inp:bodyI} = field('Message', 'textarea');
bodyI.style.flex = '1';

const sendBtn = document.createElement('button');
sendBtn.textContent = 'Open in Gmail →';
sendBtn.style.cssText = 'padding:7px 14px;border-radius:6px;border:none;background:var(--accent-blue);color:#fff;font-size:12px;font-weight:600;cursor:pointer;transition:.15s';
sendBtn.onclick = () => {
  const p = PROVIDERS[provider];
  sendBtn.textContent = '✓ Opened in '+p.label;
  sendBtn.style.background = 'var(--accent-green)';
  window.open(p.compose(toI.value, subI.value, bodyI.value), '_blank', 'noopener');
  setTimeout(() => { sendBtn.textContent = 'Open in '+p.label+' →'; sendBtn.style.background = 'var(--accent-blue)'; }, 3000);
};

function updateSendLabel() { sendBtn.textContent = 'Open in '+PROVIDERS[provider].label+' →'; }
tabs.addEventListener('click', updateSendLabel);

form.append(toW, subW, bodyW, sendBtn);
wrap.append(tabs, form);
document.body.appendChild(wrap);
`.trim();

const MAP_CODE = `
const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh';

const bar = document.createElement('div');
bar.style.cssText = 'display:flex;gap:4px;align-items:center;padding:8px;border-bottom:1px solid var(--border-primary)';

const inp = document.createElement('input');
inp.placeholder = 'Search Google Maps…';
inp.style.cssText = 'flex:1;border:1px solid var(--border-primary);border-radius:6px;padding:6px 10px;font-size:13px;background:var(--bg-secondary);color:var(--text-primary);outline:none';

const searchBtn = document.createElement('button');
searchBtn.textContent = '→';
searchBtn.style.cssText = 'width:32px;height:32px;border-radius:6px;border:none;background:var(--accent-blue);color:#fff;cursor:pointer;font-size:16px;flex-shrink:0';

const keyBtn = document.createElement('button');
keyBtn.textContent = '🔑';
keyBtn.style.cssText = 'width:32px;height:32px;border:1px solid var(--border-primary);border-radius:6px;background:var(--bg-secondary);cursor:pointer;font-size:14px;flex-shrink:0';

bar.append(inp, searchBtn, keyBtn);

const keyPanel = document.createElement('div');
keyPanel.style.cssText = 'display:none;flex-direction:column;gap:4px;padding:8px;border-bottom:1px solid var(--border-primary);background:var(--bg-secondary)';
const cxInp = document.createElement('input');
cxInp.placeholder = 'Google Maps API key (optional)';
cxInp.type = 'password';
cxInp.value = localStorage.getItem('maps-api-key')||'';
cxInp.style.cssText = 'border:1px solid var(--border-primary);border-radius:4px;padding:5px 8px;font-size:12px;background:var(--bg-primary);color:var(--text-primary);outline:none';
cxInp.oninput = (e) => localStorage.setItem('maps-api-key', e.target.value);
keyPanel.appendChild(cxInp);
keyBtn.onclick = () => { keyPanel.style.display = keyPanel.style.display==='none'?'flex':'none'; };

const content = document.createElement('div');
content.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0';
const empty = document.createElement('div');
empty.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-tertiary);font-size:13px;text-align:center;padding:16px';
empty.innerHTML = '<div style="font-size:32px">🗺️</div><p>Search a location above</p>';
content.appendChild(empty);

let currentIframe = null;
function doSearch() {
  const q = inp.value.trim();
  if (!q) return;
  const key = cxInp.value.trim();
  const src = key
    ? 'https://www.google.com/maps/embed/v1/search?q='+encodeURIComponent(q)+'&key='+key
    : 'https://maps.google.com/maps?q='+encodeURIComponent(q)+'&output=embed&hl=en';
  content.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.style.cssText = 'flex:1;border:none;width:100%;min-height:0;height:100%';
  iframe.referrerPolicy = 'no-referrer-when-downgrade';
  iframe.allowFullscreen = true;
  content.appendChild(iframe);
}
searchBtn.onclick = doSearch;
inp.onkeydown = (e) => { if (e.key==='Enter') doSearch(); };

wrap.append(bar, keyPanel, content);
document.body.appendChild(wrap);
`.trim();

const CHAT_CODE = `
function uid() { return Math.random().toString(36).slice(2); }
function now() { return new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
const messages = [{id:uid(),text:'Hello! Type a message below.',from:'them',time:now()}];

const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh';
const msgArea = document.createElement('div');
msgArea.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:10px';

function renderMessages() {
  msgArea.innerHTML = '';
  messages.forEach(m => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:2px;max-width:80%;align-self:'+(m.from==='me'?'flex-end':'flex-start')
      +';align-items:'+(m.from==='me'?'flex-end':'flex-start');
    const bubble = document.createElement('div');
    bubble.textContent = m.text;
    bubble.style.cssText = 'padding:6px 10px;border-radius:12px;font-size:12px;line-height:1.5;'
      +(m.from==='me'?'background:var(--accent-blue);color:#fff;border-bottom-right-radius:3px':'background:var(--bg-tertiary);color:var(--text-primary);border-bottom-left-radius:3px');
    const time = document.createElement('div');
    time.textContent = m.time;
    time.style.cssText = 'font-size:9px;color:var(--text-tertiary);padding:0 4px';
    row.append(bubble, time);
    msgArea.appendChild(row);
  });
  msgArea.scrollTop = msgArea.scrollHeight;
}
renderMessages();

const inputRow = document.createElement('div');
inputRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px;border-top:1px solid var(--border-primary)';
const inp = document.createElement('input');
inp.placeholder = 'Type a message…';
inp.style.cssText = 'flex:1;border:1px solid var(--border-primary);border-radius:6px;padding:6px 10px;font-size:12px;background:var(--bg-secondary);color:var(--text-primary);outline:none';
const btn = document.createElement('button');
btn.textContent = '→';
btn.style.cssText = 'width:32px;height:32px;border-radius:6px;border:none;background:var(--accent-blue);color:#fff;cursor:pointer;font-size:16px;flex-shrink:0';

function send() {
  const text = inp.value.trim();
  if (!text) return;
  messages.push({id:uid(),text,from:'me',time:now()});
  inp.value = '';
  renderMessages();
}
btn.onclick = send;
inp.onkeydown = (e) => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

inputRow.append(inp, btn);
wrap.append(msgArea, inputRow);
document.body.appendChild(wrap);
`.trim();

const VIDEOCALL_CODE = `
const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh';

function showSetup() {
  wrap.innerHTML = '';
  const inner = document.createElement('div');
  inner.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;text-align:center';
  const icon = document.createElement('div'); icon.textContent = '📹'; icon.style.fontSize='36px';
  const title = document.createElement('p'); title.textContent = 'Video Call via Jitsi Meet';
  title.style.cssText = 'font-size:14px;font-weight:600;color:var(--text-primary)';
  const sub = document.createElement('p'); sub.textContent = 'Free · No account · Encrypted';
  sub.style.cssText = 'font-size:12px;color:var(--text-secondary)';
  const bar = document.createElement('div'); bar.style.cssText='display:flex;gap:6px;width:100%';
  const inp = document.createElement('input');
  inp.placeholder = 'Room name (share to invite)';
  inp.style.cssText = 'flex:1;border:1px solid var(--border-primary);border-radius:6px;padding:6px 10px;font-size:12px;background:var(--bg-secondary);color:var(--text-primary);outline:none';
  const btn = document.createElement('button');
  btn.textContent = '→';
  btn.style.cssText = 'width:32px;height:32px;border-radius:6px;border:none;background:var(--accent-blue);color:#fff;cursor:pointer;font-size:16px;flex-shrink:0';
  bar.append(inp, btn);
  const hint = document.createElement('p'); hint.textContent = 'Leave blank to generate a random room';
  hint.style.cssText = 'font-size:10px;color:var(--text-tertiary)';
  inner.append(icon, title, sub, bar, hint);
  wrap.appendChild(inner);
  function join() {
    const r = inp.value.trim() || 'canvas-'+Math.random().toString(36).slice(2,8);
    showCall(r);
  }
  btn.onclick = join;
  inp.onkeydown = (e) => { if (e.key==='Enter') join(); };
}

function showCall(room) {
  wrap.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = 'https://meet.jit.si/'+encodeURIComponent(room);
  iframe.allow = 'camera;microphone;fullscreen;display-capture;autoplay';
  iframe.style.cssText = 'flex:1;border:none;min-height:0;width:100%';
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-top:1px solid var(--border-primary)';
  const label = document.createElement('span');
  label.style.cssText = 'font-size:11px;color:var(--text-secondary);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  label.textContent = 'Room: '+room;
  const leave = document.createElement('button');
  leave.textContent = 'Leave';
  leave.style.cssText = 'background:none;border:1px solid var(--border-primary);border-radius:4px;padding:2px 10px;font-size:11px;color:var(--text-tertiary);cursor:pointer;flex-shrink:0';
  leave.onclick = showSetup;
  footer.append(label, leave);
  wrap.append(iframe, footer);
}

document.body.appendChild(wrap);
showSetup();
`.trim();

const CUSTOM_CODE = `
// Write your widget here.
// You have access to: document, window, fetch, setTimeout, etc.
// CSS variables from the current theme are pre-injected into :root:
//   --bg-primary, --bg-secondary, --bg-tertiary
//   --text-primary, --text-secondary, --text-tertiary
//   --border-primary, --accent-blue, --accent-green, etc.
//
// Example: a live clock
const el = document.createElement('div');
el.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;'
  + 'font-size:32px;font-weight:700;font-family:monospace;color:var(--text-primary)';
document.body.appendChild(el);
(function tick() {
  el.textContent = new Date().toLocaleTimeString();
  setTimeout(tick, 1000);
})();
`.trim();

const B = (category: string) => ({ author: 'builtin', version: '1.0.0', category });

// ─────────────────────────────── NEW WIDGETS ─────────────────────────────────

const LLM_CHAT_CODE = `
const H = window.__agentHttpBase__ || 'http://localhost:18789';
const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim() || '#1C1917';
const textSecondary = cs.getPropertyValue('--text-secondary').trim() || '#6B6358';
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim() || '#E8E2D7';
const bgTertiary = cs.getPropertyValue('--bg-tertiary').trim() || '#DDD7CB';
const borderPrimary = cs.getPropertyValue('--border-primary').trim() || '#D5CFC0';
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const fontBody = cs.getPropertyValue('--font-body').trim() || 'system-ui';

let model = 'gpt-4o-mini';
const messages = [];

const wrap = document.createElement('div');
wrap.style.cssText = 'display:flex;flex-direction:column;height:100vh;overflow:hidden';

const toolbar = document.createElement('div');
toolbar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;
const modelSel = document.createElement('select');
modelSel.style.cssText = 'flex:1;border:1px solid '+borderPrimary+';border-radius:6px;padding:3px 6px;font-size:11px;background:'+bgTertiary+';color:'+textPrimary+';font-family:'+fontBody;
['gpt-4o-mini','gpt-4o','gpt-4-turbo','claude-3-5-haiku-20241022','claude-3-5-sonnet-20241022'].forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m;modelSel.appendChild(o);});
modelSel.onchange=e=>{ model=e.target.value; };
const clearBtn = document.createElement('button');
clearBtn.textContent='Clear';
clearBtn.style.cssText='padding:3px 8px;border:1px solid '+borderPrimary+';border-radius:6px;background:transparent;font-size:11px;color:'+textSecondary+';cursor:pointer;font-family:'+fontBody;
clearBtn.onclick=()=>{messages.length=0;msgArea.innerHTML='';};
toolbar.append(modelSel, clearBtn);

const msgArea = document.createElement('div');
msgArea.style.cssText='flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:10px';

const inputRow = document.createElement('div');
inputRow.style.cssText='display:flex;gap:6px;padding:8px;border-top:1px solid '+borderPrimary+';flex-shrink:0';
const inp = document.createElement('textarea');
inp.placeholder='Ask anything… (uses {{OPENAI_API_KEY}} or {{ANTHROPIC_API_KEY}})';
inp.rows=2;
inp.style.cssText='flex:1;border:1px solid '+borderPrimary+';border-radius:8px;padding:6px 10px;font-size:12px;font-family:'+fontBody+';background:'+bgSecondary+';color:'+textPrimary+';resize:none;outline:none;line-height:1.5';
const sendBtn = document.createElement('button');
sendBtn.textContent='→';
sendBtn.style.cssText='width:34px;height:34px;border-radius:8px;border:none;background:'+accentBlue+';color:#fff;cursor:pointer;font-size:18px;align-self:flex-end;flex-shrink:0';

function addBubble(role, text, streaming) {
  const isUser = role==='user';
  const row = document.createElement('div');
  row.style.cssText='display:flex;flex-direction:column;gap:2px;max-width:85%;align-self:'+(isUser?'flex-end':'flex-start');
  const bubble = document.createElement('div');
  bubble.style.cssText='padding:8px 12px;border-radius:12px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;'
    +(isUser?'background:'+accentBlue+';color:#fff;border-bottom-right-radius:3px':'background:'+bgTertiary+';color:'+textPrimary+';border-bottom-left-radius:3px');
  bubble.textContent=text;
  row.appendChild(bubble);
  msgArea.appendChild(row);
  msgArea.scrollTop=msgArea.scrollHeight;
  return bubble;
}

async function send() {
  const text=inp.value.trim(); if(!text) return;
  inp.value=''; inp.style.height='auto';
  messages.push({role:'user',content:text});
  addBubble('user',text);
  const assistantBubble=addBubble('assistant','…');

  const isAnthropic=model.startsWith('claude');
  const url=isAnthropic?'https://api.anthropic.com/v1/messages':'https://api.openai.com/v1/chat/completions';
  const headers=isAnthropic
    ?{'x-api-key':'{{ANTHROPIC_API_KEY}}','anthropic-version':'2023-06-01','content-type':'application/json'}
    :{'Authorization':'Bearer {{OPENAI_API_KEY}}','content-type':'application/json'};
  const body=isAnthropic
    ?{model,max_tokens:1024,messages}
    :{model,stream:false,messages};

  try {
    const res=await fetch(H+'/proxy',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({url,method:'POST',headers,body:JSON.stringify(body)})});
    const d=await res.json();
    const reply=isAnthropic?d.content?.[0]?.text:d.choices?.[0]?.message?.content;
    if(!reply) throw new Error(JSON.stringify(d));
    messages.push({role:'assistant',content:reply});
    assistantBubble.textContent=reply;
  } catch(e){ assistantBubble.textContent='Error: '+e.message; assistantBubble.style.color='var(--accent-red)'; }
  msgArea.scrollTop=msgArea.scrollHeight;
}
sendBtn.onclick=send;
inp.onkeydown=e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} };

wrap.append(toolbar, msgArea, inputRow);
inputRow.append(inp, sendBtn);
document.body.appendChild(wrap);
`.trim();

const TERMINAL_CODE = `
const H = window.__agentHttpBase__ || 'http://localhost:18789';
const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgPrimary = cs.getPropertyValue('--bg-primary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentGreen = cs.getPropertyValue('--accent-green').trim() || '#2DB970';
const accentRed = cs.getPropertyValue('--accent-red').trim() || '#E5352B';
const fontMono = cs.getPropertyValue('--font-heading').trim() || 'monospace';

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;background:#0a0a0a;color:#e0e0e0;font-family:'+fontMono;

const output = document.createElement('div');
output.style.cssText='flex:1;overflow-y:auto;padding:10px 12px;font-size:11px;line-height:1.7;white-space:pre-wrap;word-break:break-all';

const inputRow = document.createElement('div');
inputRow.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 12px;border-top:1px solid #222;flex-shrink:0';
const prompt = document.createElement('span');
prompt.textContent='$ ';
prompt.style.cssText='color:'+accentGreen+';font-size:12px;flex-shrink:0';
const cmdInp = document.createElement('input');
cmdInp.placeholder='ls -la';
cmdInp.style.cssText='flex:1;background:transparent;border:none;outline:none;font-family:'+fontMono+';font-size:12px;color:#e0e0e0';

let cwd = window.__agentHttpBase__ ? '' : '';

function appendLine(text, color) {
  const line = document.createElement('span');
  line.style.color = color || '#e0e0e0';
  line.textContent = text + '\\n';
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

appendLine('Terminal — commands run on the Python server', '#555');
appendLine('Type a command and press Enter', '#555');
appendLine('', '');

async function runCmd() {
  const cmd = cmdInp.value.trim(); if(!cmd) return;
  appendLine('$ ' + cmd, accentGreen);
  cmdInp.value = '';
  try {
    const url = H+'/shell?cmd='+encodeURIComponent(cmd)+(cwd?'&cwd='+encodeURIComponent(cwd):'');
    const res = await fetch(url);
    const d = await res.json();
    if(d.error) { appendLine(d.error, accentRed); }
    else {
      if(d.output) appendLine(d.output.replace(/\\n$/, ''), d.returncode===0?'#e0e0e0':accentRed);
      if(cmd.trim().startsWith('cd ')) {
        // track cwd
        const r2 = await fetch(H+'/shell?cmd=pwd'+(cwd?'&cwd='+encodeURIComponent(cwd):''));
        const d2 = await r2.json();
        if(!d2.error) cwd = d2.output.trim();
      }
    }
  } catch(e){ appendLine('Error: '+e.message, accentRed); }
}
cmdInp.onkeydown=e=>{ if(e.key==='Enter') runCmd(); };

wrap.append(output, inputRow);
inputRow.append(prompt, cmdInp);
document.body.appendChild(wrap);
cmdInp.focus();
`.trim();

const LINE_CHART_CODE = `
const COLORS = ['#1473DF','#3FDC7E','#F59E0B','#FA4B42','#EC4899','#06B6D4'];
const cs = getComputedStyle(document.documentElement);
const colorMuted = cs.getPropertyValue('--text-secondary').trim() || '#6B6358';
const colorBg = cs.getPropertyValue('--bg-primary').trim() || '#F7F3EC';
const colorBorder = cs.getPropertyValue('--border-primary').trim() || '#D5CFC0';
const fontFamily = cs.getPropertyValue('--font-body').trim() || 'system-ui';

let chartData = {
  labels: ['Jan','Feb','Mar','Apr','May','Jun'],
  datasets: [{label:'Revenue', data:[42,67,53,88,61,75]}]
};
let chart;

function alphaColor(hex, a) {
  const r=parseInt(hex.slice(1,3)||'80',16), g=parseInt(hex.slice(3,5)||'80',16), b=parseInt(hex.slice(5,7)||'80',16);
  return 'rgba('+r+','+g+','+b+','+a+')';
}

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh';
const toolbar=document.createElement('div');
toolbar.style.cssText='display:flex;justify-content:flex-end;padding:6px 10px 0;flex-shrink:0';
const editBtn=document.createElement('button');
editBtn.textContent='Edit data';
editBtn.style.cssText='background:none;border:1px solid '+colorBorder+';border-radius:4px;padding:2px 10px;font-size:11px;color:'+colorMuted+';cursor:pointer';
toolbar.appendChild(editBtn);
const chartWrap=document.createElement('div');
chartWrap.style.cssText='flex:1;min-height:0;padding:4px 12px 10px 8px';
const canvas=document.createElement('canvas');
canvas.style.cssText='width:100%;height:100%';
chartWrap.appendChild(canvas);
wrap.append(toolbar, chartWrap);
document.body.appendChild(wrap);

const s=document.createElement('script');
s.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
s.onload=()=>{
  Chart.defaults.color=colorMuted;
  Chart.defaults.font.family=fontFamily;
  Chart.defaults.font.size=12;
  const gridColor=alphaColor(colorBorder,0.5);
  chart=new Chart(canvas,{
    type:'line',
    data:{
      labels:chartData.labels,
      datasets:chartData.datasets.map((d,i)=>({
        label:d.label, data:d.data,
        borderColor:COLORS[i%COLORS.length],
        backgroundColor:alphaColor(COLORS[i%COLORS.length],0.1),
        borderWidth:2, pointRadius:4, pointHoverRadius:6, tension:0.35, fill:true
      }))
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{top:8,right:4}},
      plugins:{legend:{labels:{color:colorMuted,font:{size:12,family:fontFamily},boxWidth:12,usePointStyle:true}},
        tooltip:{titleFont:{size:12},bodyFont:{size:12}}},
      scales:{
        x:{grid:{color:gridColor},border:{display:false},ticks:{color:colorMuted,font:{size:12,family:fontFamily}}},
        y:{grid:{color:gridColor},border:{display:false},ticks:{color:colorMuted,font:{size:12,family:fontFamily}},beginAtZero:true}
      }
    }
  });
};
document.head.appendChild(s);
`.trim();

const MARKDOWN_CODE = `
const H = window.__agentHttpBase__ || 'http://localhost:18789';
const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim();
const bgTertiary = cs.getPropertyValue('--bg-tertiary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const fontBody = cs.getPropertyValue('--font-body').trim() || 'system-ui';
const fontMono = cs.getPropertyValue('--font-heading').trim() || 'monospace';

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden';

const toolbar = document.createElement('div');
toolbar.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;
const pathInp = document.createElement('input');
pathInp.placeholder='Paste a file path or URL';
pathInp.style.cssText='flex:1;border:1px solid '+borderPrimary+';border-radius:6px;padding:4px 8px;font-size:11px;background:'+bgTertiary+';color:'+textPrimary+';font-family:'+fontMono+';outline:none';
const loadBtn = document.createElement('button');
loadBtn.textContent='Load';
loadBtn.style.cssText='padding:4px 12px;border-radius:6px;border:none;background:'+accentBlue+';color:#fff;font-size:11px;cursor:pointer';

const preview = document.createElement('div');
preview.style.cssText='flex:1;overflow-y:auto;padding:16px 20px;font-family:'+fontBody+';font-size:13px;line-height:1.7;color:'+textPrimary;

const style = document.createElement('style');
style.textContent='h1,h2,h3{margin:16px 0 8px;font-weight:700}h1{font-size:20px}h2{font-size:16px}h3{font-size:14px}'
  +'p{margin:8px 0}code{background:'+bgTertiary+';padding:1px 5px;border-radius:4px;font-family:'+fontMono+';font-size:12px}'
  +'pre{background:'+bgTertiary+';border:1px solid '+borderPrimary+';border-radius:8px;padding:12px;overflow-x:auto;margin:8px 0}'
  +'pre code{background:none;padding:0}a{color:'+accentBlue+'}blockquote{border-left:3px solid '+borderPrimary+';padding-left:12px;color:'+textSecondary+';margin:8px 0}'
  +'ul,ol{padding-left:20px;margin:8px 0}hr{border:none;border-top:1px solid '+borderPrimary+';margin:16px 0}';
document.head.appendChild(style);

// Simple markdown parser
function parseMarkdown(md) {
  return md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^#{3} (.+)$/gm,'<h3>$1</h3>')
    .replace(/^#{2} (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/_(.+?)_/g,'<em>$1</em>')
    .replace(/\`\`\`[\s\S]+?\`\`\`/g, m=>'<pre><code>'+m.slice(3,-3).replace(/^[a-z]+\n/,'')+'</code></pre>')
    .replace(/\`([^\`]+)\`/g,'<code>$1</code>')
    .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^---$/gm,'<hr>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^[-*] (.+)$/gm,'<li>$1</li>')
    .replace(/<\/li>\n<li>/g,'</li><li>')
    .replace(/(<li>.*<\/li>)/gs,'<ul>$1</ul>')
    .replace(/\n\n/g,'</p><p>')
    .replace(/^(?!<[hupboali])/gm,'')
    ;
}

async function loadFile() {
  const val = pathInp.value.trim(); if(!val) return;
  preview.innerHTML='<p style="color:'+textSecondary+'">Loading…</p>';
  try {
    let text;
    if(val.startsWith('http')){
      const res=await fetch(H+'/proxy',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({url:val,method:'GET',headers:{}})});
      text=await res.text();
    } else {
      const res=await fetch(H+'/shell?cmd='+encodeURIComponent('cat "'+val+'"'));
      const d=await res.json();
      if(d.error) throw new Error(d.error);
      text=d.output;
    }
    preview.innerHTML='<p>'+parseMarkdown(text)+'</p>';
  } catch(e){ preview.innerHTML='<p style="color:var(--accent-red)">Error: '+e.message+'</p>'; }
}
loadBtn.onclick=loadFile;
pathInp.onkeydown=e=>{ if(e.key==='Enter') loadFile(); };

toolbar.append(pathInp, loadBtn);
wrap.append(toolbar, preview);
document.body.appendChild(wrap);
preview.innerHTML='<p style="color:'+textSecondary+';text-align:center;margin-top:40px">Enter a file path or URL above to render Markdown.</p>';
`.trim();

const JSON_EXPLORER_CODE = `
const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim();
const bgTertiary = cs.getPropertyValue('--bg-tertiary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const accentGreen = cs.getPropertyValue('--accent-green').trim() || '#2DB970';
const accentRed = cs.getPropertyValue('--accent-red').trim() || '#E5352B';
const accentOrange = cs.getPropertyValue('--accent-orange').trim() || '#D97706';
const fontMono = cs.getPropertyValue('--font-heading').trim() || 'monospace';

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden';

const toolbar = document.createElement('div');
toolbar.style.cssText='display:flex;gap:6px;padding:6px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;
const inp = document.createElement('textarea');
inp.placeholder='Paste JSON or YAML here…';
inp.rows=1;
inp.style.cssText='flex:1;border:1px solid '+borderPrimary+';border-radius:6px;padding:4px 8px;font-size:11px;font-family:'+fontMono+';background:'+bgTertiary+';color:'+textPrimary+';resize:none;outline:none';
const parseBtn = document.createElement('button');
parseBtn.textContent='Parse';
parseBtn.style.cssText='padding:4px 12px;border-radius:6px;border:none;background:'+accentBlue+';color:#fff;font-size:11px;cursor:pointer';

const tree = document.createElement('div');
tree.style.cssText='flex:1;overflow:auto;padding:10px 12px;font-family:'+fontMono+';font-size:12px;line-height:1.7';

function valueColor(v) {
  if(v===null) return textSecondary;
  if(typeof v==='boolean') return accentBlue;
  if(typeof v==='number') return accentOrange;
  if(typeof v==='string') return accentGreen;
  return textPrimary;
}

function renderNode(val, depth) {
  const indent = '  '.repeat(depth);
  const container = document.createElement('div');

  if(val && typeof val==='object') {
    const isArr = Array.isArray(val);
    const entries = isArr ? val.map((v,i)=>[i,v]) : Object.entries(val);
    const toggle = document.createElement('span');
    toggle.textContent=(isArr?'['+'[':'{')+'…'+(isArr?']':'}');
    toggle.style.cssText='cursor:pointer;color:'+textSecondary+';font-size:11px;user-select:none';
    container.appendChild(toggle);

    const children = document.createElement('div');
    children.style.marginLeft='16px';
    entries.forEach(([k,v])=>{
      const row=document.createElement('div');
      if(!isArr){
        const key=document.createElement('span');
        key.textContent='"'+k+'": ';
        key.style.color=accentBlue;
        row.appendChild(key);
      }
      row.appendChild(renderNode(v, depth+1));
      children.appendChild(row);
    });
    container.appendChild(children);

    toggle.onclick=()=>{
      children.style.display=children.style.display==='none'?'':'none';
      toggle.textContent=children.style.display==='none'
        ?(isArr?'[':'{')+' ('+entries.length+') '+(isArr?']':'}')
        :(isArr?'[':'{')+' …';
    };
  } else {
    const span=document.createElement('span');
    span.style.color=valueColor(val);
    span.textContent=JSON.stringify(val);
    container.appendChild(span);
  }
  return container;
}

function doParse() {
  const text=inp.value.trim(); if(!text) return;
  try {
    const data=JSON.parse(text);
    tree.innerHTML='';
    tree.appendChild(renderNode(data,0));
  } catch(e){
    tree.innerHTML='<span style="color:'+accentRed+'">Parse error: '+e.message+'</span>';
  }
}
parseBtn.onclick=doParse;
inp.onkeydown=e=>{ if(e.key==='Enter'&&e.ctrlKey) doParse(); };

toolbar.append(inp, parseBtn);
wrap.append(toolbar, tree);
document.body.appendChild(wrap);
tree.innerHTML='<span style="color:'+textSecondary+'">Paste JSON and click Parse (or Ctrl+Enter)</span>';
`.trim();

const FILE_BROWSER_CODE = `
const H = window.__agentHttpBase__ || 'http://localhost:18789';
const cs = getComputedStyle(document.documentElement);
const textPrimary = cs.getPropertyValue('--text-primary').trim();
const textSecondary = cs.getPropertyValue('--text-secondary').trim();
const bgSecondary = cs.getPropertyValue('--bg-secondary').trim();
const bgTertiary = cs.getPropertyValue('--bg-tertiary').trim();
const borderPrimary = cs.getPropertyValue('--border-primary').trim();
const accentBlue = cs.getPropertyValue('--accent-blue').trim() || '#1473DF';
const fontMono = cs.getPropertyValue('--font-heading').trim() || 'monospace';
const fontBody = cs.getPropertyValue('--font-body').trim() || 'system-ui';

let currentPath = '';

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden';

const toolbar = document.createElement('div');
toolbar.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;
const upBtn = document.createElement('button');
upBtn.textContent='↑';
upBtn.title='Parent directory';
upBtn.style.cssText='padding:3px 8px;border:1px solid '+borderPrimary+';border-radius:6px;background:transparent;color:'+textSecondary+';cursor:pointer;font-size:13px';
const pathLbl = document.createElement('span');
pathLbl.style.cssText='flex:1;font-size:11px;font-family:'+fontMono+';color:'+textSecondary+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

const list = document.createElement('div');
list.style.cssText='flex:1;overflow-y:auto';

async function loadDir(path) {
  list.innerHTML='<div style="padding:16px;color:'+textSecondary+';font-size:12px">Loading…</div>';
  try {
    const res = await fetch(H+'/files?path='+encodeURIComponent(path||'.'));
    const d = await res.json();
    if(d.error) throw new Error(d.error);
    currentPath=d.path;
    pathLbl.textContent=currentPath;
    list.innerHTML='';
    d.entries.forEach(entry=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:'+(entry.isDir?'pointer':'default')+';border-bottom:1px solid '+borderPrimary+';font-size:12px;font-family:'+fontBody+';color:'+textPrimary+';transition:background 100ms';
      row.onmouseover=()=>row.style.background=bgTertiary;
      row.onmouseout=()=>row.style.background='transparent';
      const icon=document.createElement('span');
      icon.textContent=entry.isDir?'📁':'📄';
      icon.style.fontSize='14px';
      const name=document.createElement('span');
      name.textContent=entry.name+(entry.isDir?'/':'');
      name.style.flex='1';
      const size=document.createElement('span');
      size.textContent=entry.isDir?'':formatSize(entry.size);
      size.style.cssText='color:'+textSecondary+';font-size:10px;font-family:'+fontMono;
      row.append(icon, name, size);
      if(entry.isDir) row.onclick=()=>loadDir(entry.path);
      list.appendChild(row);
    });
  } catch(e){
    list.innerHTML='<div style="padding:16px;color:var(--accent-red);font-size:12px">Error: '+e.message+'</div>';
  }
}

function formatSize(b) {
  if(b<1024) return b+'B';
  if(b<1048576) return (b/1024).toFixed(1)+'KB';
  return (b/1048576).toFixed(1)+'MB';
}

upBtn.onclick=()=>{
  const parent=currentPath.replace(/\\/[^\\/]+$/, '')||'/';
  loadDir(parent);
};

toolbar.append(upBtn, pathLbl);
wrap.append(toolbar, list);
document.body.appendChild(wrap);
loadDir('.');
`.trim();

const TIMER_CODE = `
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
`.trim();

const WEATHER_CODE = `
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
`.trim();

const GITHUB_CODE = `
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
const fontBody = cs.getPropertyValue('--font-body').trim() || 'system-ui';

const wrap = document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden;font-family:'+fontBody;

const toolbar = document.createElement('div');
toolbar.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid '+borderPrimary+';flex-shrink:0;background:'+bgSecondary;
const repoInp = document.createElement('input');
repoInp.placeholder='owner/repo (e.g. torvalds/linux)';
repoInp.style.cssText='flex:1;border:1px solid '+borderPrimary+';border-radius:6px;padding:4px 8px;font-size:11px;background:'+bgTertiary+';color:'+textPrimary+';outline:none';
const loadBtn = document.createElement('button');
loadBtn.textContent='Load';
loadBtn.style.cssText='padding:4px 12px;border-radius:6px;border:none;background:'+accentBlue+';color:#fff;font-size:11px;cursor:pointer';

const tabs = document.createElement('div');
tabs.style.cssText='display:flex;border-bottom:1px solid '+borderPrimary+';flex-shrink:0';
const list = document.createElement('div');
list.style.cssText='flex:1;overflow-y:auto';

let activeTab='prs';
['PRs','Issues','Commits'].forEach((label,i)=>{
  const t=['prs','issues','commits'][i];
  const btn=document.createElement('button');
  btn.textContent=label; btn.dataset.tab=t;
  btn.style.cssText='flex:1;padding:6px 4px;border:none;background:transparent;font-size:var(--font-size-xs,11px);color:'+textSecondary+';cursor:pointer;border-bottom:2px solid transparent;transition:.1s';
  btn.onclick=()=>{ activeTab=t; updateTabStyles(); loadData(); };
  tabs.appendChild(btn);
});
function updateTabStyles(){
  tabs.querySelectorAll('button').forEach(b=>{
    const active=b.dataset.tab===activeTab;
    b.style.color=active?accentBlue:textSecondary;
    b.style.borderBottomColor=active?accentBlue:'transparent';
  });
}
updateTabStyles();

async function loadData() {
  const repo=repoInp.value.trim(); if(!repo) return;
  list.innerHTML='<p style="padding:16px;font-size:12px;color:'+textSecondary+'">Loading…</p>';
  try {
    const endpoints={
      prs:'https://api.github.com/repos/'+repo+'/pulls?state=all&per_page=20',
      issues:'https://api.github.com/repos/'+repo+'/issues?state=all&per_page=20',
      commits:'https://api.github.com/repos/'+repo+'/commits?per_page=20',
    };
    const res=await fetch(H+'/proxy',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({url:endpoints[activeTab],method:'GET',headers:{'Authorization':'Bearer {{GITHUB_TOKEN}}','Accept':'application/vnd.github.v3+json'}})});
    const items=await res.json();
    if(!Array.isArray(items)) throw new Error(items.message||JSON.stringify(items));
    list.innerHTML='';
    items.forEach(item=>{
      const row=document.createElement('div');
      row.style.cssText='padding:8px 12px;border-bottom:1px solid '+borderPrimary+';display:flex;flex-direction:column;gap:2px';
      const title=document.createElement('a');
      title.href=item.html_url||'#'; title.target='_blank';
      title.textContent=(activeTab==='commits'?item.commit?.message?.split('\\n')[0]:item.title)||'—';
      title.style.cssText='font-size:12px;color:'+accentBlue+';text-decoration:none;line-height:1.4';
      const meta=document.createElement('span');
      const state=item.state||(item.commit?'':'open');
      const stateColor=state==='closed'?accentRed:state==='merged'?accentBlue:accentGreen;
      meta.innerHTML='<span style="color:'+stateColor+';font-size:10px;font-weight:600">'+(state||'').toUpperCase()+'</span>'
        +'<span style="color:'+textSecondary+';font-size:10px;margin-left:8px">'+(item.user?.login||item.commit?.author?.name||'')+'</span>';
      row.append(title,meta);
      list.appendChild(row);
    });
  } catch(e){ list.innerHTML='<p style="padding:16px;font-size:12px;color:var(--accent-red)">'+e.message+'</p>'; }
}
loadBtn.onclick=loadData;
repoInp.onkeydown=e=>{ if(e.key==='Enter') loadData(); };

toolbar.append(repoInp, loadBtn);
wrap.append(toolbar, tabs, list);
document.body.appendChild(wrap);
`.trim();

const STOCK_CODE = `
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
    const res=await fetch(H+'/proxy',{method:'POST',headers:{'content-type':'application/json'},
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
`.trim();

const KANBAN_CODE = `
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
`.trim();

const STICKY_CODE = `
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
`.trim();

const WEB_PREVIEW_CODE = `
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
`.trim();

const SQL_CODE = `
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

const wrap=document.createElement('div');
wrap.style.cssText='display:flex;flex-direction:column;height:100vh;overflow:hidden;font-family:'+fontBody;

const queryArea=document.createElement('div');
queryArea.style.cssText='flex-shrink:0;border-bottom:1px solid '+borderPrimary;
const ta=document.createElement('textarea');
ta.placeholder='SELECT * FROM users LIMIT 10;\n-- Uses {{DB_URL}} credential (postgres://user:pass@host/db)';
ta.rows=4;
ta.style.cssText='width:100%;border:none;outline:none;resize:none;padding:10px 12px;font-family:'+fontMono+';font-size:12px;background:var(--bg-primary);color:'+textPrimary+';line-height:1.6;box-sizing:border-box';
const runBar=document.createElement('div');
runBar.style.cssText='display:flex;align-items:center;gap:6px;padding:4px 8px;background:'+bgSecondary;
const runBtn=document.createElement('button');
runBtn.textContent='▶ Run  Ctrl+Enter';
runBtn.style.cssText='padding:4px 14px;border-radius:6px;border:none;background:'+accentBlue+';color:#fff;font-size:11px;cursor:pointer;font-family:'+fontBody;
const status=document.createElement('span');
status.style.cssText='font-size:11px;color:'+textSecondary;
runBar.append(runBtn, status);
queryArea.append(ta, runBar);

const results=document.createElement('div');
results.style.cssText='flex:1;overflow:auto;font-size:12px';

async function run() {
  const sql=ta.value.trim(); if(!sql) return;
  status.textContent='Running…';
  results.innerHTML='';
  try {
    const res=await fetch(H+'/sql',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({sql, db:'{{DB_URL}}'})});
    const d=await res.json();
    if(d.error) throw new Error(d.error);
    status.textContent='✓ '+d.rows.length+' row(s) — '+(d.duration_ms||0).toFixed(1)+'ms';
    if(!d.rows.length){results.innerHTML='<p style="padding:16px;color:'+textSecondary+'">No rows returned</p>';return;}
    const cols=Object.keys(d.rows[0]);
    const table=document.createElement('table');
    table.style.cssText='width:100%;border-collapse:collapse;white-space:nowrap';
    const thead=document.createElement('thead');
    const trh=document.createElement('tr');
    cols.forEach(c=>{
      const th=document.createElement('th');
      th.textContent=c;
      th.style.cssText='padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:'+textSecondary+';border-bottom:2px solid '+borderPrimary+';position:sticky;top:0;background:'+bgSecondary+';font-family:'+fontMono;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody=document.createElement('tbody');
    d.rows.forEach((row,ri)=>{
      const tr=document.createElement('tr');
      tr.style.background=ri%2?bgTertiary:'transparent';
      cols.forEach(c=>{
        const td=document.createElement('td');
        td.textContent=row[c]===null?'NULL':String(row[c]);
        td.style.cssText='padding:5px 10px;border-bottom:1px solid '+borderPrimary+';color:'+(row[c]===null?textSecondary:textPrimary)+';font-family:'+fontMono;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    results.appendChild(table);
  } catch(e){
    status.textContent='Error';
    results.innerHTML='<p style="padding:16px;color:'+accentRed+';font-size:12px">'+e.message+'</p><p style="padding:0 16px;font-size:11px;color:'+textSecondary+'">Add DB_URL in Credentials (e.g. postgresql://user:pass@localhost/db)</p>';
  }
}
runBtn.onclick=run;
ta.onkeydown=e=>{ if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();run();} };

wrap.append(queryArea, results);
document.body.appendChild(wrap);
`.trim();

const WHITEBOARD_CODE = `
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
`.trim();

// ─── Registry ─────────────────────────────────────────────────────────────────

export const WIDGET_REGISTRY: WidgetDef[] = [
  {
    kind:'clock', label:'Clock', emoji:'⏰', defaultW:240, defaultH:130, code:CLOCK_CODE,
    keywords:    ['time','clock','date','timer','live','analog'],
    description: 'Displays the current time and date, updating every second.',
    meta: B('utility'),
  },
  {
    kind:'bar', label:'Bar Chart', emoji:'📊', defaultW:380, defaultH:280, code:BAR_CODE,
    keywords:    ['bar chart','chart','visualization','graph','data','chart.js'],
    description: 'Interactive bar chart with hover tooltips powered by Chart.js. Editable data.',
    meta: B('visualization'),
  },
  {
    kind:'pie', label:'Pie Chart', emoji:'🥧', defaultW:320, defaultH:280, code:PIE_CODE,
    keywords:    ['pie chart','donut','chart','visualization','proportion','chart.js'],
    description: 'Donut-style pie chart with legend and hover tooltips. Editable slices.',
    meta: B('visualization'),
  },
  {
    kind:'kpi', label:'Key Figures', emoji:'📈', defaultW:380, defaultH:200, code:KPI_CODE,
    keywords:    ['kpi','metrics','dashboard','stats','key figures','numbers'],
    description: 'A 2×2 grid of editable KPI cards with label, value, change indicator and trend arrow.',
    meta: B('dashboard'),
  },
  {
    kind:'news', label:'News', emoji:'📰', defaultW:320, defaultH:300, code:NEWS_CODE,
    keywords:    ['news','headlines','feed','articles','stories'],
    description: 'Scrollable news headline list. Add custom stories via the built-in form.',
    meta: B('information'),
  },
  {
    kind:'search', label:'Search', emoji:'🔍', defaultW:380, defaultH:420, code:SEARCH_CODE,
    keywords:    ['search','google','serpapi','web','results','query'],
    description: 'Google search powered by SerpAPI. Enter your API key to see inline results.',
    meta: B('productivity'),
  },
  {
    kind:'editor', label:'Editor', emoji:'📝', defaultW:340, defaultH:260, code:EDITOR_CODE,
    keywords:    ['text','editor','notes','write','plain text','scratchpad'],
    description: 'Plain-text scratchpad. Type freely; content is held in widget memory.',
    meta: B('productivity'),
  },
  {
    kind:'table', label:'Table', emoji:'🗂', defaultW:400, defaultH:220, code:TABLE_CODE,
    keywords:    ['table','spreadsheet','grid','cells','data','rows','columns'],
    description: 'Editable spreadsheet-style table. Add rows and columns dynamically.',
    meta: B('productivity'),
  },
  {
    kind:'calendar', label:'Calendar', emoji:'📅', defaultW:280, defaultH:290, code:CALENDAR_CODE,
    keywords:    ['calendar','date','month','schedule','planner','day'],
    description: 'Month-view calendar with day selection. Navigate months with arrow buttons.',
    meta: B('utility'),
  },
  {
    kind:'video', label:'Video', emoji:'▶️', defaultW:400, defaultH:280, code:VIDEO_CODE,
    keywords:    ['video','youtube','vimeo','player','embed','media','stream'],
    description: 'Embed a YouTube or Vimeo video by pasting its URL.',
    meta: B('media'),
  },
  {
    kind:'email', label:'Email', emoji:'📮', defaultW:340, defaultH:360, code:EMAIL_CODE,
    keywords:    ['email','gmail','outlook','yahoo','protonmail','compose','mail'],
    description: 'Compose and open emails in Gmail, Outlook, Yahoo or ProtonMail.',
    meta: B('communication'),
  },
  {
    kind:'map', label:'Map', emoji:'🗺️', defaultW:400, defaultH:340, code:MAP_CODE,
    keywords:    ['map','google maps','location','places','geography','search'],
    description: 'Google Maps search widget. Optionally add an API key for the official embed.',
    meta: B('information'),
  },
  {
    kind:'chat', label:'Chat', emoji:'💬', defaultW:300, defaultH:360, code:CHAT_CODE,
    keywords:    ['chat','messages','conversation','notes','bubble','talk'],
    description: 'Local chat-bubble notepad. Messages are held in widget memory.',
    meta: B('communication'),
  },
  {
    kind:'videocall', label:'Video Call', emoji:'📹', defaultW:480, defaultH:360, code:VIDEOCALL_CODE,
    keywords:    ['video call','jitsi','meeting','conference','voice','video'],
    description: 'Start or join a free encrypted video call via Jitsi Meet. Share the room name to invite others.',
    meta: B('communication'),
  },
  {
    kind:'custom', label:'Custom', emoji:'⚡', defaultW:340, defaultH:280, code:CUSTOM_CODE,
    keywords:    ['custom','code','javascript','widget','script'],
    description: 'User-defined widget. Write any JavaScript and run it in a sandboxed iframe.',
    meta: { author: 'user', version: '1.0.0', category: 'custom' },
  },
  // ── 15 new widgets ───────────────────────────────────────────────────────────
  {
    kind:'llm-chat', label:'LLM Chat', emoji:'🤖', defaultW:380, defaultH:420, code:LLM_CHAT_CODE,
    keywords:    ['llm','ai','chatgpt','claude','openai','anthropic','chat','gpt'],
    description: 'Chat with OpenAI or Anthropic LLMs via the credential proxy. Needs OPENAI_API_KEY or ANTHROPIC_API_KEY.',
    meta: B('ai'),
  },
  {
    kind:'terminal', label:'Terminal', emoji:'🖥️', defaultW:440, defaultH:340, code:TERMINAL_CODE,
    keywords:    ['terminal','shell','bash','cli','command','run','execute'],
    description: 'Run shell commands on the Python server and see live output.',
    meta: B('dev'),
  },
  {
    kind:'line-chart', label:'Line Chart', emoji:'📉', defaultW:380, defaultH:280, code:LINE_CHART_CODE,
    keywords:    ['line chart','area','trend','time series','graph','chart.js'],
    description: 'Line/area chart with hover tooltips powered by Chart.js. Editable data.',
    meta: B('visualization'),
  },
  {
    kind:'markdown', label:'Markdown', emoji:'📄', defaultW:380, defaultH:340, code:MARKDOWN_CODE,
    keywords:    ['markdown','md','readme','document','viewer','render'],
    description: 'Render any local file path or URL as formatted Markdown.',
    meta: B('information'),
  },
  {
    kind:'json', label:'JSON Explorer', emoji:'🔬', defaultW:360, defaultH:340, code:JSON_EXPLORER_CODE,
    keywords:    ['json','yaml','tree','explorer','data','inspect','parse'],
    description: 'Paste JSON to get a collapsible tree viewer with syntax colouring.',
    meta: B('dev'),
  },
  {
    kind:'files', label:'File Browser', emoji:'🗂️', defaultW:320, defaultH:360, code:FILE_BROWSER_CODE,
    keywords:    ['files','browser','directory','folder','tree','navigate'],
    description: 'Browse the server filesystem starting from the working directory.',
    meta: B('dev'),
  },
  {
    kind:'timer', label:'Timer', emoji:'⏱️', defaultW:280, defaultH:260, code:TIMER_CODE,
    keywords:    ['timer','pomodoro','countdown','focus','break','clock'],
    description: 'Pomodoro timer with short/long break presets and a progress bar.',
    meta: B('productivity'),
  },
  {
    kind:'weather', label:'Weather', emoji:'🌤️', defaultW:300, defaultH:320, code:WEATHER_CODE,
    keywords:    ['weather','temperature','forecast','openweathermap','climate'],
    description: 'Live weather for any city via OpenWeatherMap. Needs OPENWEATHERMAP_API_KEY.',
    meta: B('information'),
  },
  {
    kind:'github', label:'GitHub', emoji:'🐙', defaultW:360, defaultH:360, code:GITHUB_CODE,
    keywords:    ['github','gitlab','prs','issues','commits','ci','git'],
    description: 'Browse PRs, issues and commits for any GitHub repo. Needs GITHUB_TOKEN.',
    meta: B('dev'),
  },
  {
    kind:'stock', label:'Crypto / Stock', emoji:'📊', defaultW:380, defaultH:320, code:STOCK_CODE,
    keywords:    ['crypto','bitcoin','stock','price','coingecko','ticker','market'],
    description: 'Live cryptocurrency prices via CoinGecko (free, no API key needed).',
    meta: B('information'),
  },
  {
    kind:'kanban', label:'Kanban', emoji:'🗃️', defaultW:480, defaultH:360, code:KANBAN_CODE,
    keywords:    ['kanban','board','tasks','todo','project','drag','cards'],
    description: 'Drag-and-drop Kanban board with three columns. Persisted to localStorage.',
    meta: B('productivity'),
  },
  {
    kind:'sticky', label:'Sticky Notes', emoji:'📌', defaultW:360, defaultH:320, code:STICKY_CODE,
    keywords:    ['sticky','notes','memo','post-it','colour','reminder'],
    description: 'Colour-coded sticky notes, persisted to localStorage.',
    meta: B('productivity'),
  },
  {
    kind:'web-preview', label:'Web Preview', emoji:'🌐', defaultW:420, defaultH:360, code:WEB_PREVIEW_CODE,
    keywords:    ['web','browser','url','preview','reader','scraper','fetch'],
    description: 'Load any URL in reader mode via the server-side proxy (bypasses CORS).',
    meta: B('information'),
  },
  {
    kind:'sql', label:'SQL Runner', emoji:'🛢️', defaultW:440, defaultH:380, code:SQL_CODE,
    keywords:    ['sql','database','postgres','mysql','query','db','table'],
    description: 'Run SQL queries against a database. Needs DB_URL credential.',
    meta: B('dev'),
  },
  {
    kind:'whiteboard', label:'Whiteboard', emoji:'🎨', defaultW:440, defaultH:360, code:WHITEBOARD_CODE,
    keywords:    ['whiteboard','draw','sketch','canvas','paint','diagram','freehand'],
    description: 'Freehand drawing canvas with pen, eraser, shapes and undo.',
    meta: B('productivity'),
  },
];

export const REGISTRY_MAP = Object.fromEntries(WIDGET_REGISTRY.map(w => [w.kind, w])) as Record<WidgetKind, WidgetDef>;
