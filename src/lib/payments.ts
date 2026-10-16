// Money a customer pays on a bill after billing (0020), together with the advance taken
// on the complaints the bill addresses (0019). The bill's own grand total never changes:
// these only work out what is still to pay.
import { paiseToInput, parseAmount, rupeesToPaise } from "./money";
import { todayISO } from "./customer";
import type { BillPayment, PaymentMethod } from "./types";

export interface PaymentDraft {
  amount: string;
  method: PaymentMethod;
  paidOn: string;
  note: string;
}

export interface PaymentInput {
  /** Rupees. */
  amount: number;
  method: PaymentMethod;
  paid_on: string;
  note: string | null;
}

export interface BillMoney {
  /** Advance taken on the bill's complaints, rupees. */
  advance: number;
  /** Payments recorded on the bill, rupees. */
  paid: number;
  /** Still to pay, rupees (never below 0). */
  balance: number;
  /** Paid more than the bill (shown so staff can give change back), rupees. */
  extra: number;
  status: "unpaid" | "part-paid" | "paid";
}

/** What has been paid on a bill and what is left. */
export function billMoney(
  grandTotal: number,
  complaints: { advance_amount?: number | null }[],
  payments: Pick<BillPayment, "amount">[] = [],
): BillMoney {
  const advance = complaints.reduce((s, c) => s + (c.advance_amount ? rupeesToPaise(c.advance_amount) : 0), 0);
  const paid = payments.reduce((s, p) => s + rupeesToPaise(p.amount), 0);
  const left = rupeesToPaise(grandTotal) - advance - paid;
  const received = advance + paid;
  return {
    advance: advance / 100,
    paid: paid / 100,
    balance: Math.max(0, left) / 100,
    extra: Math.max(0, -left) / 100,
    status: left <= 0 ? "paid" : received > 0 ? "part-paid" : "unpaid",
  };
}

/** A new payment form: the balance as the amount, cash, today. */
export function emptyPayment(balance: number): PaymentDraft {
  return { amount: balance > 0 ? paiseToInput(rupeesToPaise(balance)) : "", method: "cash", paidOn: todayISO(), note: "" };
}

export function validatePayment(d: PaymentDraft, balance: number): { error: string | null; input: PaymentInput | null } {
  const a = parseAmount(d.amount);
  if (!a.ok) return { error: a.reason === "too-large" ? "That amount is too large." : "Enter the amount paid, e.g. 500.", input: null };
  if (a.paise === 0) return { error: "Enter the amount paid, e.g. 500.", input: null };
  if (a.paise > rupeesToPaise(balance))
    return { error: `That's more than the balance of ₹${paiseToInput(rupeesToPaise(balance))}.`, input: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.paidOn)) return { error: "Choose the date it was paid.", input: null };
  if (d.paidOn > todayISO()) return { error: "The payment date can't be in the future.", input: null };
  const note = d.note.trim();
  if (note.length > 200) return { error: "Keep the note under 200 characters.", input: null };
  return { error: null, input: { amount: a.paise / 100, method: d.method, paid_on: d.paidOn, note: note || null } };
}
