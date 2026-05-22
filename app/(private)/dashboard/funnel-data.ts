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
