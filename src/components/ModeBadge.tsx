import { MODE_BORDER, MODE_COLORS, MODE_SUBTLE, ModeIconSvg } from '#/components/ModeIconSvg';
import { type AgentMode, MODE_FALLBACK } from '#/lib/agentModes';

interface Props {
  mode: AgentMode;
}

export function ModeBadge({ mode }: Props) {
  const cfg = MODE_FALLBACK[mode];
  const color = MODE_COLORS[cfg.icon] ?? 'var(--text-secondary)';
  const subtle = MODE_SUBTLE[cfg.icon] ?? 'transparent';
  const border = MODE_BORDER[cfg.icon] ?? 'var(--border-primary)';

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
