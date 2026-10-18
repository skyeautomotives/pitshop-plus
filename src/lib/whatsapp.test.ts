import { describe, expect, it } from "vitest";
import type { BillWithItems } from "./types";
import { setLang } from "../i18n";
import { billMessage, whatsappLink, whatsappNumber } from "./whatsapp";

const bill: BillWithItems = {
  id: "b1",
  bill_number: 12,
  customer_name: "Ravi Kumar",
  address: null,
  phone: "98765 43210",
  vehicle_reg: "KA 01 AB 1234",
  vehicle_reg_key: "KA01AB1234",
  complaints: [],
  date_received: "2026-10-14",
  expected_pickup: null,
  delivered_on: "2026-10-15",
  discount: 0,
  discount_percent: null,
  labour_charge: 600,
  painting_charge: null,
  washing_charge: 250,
  items_subtotal: 2149.5,
  grand_total: 2999.5,
  created_at: "",
  updated_at: "",
  bill_items: [
    { id: "2", bill_id: "b1", position: 1, description: "Engine oil 3L", quantity: 1, price: 899.5, line_total: 899.5 },
    { id: "1", bill_id: "b1", position: 0, description: "Brake pads", quantity: 1, price: 1250, line_total: 1250 },
  ],
};

const shop = { shop_name: "Sharma Motors", address: null, phone: "080 1234 5678", allow_zero_labour: false, vehicle_type: null };

describe("whatsappNumber", () => {
  it("adds India's country code to 10-digit numbers", () => {
    expect(whatsappNumber("98765 43210")).toBe("919876543210");
    expect(whatsappNumber("098765-43210")).toBe("919876543210");
  });
  it("keeps numbers that already have a country code", () => {
    expect(whatsappNumber("+91 98765 43210")).toBe("919876543210");
    expect(whatsappNumber("+971 50 123 4567")).toBe("971501234567");
  });
  it("returns null for numbers it can't use", () => {
    expect(whatsappNumber("12345")).toBeNull();
  });
});

describe("billMessage", () => {
  it("is a short note to go with the PDF: workshop, bill, vehicle and total", () => {
    const msg = billMessage(bill, shop);
    expect(msg).toBe(
      "*Sharma Motors*\nBill SM-0012\nVehicle: KA 01 AB 1234\n*Grand total: ₹2,999.50*\n\nThank you for your business.\nContact: 080 1234 5678",
    );
  });

  it("adds the balance when part is paid, or says it is paid in full", () => {
    const part = { ...bill, payments: [{ id: "p1", amount: 1000, method: "cash" as const, paid_on: "2026-10-15", note: null, recorded_by: null, recorded_by_name: null, created_at: "" }] };
    expect(billMessage(part, shop)).toContain("*Balance to pay: ₹1,999.50*");
    const full = { ...bill, payments: [{ ...part.payments[0], amount: 2999.5 }] };
    expect(billMessage(full, shop)).toContain("Paid in full. Thank you!");
  });

  it("stays in English whatever language the app is in", () => {
    setLang("ml");
    expect(billMessage(bill, shop)).toContain("*Grand total: ₹2,999.50*");
    setLang("en");
  });
});

describe("whatsappLink", () => {
  it("opens the customer's chat with the encoded message", () => {
    const link = whatsappLink(bill, shop);
    expect(link.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(decodeURIComponent(link.split("?text=")[1])).toBe(billMessage(bill, shop));
  });

  it("lets the person pick the contact when the number can't be used", () => {
    expect(whatsappLink({ ...bill, phone: "12345" }, shop).startsWith("https://wa.me/?text=")).toBe(true);
  });
});
