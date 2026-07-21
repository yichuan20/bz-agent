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