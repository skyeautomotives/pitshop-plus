import { t, type Lang } from "../i18n";
import { billMoney } from "./payments";
import { formatINR, rupeesToPaise } from "./money";
import type { BillWithItems, ShopSettings } from "./types";
import { billCode } from "./format";

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

/**
 * The short message sent with the bill PDF (*text* shows as bold in WhatsApp).
 * Bills are always in English.
 */
export function billMessage(bill: BillWithItems, shop: ShopSettings | null): string {
  const lang: Lang = "en";
  const d = (key: Parameters<typeof t>[0], vars?: Record<string, string | number>) => t(key, vars, lang);
  const lines = [
    `*${shop?.shop_name || d("doc.workshop")}*`,
    d("doc.bill", { number: billCode(bill.bill_number, shop?.shop_name) }),
    d("doc.waVehicle", { reg: bill.vehicle_reg }),
    `*${d("doc.waGrandTotal", { amount: inr(bill.grand_total) })}*`,
  ];
  const money = billMoney(bill.grand_total, bill.complaints ?? [], bill.payments ?? []);
  if (money.status === "paid" && money.balance < bill.grand_total) lines.push(d("doc.waPaidInFull"));
  else if (money.status === "part-paid") lines.push(`*${d("doc.waBalance", { amount: inr(money.balance) })}*`);
  lines.push("", d("doc.thanks"));
  if (shop?.phone) lines.push(d("doc.waContact", { phone: shop.phone }));
  return lines.join("\n");
}

/** Opens the customer's WhatsApp chat (or the contact list, if the number can't be used) with the message ready. */
export function whatsappLink(bill: BillWithItems, shop: ShopSettings | null): string {
  const number = whatsappNumber(bill.phone);
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(billMessage(bill, shop))}`;
}
