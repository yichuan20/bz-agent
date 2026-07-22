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
    const res=await fetch(H+'/api/v1/runtime/proxy',{method:'POST',headers:{'content-type':'application/json'},
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