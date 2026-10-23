// Credit on a bill: the balance the customer will pay later, by a due date.
import { t, tn, type Lang } from "../i18n";
import { billCode } from "./format";
import { formatINR, rupeesToPaise } from "./money";
import { billMoney } from "./payments";
import type { BillWithComplaints, ShopSettings } from "./types";
import { whatsappNumber } from "./whatsapp";

/** What set_bill_credit changes: a key that is present is set, null clears it. */
export interface CreditPatch {
  due_on?: string | null;
  note?: string | null;
  reminded_on?: string | null;
}

/** Quick choices for the due date, in days from today. */
export const CREDIT_PRESETS = [7, 15, 30];

/** Credit due within this many days shows on the dashboard. */
export const REMIND_WITHIN_DAYS = 7;

const DAY = 86_400_000;
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** yyyy-mm-dd plus n days. */
export function addDays(iso: string, n: number): string {
  return new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);
}

/** Days from today to the due date: negative when overdue. */
export function daysUntil(dueOn: string, today: string): number {
  return Math.round((utc(dueOn) - utc(today)) / DAY);
}

export type CreditStatus = "overdue" | "today" | "soon" | "later";

export function creditStatus(dueOn: string, today: string): CreditStatus {
  const d = daysUntil(dueOn, today);
  return d < 0 ? "overdue" : d === 0 ? "today" : d <= REMIND_WITHIN_DAYS ? "soon" : "later";
}

/** "Overdue by 3 days", "Due today", "Due in 5 days". */
export function creditDueText(dueOn: string, today: string): string {
  const d = daysUntil(dueOn, today);
  if (d < 0) return tn("credit.overdueBy", -d);
  if (d === 0) return t("credit.dueToday");
  return tn("credit.dueIn", d);
}

export function validateCredit(dueOn: string, note: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn) || Number.isNaN(utc(dueOn))) return t("credit.dateMissing");
  if (note.trim().length > 200) return t("credit.noteTooLong");
  return null;
}

export interface CreditReminder {
  bill: BillWithComplaints;
  balance: number;
  dueOn: string;
  status: CreditStatus;
}

/** Unpaid bills on credit that are overdue or due soon, the most overdue first. */
export function creditReminders(bills: BillWithComplaints[], today: string): CreditReminder[] {
  return bills
    .flatMap((bill) => {
      if (!bill.credit_due_on) return [];
      const m = billMoney(bill.grand_total, bill.complaints ?? [], bill.payments ?? []);
      const status = creditStatus(bill.credit_due_on, today);
      if (m.balance <= 0 || status === "later") return [];
      return [{ bill, balance: m.balance, dueOn: bill.credit_due_on, status }];
    })
    .sort((a, b) => (a.dueOn === b.dueOn ? a.balance - b.balance : a.dueOn < b.dueOn ? -1 : 1));
}

/** The reminder sent to the customer on WhatsApp (in English, like bills). */
export function creditReminderMessage(r: CreditReminder, shop: ShopSettings | null, today: string): string {
  const lang: Lang = "en";
  const d = (key: Parameters<typeof t>[0], vars?: Record<string, string | number>) => t(key, vars, lang);
  const date = new Date(`${r.dueOn}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const lines = [
    d("doc.waReminderHello", { name: r.bill.customer_name }),
    "",
    d("doc.waReminderBody", {
      shop: shop?.shop_name || d("doc.workshop"),
      amount: formatINR(rupeesToPaise(r.balance)),
      number: billCode(r.bill.bill_number, shop?.shop_name),
      reg: r.bill.vehicle_reg,
    }),
    daysUntil(r.dueOn, today) < 0 ? d("doc.waReminderWasDue", { date }) : d("doc.waReminderDue", { date }),
    "",
    d("doc.waReminderThanks"),
  ];
  if (shop?.phone) lines.push(d("doc.waContact", { phone: shop.phone }));
  return lines.join("\n");
}

/** Opens the customer's WhatsApp chat with the reminder ready to send. */
export function creditReminderLink(r: CreditReminder, shop: ShopSettings | null, today: string): string {
  return `https://wa.me/${whatsappNumber(r.bill.phone) ?? ""}?text=${encodeURIComponent(creditReminderMessage(r, shop, today))}`;
}
