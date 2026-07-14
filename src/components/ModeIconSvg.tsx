/**
 * SVG mode icons — line-art style from the BoltzAgent design token spec v1.0.
 * Uses currentColor so icons inherit the parent's text colour (mode accent).
 */

type Props = { size?: number; className?: string };

const STROKE_PROPS = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// Blue — knowledge / conversation
const GENERAL_COLOR = '#1473df';

/** Robot head icon */
export function GeneralModeIcon({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className} {...STROKE_PROPS}>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 8V4" />
      <circle cx="9" cy="14" r="1" />
      <circle cx="15" cy="14" r="1" />
    </svg>
  );
}

// Pink — creative canvas / mini-apps
const WIDGET_COLOR = '#ec4899';

/** Palette icon */
export function WidgetModeIcon({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className} {...STROKE_PROPS}>
      <circle cx="13.5" cy="6.5" r="1.5" />
      <circle cx="17.5" cy="10.5" r="1.5" />
      <circle cx="8.5" cy="7.5" r="1.5" />
      <circle cx="6.5" cy="12.5" r="1.5" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16c3.3 0 6-2.7 6-6 0-4.4-4.5-8-10-8z" />
    </svg>
  );
}

// Orange — productivity / documents
const WORKER_COLOR = '#f97316';

/** Document lines icon */
export function WorkerModeIcon({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className} {...STROKE_PROPS}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </svg>
  );
}

// Cyan — code execution / terminal
const CODER_COLOR = '#06b6d4';

/** Code chevrons icon */
export function CoderModeIcon({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className} {...STROKE_PROPS}>
      <polyline points="16,18 22,12 16,6" />
      <polyline points="8,6 2,12 8,18" />
    </svg>
  );
}

export const MODE_SVG_ICONS: Record<string, React.ComponentType<Props>> = {
  chat:     GeneralModeIcon,
  canvas:   WidgetModeIcon,
  document: WorkerModeIcon,
  code:     CoderModeIcon,
};

/** Accent colour per icon key */
export const MODE_COLORS: Record<string, string> = {
  chat:     GENERAL_COLOR,
  canvas:   WIDGET_COLOR,
  document: WORKER_COLOR,
  code:     CODER_COLOR,
};

/** Subtle fill (12% alpha) per icon key */
export const MODE_SUBTLE: Record<string, string> = {
  chat:     'rgba(20,115,223,0.12)',
  canvas:   'rgba(236,72,153,0.12)',
  document: 'rgba(249,115,22,0.12)',
  code:     'rgba(6,182,212,0.12)',
};

/** Border tint (22% alpha) per icon key */
export const MODE_BORDER: Record<string, string> = {
  chat:     'rgba(20,115,223,0.22)',
  canvas:   'rgba(236,72,153,0.22)',
  document: 'rgba(249,115,22,0.22)',
  code:     'rgba(6,182,212,0.22)',
};

export function ModeIconSvg({ iconKey, size = 18, className }: { iconKey: string; size?: number; className?: string }) {
  const Icon = MODE_SVG_ICONS[iconKey];
  if (!Icon) return null;
  return <Icon size={size} className={className} />;
}
