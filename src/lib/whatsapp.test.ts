import { describe, expect, it } from "vitest";
import type { BillWithItems } from "./types";
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

const shop = { shop_name: "Sharma Motors", address: null, phone: "080 1234 5678", allow_zero_labour: false };

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
  it("lists items in order, only the charges that apply, and the total", () => {
    const msg = billMessage(bill, shop);
    expect(msg).toContain("*Sharma Motors*\nBill #12");
    expect(msg).toContain("1. Brake pads: ₹1,250.00\n2. Engine oil 3L: ₹899.50");
    expect(msg).toContain("Washing: ₹250.00");
    expect(msg).not.toContain("Painting");
    expect(msg).not.toContain("Expected pickup");
    expect(msg).toContain("*Grand total: ₹2,999.50*");
    expect(msg).toContain("Contact: 080 1234 5678");
  });
});

describe("whatsappLink", () => {
  it("builds a wa.me link with the encoded message", () => {
    const link = whatsappLink(bill, shop)!;
    expect(link.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(decodeURIComponent(link.split("?text=")[1])).toBe(billMessage(bill, shop));
  });
});

describe("billMessage with quantities", () => {
  it("shows quantity x rate for items bought more than once", () => {
    const withQty = {
      ...bill,
      bill_items: [{ id: "1", bill_id: "b1", position: 0, description: "Spark plug", quantity: 4, price: 180, line_total: 720 }],
    };
    expect(billMessage(withQty, shop)).toContain("1. Spark plug: 4 × ₹180.00 = ₹720.00");
  });
});
