export const CHANNEL_COLORS = [
  "oklch(0.64 0.18 38)",
  "oklch(0.55 0.13 250)",
  "oklch(0.62 0.13 145)",
  "oklch(0.65 0.16 320)",
  "oklch(0.45 0.02 80)",
];

export function fmt(n: number, asPct = false, total = 1): string {
  if (asPct) {
    if (!total) return "0%";
    return ((n / total) * 100).toFixed(n < 1000 ? 1 : 0) + "%";
  }
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n);
}

export function sparklinePath(
  width: number,
  height: number,
  seed: number,
  up: boolean,
): { d: string; last: [number, number] } {
  const N = 14;
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const trend = up ? (i / (N - 1)) * 0.4 : -(i / (N - 1)) * 0.3;
    const noise = (rnd() - 0.5) * 0.25;
    const y = Math.max(0.1, Math.min(0.95, 0.4 + trend + noise));
    pts.push([(i / (N - 1)) * width, height - y * height]);
  }
  const d = pts
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(" ");
  return { d, last: pts[pts.length - 1] };
}
