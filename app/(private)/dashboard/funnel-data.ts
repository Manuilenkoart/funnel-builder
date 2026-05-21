export type FunnelStep = {
  id: string;
  name: string;
  sub: string;
  users: number;
  time: string;
};

export const FUNNEL_DATA: FunnelStep[] = [
  { id: "visit", name: "Visit", sub: "Landed on site", users: 124800, time: "0:18" },
  { id: "engage", name: "Engage", sub: "Viewed pricing / docs", users: 41200, time: "1:42" },
  { id: "lead", name: "Lead", sub: "Submitted form", users: 9840, time: "0:48" },
  { id: "trial", name: "Trial / Demo", sub: "Started product trial", users: 3120, time: "4d 6h" },
  { id: "customer", name: "Customer", sub: "Paid subscription", users: 612, time: "—" },
];

export const CHANNELS = [
  { id: "organic", name: "Organic", cls: "dot-organic" },
  { id: "paid", name: "Paid", cls: "dot-paid" },
  { id: "email", name: "Email", cls: "dot-email" },
  { id: "social", name: "Social", cls: "dot-social" },
  { id: "direct", name: "Direct", cls: "dot-direct" },
] as const;

export const CHANNEL_COLORS = [
  "oklch(0.64 0.18 38)",
  "oklch(0.55 0.13 250)",
  "oklch(0.62 0.13 145)",
  "oklch(0.65 0.16 320)",
  "oklch(0.45 0.02 80)",
];

export const CHANNEL_SHARES: Record<string, number[]> = {
  visit:    [42, 24, 16, 11, 7],
  engage:   [38, 20, 22, 12, 8],
  lead:     [32, 18, 28, 12, 10],
  trial:    [28, 14, 32, 14, 12],
  customer: [22, 10, 38, 16, 14],
};

export function fmt(n: number, asPct = false, total = 1): string {
  if (asPct) return ((n / total) * 100).toFixed(n < 1000 ? 1 : 0) + "%";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n);
}

export function pct(a: number, b: number): string {
  return ((a / b) * 100).toFixed(b > 100000 ? 0 : 1) + "%";
}

export function sparklinePath(
  width: number,
  height: number,
  seed: number,
  up: boolean
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
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  return { d, last: pts[pts.length - 1] };
}
