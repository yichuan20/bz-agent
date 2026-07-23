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