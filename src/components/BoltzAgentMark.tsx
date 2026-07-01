export function BoltzAgentMark({ size = 32, color = 'currentColor' }: { size?: number; color?: string }) {
  const cols = [0, 64.2871, 128.573, 192.859, 257.146];
  const rows = [0, 64.3264, 128.653, 192.98];
  const sw = 57.76; const sh = 57.80; const rx = 11.43;
  const squares: [number, number][] = [
    [0, 2],
    [1, 1], [1, 3],
    [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
    [3, 1], [3, 3],
  ];
  const vw = 314.905; const vh = 250.776;
  const scale = size / vh;
  return (
    <svg width={Math.round(vw * scale)} height={size} viewBox={`0 0 ${vw} ${vh}`} fill="none" aria-hidden>
      {squares.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={cols[c]} y={rows[r]} width={sw} height={sh} rx={rx} fill={color} />
      ))}
    </svg>
  );
}
