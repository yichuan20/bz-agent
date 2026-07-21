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