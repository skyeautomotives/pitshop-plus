// Amounts are handled as whole paise (₹1 = 100 paise) so totals never pick up
// floating-point rounding errors.

/** Largest amount accepted for a single field: ₹1 crore. */
export const MAX_PAISE = 1_00_00_000 * 100;

export type ParsedAmount =
  | { ok: true; paise: number }
  | { ok: false; reason: "empty" | "invalid" | "too-large" };

/** Parses what staff type ("1,250", "₹ 499.5", "80") into paise. */
export function parseAmount(raw: string): ParsedAmount {
  const s = raw.replace(/[,\s₹]/g, "");
  if (s === "") return { ok: false, reason: "empty" };
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m || (m[1] === "" && !m[2])) return { ok: false, reason: "invalid" };
  const whole = m[1].replace(/^0+(?=\d)/, "");
  if (whole.length > 8) return { ok: false, reason: "too-large" };
  const paise = Number(whole || "0") * 100 + Number(((m[2] ?? "") + "00").slice(0, 2));
  if (paise > MAX_PAISE) return { ok: false, reason: "too-large" };
  return { ok: true, paise };
}

/** Paise as the plain decimal string sent to the database, e.g. 45050 -> "450.50". */
export function paiseToDecimal(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** A database amount (rupees, e.g. 450.5) as paise. */
export function rupeesToPaise(rupees: number | string): number {
  return Math.round(Number(rupees) * 100);
}

/** Paise as an editable input value, e.g. 45000 -> "450", 45050 -> "450.50". */
export function paiseToInput(paise: number): string {
  return paiseToDecimal(paise).replace(/\.00$/, "");
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

/** Paise as Indian Rupees, e.g. 125000050 -> "₹12,50,000.50". */
export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}
