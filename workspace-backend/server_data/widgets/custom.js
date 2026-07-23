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