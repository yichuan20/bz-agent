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