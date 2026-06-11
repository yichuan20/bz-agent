import { useEffect, useState } from 'react';
import { AGENT_MODES, MODE_FALLBACK, MODE_ICONS, type AgentMode, type ModeConfig } from '#/lib/agentModes';

const HTTP_BASE = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:5081';

interface Props {
  selected: AgentMode;
  onSelect: (mode: AgentMode) => void;
}

export function ModeSelector({ selected, onSelect }: Props) {
  const [configs, setConfigs] = useState<Record<AgentMode, ModeConfig>>(MODE_FALLBACK);

  useEffect(() => {
    fetch(`${HTTP_BASE}/agent-modes`)
      .then(r => r.json())
      .then((d: { modes?: Record<string, ModeConfig> }) => {
        if (d.modes) {
          setConfigs(prev => {
            const next = { ...prev };
            for (const [k, v] of Object.entries(d.modes!)) {
              if (AGENT_MODES.includes(k as AgentMode)) {
                next[k as AgentMode] = v as ModeConfig;
              }
            }
            return next;
          });
        }
      })
      .catch(() => null);
  }, []);

  return (
    <div className="mode-selector">
      {AGENT_MODES.map(mode => {
        const cfg = configs[mode];
        const active = selected === mode;
        return (
          <button
            key={mode}
            type="button"
            className={`mode-card${active ? ' mode-card--active' : ''}`}
            onClick={() => onSelect(mode)}
          >
            <span className="mode-card-icon">{MODE_ICONS[cfg.icon] ?? '🤖'}</span>
            <span className="mode-card-label">{cfg.label}</span>
            <span className="mode-card-desc">{cfg.description}</span>
          </button>
        );
      })}
    </div>
  );
}
