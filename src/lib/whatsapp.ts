import { formatDate } from "./format";
import { formatINR, rupeesToPaise } from "./money";
import type { BillWithItems, ShopSettings } from "./types";
import { displayNumber, seqNumber } from "./format";

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

/** The bill as a WhatsApp message (*text* shows as bold in WhatsApp). */
export function billMessage(bill: BillWithItems, shop: ShopSettings | null): string {
  const items = [...bill.bill_items].sort((a, b) => a.position - b.position);
  const lines = [
    `*${shop?.shop_name || "Workshop"}*`,
    `Bill ${displayNumber(bill.bill_number)}`,
    "",
    `Customer: ${bill.customer_name}`,
    `Vehicle: ${bill.vehicle_reg}`,
    `Received: ${formatDate(bill.date_received)}`,
    `Delivered: ${formatDate(bill.delivered_on)}`,
    "",
  ];
  const complaints = [...(bill.complaints ?? [])].sort((a, b) => seqNumber(a.complaint_number) - seqNumber(b.complaint_number));
  if (complaints.length > 0) {
    lines.push("*Your complaints*");
    complaints.forEach((c) => lines.push(`- ${c.description}`));
    lines.push("");
  }
  if (items.length > 0) {
    lines.push("*Parts & work*");
    items.forEach((item, i) => {
      const qty = Number(item.quantity ?? 1);
      const amount = inr(item.line_total ?? item.price);
      lines.push(qty === 1 ? `${i + 1}. ${item.description}: ${amount}` : `${i + 1}. ${item.description}: ${qty} × ${inr(item.price)} = ${amount}`);
    });
    lines.push(`Items subtotal: ${inr(bill.items_subtotal)}`, "");
  }
  lines.push(`Labour charge: ${inr(bill.labour_charge)}`);
  if (bill.painting_charge !== null) lines.push(`Painting: ${inr(bill.painting_charge)}`);
  if (bill.washing_charge !== null) lines.push(`Washing: ${inr(bill.washing_charge)}`);
  if (Number(bill.discount) > 0)
    lines.push(`Discount${bill.discount_percent !== null ? ` (${Number(bill.discount_percent)}%)` : ""}: -${inr(bill.discount)}`);
  lines.push(`*Grand total: ${inr(bill.grand_total)}*`, "", "Thank you for your business.");
  if (shop?.phone) lines.push(`Contact: ${shop.phone}`);
  return lines.join("\n");
}

/** Link that opens WhatsApp (app on phones, WhatsApp Web on computers) with the message ready to send. */
export function whatsappLink(bill: BillWithItems, shop: ShopSettings | null): string | null {
  const number = whatsappNumber(bill.phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(billMessage(bill, shop))}`;
}
