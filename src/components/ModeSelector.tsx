import { useEffect, useState } from 'react';
import { MODE_COLORS, ModeIconSvg } from '#/components/ModeIconSvg';
import { AGENT_MODES, type AgentMode, MODE_FALLBACK, type ModeConfig } from '#/lib/agentModes';

const HTTP_BASE =
  (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:18789';

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
            style={
              active
                ? {
                    borderColor: MODE_COLORS[cfg.icon],
                    background: `color-mix(in srgb, ${MODE_COLORS[cfg.icon]} 8%, var(--bg-primary))`,
                  }
                : undefined
            }
            onClick={() => onSelect(mode)}
          >
            <span className="mode-card-icon" style={{ color: MODE_COLORS[cfg.icon] }}>
              <ModeIconSvg iconKey={cfg.icon} size={28} />
            </span>
            <span className="mode-card-label">{cfg.label}</span>
            <span className="mode-card-desc">{cfg.description}</span>
          </button>
        );
      })}
    </div>
  );
}
