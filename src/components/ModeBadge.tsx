import { useState } from 'react';
import { AGENT_MODES, MODE_FALLBACK, MODE_ICONS, type AgentMode } from '#/lib/agentModes';
import { XIcon } from '@phosphor-icons/react';

interface Props {
  mode:     AgentMode;
  onSwitch: (mode: AgentMode) => void;
}

export function ModeBadge({ mode, onSwitch }: Props) {
  const [open, setOpen] = useState(false);
  const cfg = MODE_FALLBACK[mode];

  return (
    <div className="mode-badge-wrap">
      <button
        type="button"
        className="mode-badge"
        onClick={() => setOpen(v => !v)}
        title="Switch agent mode (starts a new session)"
      >
        {MODE_ICONS[cfg.icon] ?? '🤖'}&nbsp;{cfg.label}
      </button>

      {open && (
        <div className="mode-badge-popover">
          <div className="mode-badge-popover-header">
            <span>Switch mode</span>
            <button type="button" className="canvas-widget-close" onClick={() => setOpen(false)}>
              <XIcon size={12} />
            </button>
          </div>
          <p className="mode-badge-popover-hint">Switching mode starts a new conversation.</p>
          <div className="mode-badge-options">
            {AGENT_MODES.map(m => {
              const c = MODE_FALLBACK[m];
              return (
                <button
                  key={m}
                  type="button"
                  className={`mode-badge-option${m === mode ? ' mode-badge-option--active' : ''}`}
                  onClick={() => { onSwitch(m); setOpen(false); }}
                >
                  <span className="mode-badge-option-icon">{MODE_ICONS[c.icon] ?? '🤖'}</span>
                  <span>
                    <span className="mode-badge-option-label">{c.label}</span>
                    <span className="mode-badge-option-desc">{c.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
