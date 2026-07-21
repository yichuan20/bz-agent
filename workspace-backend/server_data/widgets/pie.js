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