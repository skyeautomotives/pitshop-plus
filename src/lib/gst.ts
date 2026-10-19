// GST on bills. The sums mirror the database's apply_bill_gst() exactly, in paise.

export const GST_RATES = [0, 5, 12, 18, 28, 40] as const;
export const DEFAULT_GST_RATE = 18;
/** Labour, painting and washing: maintenance and repair services. */
export const SERVICE_SAC = "9987";

/** exclusive: prices are typed before GST. inclusive: prices already include GST. */
export type GstMode = "exclusive" | "inclusive";

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const HSN_PATTERN = /^[0-9]{4,8}$/;

export const cleanGstin = (s: string) => s.replace(/\s/g, "").toUpperCase();
export const isGstin = (s: string) => GSTIN_PATTERN.test(cleanGstin(s));

/** n / d rounded half up, for whole numbers n >= 0 and d > 0 (exact, any size). */
function roundDiv(n: number, d: number): number {
  const N = BigInt(Math.round(n));
  const D = BigInt(Math.round(d));
  return Number((2n * N + D) / (2n * D));
}

export interface GstPart {
  /** Paise before GST. */
  taxable: number;
  /** Paise of GST. */
  gst: number;
}

export interface GstResult {
  /** One per item line, in order. */
  items: GstPart[];
  /** Labour, painting and washing together. */
  services: GstPart;
  taxable: number;
  gst: number;
  /** What the customer pays. */
  total: number;
  /** GST grouped by rate, for the tax summary. */
  byRate: { rate: number; taxable: number; gst: number }[];
}

function split(net: number, rate: number, mode: GstMode): GstPart {
  if (mode === "exclusive") return { taxable: net, gst: roundDiv(net * rate, 100) };
  const taxable = roundDiv(net * 100, 100 + rate);
  return { taxable, gst: net - taxable };
}

/**
 * GST for a bill, all amounts in paise. The discount is shared across the lines in proportion
 * to their amounts (items in order, then the services line, which takes what is left over).
 */
export function computeGst(
  items: { amount: number; rate: number }[],
  services: number,
  serviceRate: number,
  discount: number,
  mode: GstMode,
): GstResult {
  const gross = items.reduce((s, i) => s + i.amount, 0) + services;
  const last = services === 0 ? items.length - 1 : -1;
  let shared = 0;
  const parts = items.map((item, i) => {
    const share = i === last ? discount - shared : gross > 0 ? roundDiv(discount * item.amount, gross) : 0;
    shared += share;
    return split(Math.max(item.amount - share, 0), item.rate, mode);
  });
  const serviceParts = services > 0 ? split(Math.max(services - (discount - shared), 0), serviceRate, mode) : { taxable: 0, gst: 0 };

  const groups = new Map<number, { taxable: number; gst: number }>();
  const add = (rate: number, p: GstPart) => {
    const g = groups.get(rate) ?? { taxable: 0, gst: 0 };
    groups.set(rate, { taxable: g.taxable + p.taxable, gst: g.gst + p.gst });
  };
  items.forEach((item, i) => add(item.rate, parts[i]));
  if (services > 0) add(serviceRate, serviceParts);

  const taxable = parts.reduce((s, p) => s + p.taxable, 0) + serviceParts.taxable;
  const gst = parts.reduce((s, p) => s + p.gst, 0) + serviceParts.gst;
  return {
    items: parts,
    services: serviceParts,
    taxable,
    gst,
    total: taxable + gst,
    byRate: [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([rate, g]) => ({ rate, ...g })),
  };
}

/** CGST and SGST are half each; an odd paisa goes to CGST. */
export function halves(gst: number): { cgst: number; sgst: number } {
  const cgst = roundDiv(gst, 2);
  return { cgst, sgst: gst - cgst };
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? below100(rest) : ""].filter(Boolean).join(" ");
}

/** Whole rupees in words, Indian style: 125000 is "One Lakh Twenty Five Thousand". */
function rupeeWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${rupeeWords(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** An amount in words for the bill, e.g. "Rupees One Thousand Two Hundred and Fifty Paise Only". */
export function amountInWords(paise: number): string {
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${rupeeWords(r)}${p ? ` and ${below100(p)} Paise` : ""} Only`;
}
