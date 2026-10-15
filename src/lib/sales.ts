import { rupeesToPaise } from "./money";

/** The bill columns sales reports need. Amounts are rupees, as stored. */
export interface SaleRow {
  date_received: string;
  items_subtotal: number;
  labour_charge: number;
  painting_charge: number | null;
  washing_charge: number | null;
  grand_total: number;
  /** Rupees taken off the bill (grand_total is after it). */
  discount?: number;
  /** Staff login that created the bill. */
  created_by?: string | null;
}

/** Totals in paise. Spares = parts & items; services = painting + washing. Total is after discounts. */
export interface SalesSummary {
  bills: number;
  spares: number;
  labour: number;
  services: number;
  discount: number;
  total: number;
  /** Total without labour (spares + painting + washing). */
  excludingLabour: number;
}

export interface DaySales extends SalesSummary {
  date: string;
}

export function emptySummary(): SalesSummary {
  return { bills: 0, spares: 0, labour: 0, services: 0, discount: 0, total: 0, excludingLabour: 0 };
}

function add(s: SalesSummary, r: SaleRow): SalesSummary {
  const spares = rupeesToPaise(r.items_subtotal);
  const labour = rupeesToPaise(r.labour_charge);
  const services = rupeesToPaise(r.painting_charge ?? 0) + rupeesToPaise(r.washing_charge ?? 0);
  const total = rupeesToPaise(r.grand_total);
  const discount = rupeesToPaise(r.discount ?? 0);
  return {
    bills: s.bills + 1,
    spares: s.spares + spares,
    labour: s.labour + labour,
    services: s.services + services,
    discount: s.discount + discount,
    total: s.total + total,
    excludingLabour: s.excludingLabour + (total - labour),
  };
}

export function summarize(rows: SaleRow[]): SalesSummary {
  return rows.reduce(add, emptySummary());
}

/** "2026-10" -> number of days in that month. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** First and last date of a month, as yyyy-mm-dd. */
export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` };
}

/** One entry per calendar day of the month (days without bills are zero). */
export function salesByDay(rows: SaleRow[], month: string): DaySales[] {
  const byDate = new Map<string, SaleRow[]>();
  for (const r of rows) {
    if (!r.date_received.startsWith(month)) continue;
    byDate.set(r.date_received, [...(byDate.get(r.date_received) ?? []), r]);
  }
  return Array.from({ length: daysInMonth(month) }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    return { date, ...summarize(byDate.get(date) ?? []) };
  });
}

/** "2026-10" plus/minus whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** yyyy-mm-dd plus/minus whole days. */
export function shiftDay(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** One entry per day for `count` days ending on `to` (inclusive), oldest first. */
export function salesForLastDays(rows: SaleRow[], to: string, count: number): DaySales[] {
  const byDate = new Map<string, SaleRow[]>();
  for (const r of rows) byDate.set(r.date_received, [...(byDate.get(r.date_received) ?? []), r]);
  return Array.from({ length: count }, (_, i) => {
    const date = shiftDay(to, i - count + 1);
    return { date, ...summarize(byDate.get(date) ?? []) };
  });
}
