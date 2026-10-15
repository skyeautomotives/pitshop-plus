/** ₹ amounts for axis labels in Indian units: ₹950, ₹12k, ₹1.5L. */
export function compactINR(paise: number): string {
  const r = paise / 100;
  if (r >= 1_00_000) return `₹${+(r / 1_00_000).toFixed(1)}L`;
  if (r >= 1_000) return `₹${+(r / 1_000).toFixed(1)}k`;
  return `₹${Math.round(r)}`;
}

/** Rounds the axis maximum up to a tidy number (1, 2, 2.5, 5 × 10^n). */
export function niceMax(v: number): number {
  if (v <= 0) return 100_00;
  const exp = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * exp >= v)!;
  return step * exp;
}

/** Bar with rounded top corners, square at the baseline. */
export function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
