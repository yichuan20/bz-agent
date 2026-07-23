const ta = document.createElement('textarea');
ta.placeholder = 'Start typing…';
ta.style.cssText = 'width:100%;height:100%;border:none;outline:none;resize:none;'
  + 'padding:10px 12px;background:transparent;font-family:monospace;'
  + 'font-size:12px;color:var(--text-primary);line-height:1.6;';
document.body.style.height = '100vh';
document.body.appendChild(ta);
ta.focus();