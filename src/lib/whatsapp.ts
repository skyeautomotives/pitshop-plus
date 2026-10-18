import { t, type Lang } from "../i18n";
import { complaintText } from "./jobCard";
import { paymentMethodLabel } from "./complaint";
import { billMoney } from "./payments";
import { formatINR, rupeesToPaise } from "./money";
import type { BillWithItems, ShopSettings } from "./types";
import { displayNumber, formatDate, seqNumber } from "./format";

/**
 * Turns a phone number as typed into the international digits WhatsApp needs.
 * Indian numbers without a country code get 91 added: "98765 43210" and
 * "098765 43210" both become "919876543210". Returns null if it can't tell.
 */
export function whatsappNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length >= 11 && digits.length <= 13) return digits;
  return null;
}

const inr = (rupees: number) => formatINR(rupeesToPaise(rupees));

/** The bill as a WhatsApp message (*text* shows as bold in WhatsApp), in the workshop's language for customers. */
export function billMessage(bill: BillWithItems, shop: ShopSettings | null): string {
  const lang: Lang = shop?.customer_language ?? "en";
  const d = (key: Parameters<typeof t>[0], vars?: Record<string, string | number>) => t(key, vars, lang);
  const date = (iso: string) => formatDate(iso, lang);
  const items = [...bill.bill_items].sort((a, b) => a.position - b.position);
  const lines = [
    `*${shop?.shop_name || d("doc.workshop")}*`,
    d("doc.bill", { number: displayNumber(bill.bill_number, lang) }),
    "",
    d("doc.waCustomer", { name: bill.customer_name }),
    d("doc.waVehicle", { reg: bill.vehicle_reg }),
    d("doc.received", { date: date(bill.date_received) }),
    d("doc.delivered", { date: date(bill.delivered_on) }),
    "",
  ];
  const complaints = [...(bill.complaints ?? [])].sort((a, b) => seqNumber(a.complaint_number) - seqNumber(b.complaint_number));
  if (complaints.length > 0) {
    lines.push(`*${d("doc.waComplaints")}*`);
    complaints.forEach((c) => lines.push(`- ${complaintText({ jobs: c.jobs, description: c.note ?? c.description }, lang)}`));
    lines.push("");
  }
  if (items.length > 0) {
    lines.push(`*${d("doc.waParts")}*`);
    items.forEach((item, i) => {
      const qty = Number(item.quantity ?? 1);
      const amount = inr(item.line_total ?? item.price);
      lines.push(qty === 1 ? `${i + 1}. ${item.description}: ${amount}` : `${i + 1}. ${item.description}: ${qty} × ${inr(item.price)} = ${amount}`);
    });
    lines.push(d("doc.waItemsSubtotal", { amount: inr(bill.items_subtotal) }), "");
  }
  lines.push(d("doc.waLabour", { amount: inr(bill.labour_charge) }));
  if (bill.painting_charge !== null) lines.push(d("doc.waPainting", { amount: inr(bill.painting_charge) }));
  if (bill.washing_charge !== null) lines.push(d("doc.waWashing", { amount: inr(bill.washing_charge) }));
  if (Number(bill.discount) > 0)
    lines.push(
      bill.discount_percent !== null
        ? d("doc.waDiscountPercent", { percent: Number(bill.discount_percent), amount: inr(bill.discount) })
        : d("doc.waDiscount", { amount: inr(bill.discount) }),
    );
  lines.push(`*${d("doc.waGrandTotal", { amount: inr(bill.grand_total) })}*`);
  const payments = bill.payments ?? [];
  const money = billMoney(bill.grand_total, complaints, payments);
  if (money.advance > 0) lines.push(d("doc.waAdvance", { amount: inr(money.advance) }));
  payments.forEach((p) =>
    lines.push(d("doc.waPaid", { date: date(p.paid_on), method: paymentMethodLabel(p.method, lang), amount: inr(p.amount) })),
  );
  if (money.advance > 0 || payments.length > 0)
    lines.push(money.status === "paid" ? `*${d("doc.waPaidInFull")}*` : `*${d("doc.waBalance", { amount: inr(money.balance) })}*`);
  lines.push("", d("doc.thanks"));
  if (shop?.phone) lines.push(d("doc.waContact", { phone: shop.phone }));
  return lines.join("\n");
}

/** Link that opens WhatsApp (app on phones, WhatsApp Web on computers) with the message ready to send. */
export function whatsappLink(bill: BillWithItems, shop: ShopSettings | null): string | null {
  const number = whatsappNumber(bill.phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(billMessage(bill, shop))}`;
}
