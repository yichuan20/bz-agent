import { MODE_FALLBACK, type AgentMode } from '#/lib/agentModes';
import { ModeIconSvg, MODE_COLORS, MODE_SUBTLE, MODE_BORDER } from '#/components/ModeIconSvg';

interface Props {
  mode: AgentMode;
}

export function ModeBadge({ mode }: Props) {
  const cfg   = MODE_FALLBACK[mode];
  const color  = MODE_COLORS[cfg.icon]  ?? 'var(--text-secondary)';
  const subtle = MODE_SUBTLE[cfg.icon]  ?? 'transparent';
  const border = MODE_BORDER[cfg.icon]  ?? 'var(--border-primary)';

  return (
    <div className="mode-badge-wrap">
      <span
        className="mode-badge"
        style={{
          color,
          background: subtle,
          borderColor: border,
          cursor: 'default',
        }}
      >
        <ModeIconSvg iconKey={cfg.icon} size={13} />
        {cfg.label}
      </span>
    </div>
  );
}
