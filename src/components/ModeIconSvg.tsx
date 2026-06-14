/**
 * SVG mode icons — Boltzbit grid-block visual language, each mode with its own accent colour.
 *
 * Grid: 28×28 blocks, 6px gaps, rx=5 — viewBox 96×96 (3 cols × 3 rows)
 * Colours are fixed (not currentColor) so icons stay legible on any background.
 */

const B = 28;
const G = 6;
const R = 5;
const S = B + G;

function blk(col: number, row: number, fill: string) {
  return <rect key={`${col}-${row}`} x={col*S} y={row*S} width={B} height={B} rx={R} fill={fill} />;
}

type Props = { size?: number; className?: string };

// Blue — knowledge / conversation
const GENERAL_COLOR = '#1473DF';

/**
 *  ■ ■ ■   speech-bubble shape
 *  ■ ■ ■
 *  ■ · ·
 */
export function GeneralModeIcon({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden className={className}>
      {blk(0,0,GENERAL_COLOR)}{blk(1,0,GENERAL_COLOR)}{blk(2,0,GENERAL_COLOR)}
      {blk(0,1,GENERAL_COLOR)}{blk(1,1,GENERAL_COLOR)}{blk(2,1,GENERAL_COLOR)}
      {blk(0,2,GENERAL_COLOR)}
    </svg>
  );
}

// Violet — creative canvas / mini-apps
const WIDGET_COLOR  = '#7C3AED';

/**
 *  ■ ■ ·   offset tile pairs = dashboard
 *  · ■ ■
 *  ■ ■ ·
 */
export function WidgetModeIcon({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden className={className}>
      {blk(0,0,WIDGET_COLOR)}{blk(1,0,WIDGET_COLOR)}
      {blk(1,1,WIDGET_COLOR)}{blk(2,1,WIDGET_COLOR)}
      {blk(0,2,WIDGET_COLOR)}{blk(1,2,WIDGET_COLOR)}
    </svg>
  );
}

// Emerald — productivity / documents
const WORKER_COLOR  = '#059669';

/**
 *  ■ ■ ■   lines of decreasing length = document
 *  ■ ■ ·
 *  ■ · ·
 */
export function WorkerModeIcon({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden className={className}>
      {blk(0,0,WORKER_COLOR)}{blk(1,0,WORKER_COLOR)}{blk(2,0,WORKER_COLOR)}
      {blk(0,1,WORKER_COLOR)}{blk(1,1,WORKER_COLOR)}
      {blk(0,2,WORKER_COLOR)}
    </svg>
  );
}

// Amber — code execution / terminal
const CODER_COLOR   = '#D97706';

/**
 *  ■ · ·   forward staircase = code indentation
 *  ■ ■ ·
 *  · ■ ■
 */
export function CoderModeIcon({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden className={className}>
      {blk(0,0,CODER_COLOR)}
      {blk(0,1,CODER_COLOR)}{blk(1,1,CODER_COLOR)}
      {blk(1,2,CODER_COLOR)}{blk(2,2,CODER_COLOR)}
    </svg>
  );
}

export const MODE_SVG_ICONS: Record<string, React.ComponentType<Props>> = {
  chat:     GeneralModeIcon,
  canvas:   WidgetModeIcon,
  document: WorkerModeIcon,
  code:     CoderModeIcon,
};

/** Accent colours exposed for use in badges, borders, etc. */
export const MODE_COLORS: Record<string, string> = {
  chat:     GENERAL_COLOR,
  canvas:   WIDGET_COLOR,
  document: WORKER_COLOR,
  code:     CODER_COLOR,
};

export function ModeIconSvg({ iconKey, size = 18, className }: { iconKey: string; size?: number; className?: string }) {
  const Icon = MODE_SVG_ICONS[iconKey];
  if (!Icon) return null;
  return <Icon size={size} className={className} />;
}
