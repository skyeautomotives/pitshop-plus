import { describe, expect, it } from "vitest";
import { billToDraft, computeTotals, emptyBill, newItem, validateBill, type BillDraft } from "./bill";
import { formatINR, parseAmount } from "./money";
import type { BillWithItems } from "./types";

function filled(overrides: Partial<BillDraft> = {}): BillDraft {
  return {
    ...emptyBill(),
    customerName: "Ravi Kumar",
    address: "12 MG Road, Bengaluru",
    phone: "98765 43210",
    vehicleReg: "ka 01 ab 1234",
    dateReceived: "2026-10-14",
    expectedPickup: "2026-10-16",
    deliveredOn: "2026-10-16",
    items: [newItem("Brake pads", "1,250"), newItem("Engine oil 3L", "899.50")],
    labour: "600",
    ...overrides,
  };
}

const strict = { allowZeroLabour: false };

describe("parseAmount", () => {
  it("accepts commas, ₹ and up to two decimals", () => {
    expect(parseAmount("1,250")).toEqual({ ok: true, paise: 125000 });
    expect(parseAmount("₹ 899.5")).toEqual({ ok: true, paise: 89950 });
    expect(parseAmount(".75")).toEqual({ ok: true, paise: 75 });
    expect(parseAmount("0")).toEqual({ ok: true, paise: 0 });
  });
  it("rejects bad input", () => {
    expect(parseAmount("")).toEqual({ ok: false, reason: "empty" });
    expect(parseAmount("abc")).toEqual({ ok: false, reason: "invalid" });
    expect(parseAmount("-5")).toEqual({ ok: false, reason: "invalid" });
    expect(parseAmount("1.999")).toEqual({ ok: false, reason: "invalid" });
    expect(parseAmount(".")).toEqual({ ok: false, reason: "invalid" });
    expect(parseAmount("123456789")).toEqual({ ok: false, reason: "too-large" });
  });
});

describe("formatINR", () => {
  it("uses Indian grouping", () => {
    expect(formatINR(125000050)).toBe("₹12,50,000.50");
  });
});

describe("computeTotals", () => {
  it("adds items, labour and only the selected optional services", () => {
    const d = filled({
      painting: { selected: true, amount: "2000" },
      washing: { selected: false, amount: "300" },
    });
    expect(computeTotals(d)).toEqual({
      itemsSubtotal: 214950,
      labour: 60000,
      painting: 200000,
      washing: 0,
      gross: 474950,
      discount: 0,
      gst: null,
      grandTotal: 474950,
    });
  });
  it("counts invalid amounts as zero while typing", () => {
    expect(computeTotals(filled({ labour: "abc" })).grandTotal).toBe(214950);
  });
});

describe("GST bills", () => {
  const gst = (patch: Partial<BillDraft> = {}) => filled({ gstMode: "exclusive", ...patch });

  it("adds GST on top and sends each line's rate and HSN", () => {
    const d = gst();
    d.items[0].hsn = "8708";
    const { errors, payload } = validateBill(d, { ...strict, gstin: "32ABCDE1234F1Z5" });
    expect(errors).toEqual({});
    expect(payload?.bill.gst_mode).toBe("exclusive");
    expect(payload?.bill.gstin).toBe("32ABCDE1234F1Z5");
    expect(payload?.items[0]).toMatchObject({ gst_rate: "18", hsn: "8708" });
    // 2149.50 of parts + 600 labour, 18% on all of it.
    expect(computeTotals(d).grandTotal).toBe(Math.round(274950 * 1.18));
  });

  it("leaves the total as typed when prices include GST", () => {
    const totals = computeTotals(gst({ gstMode: "inclusive" }));
    expect(totals.grandTotal).toBe(274950);
    expect(totals.gst!.taxable + totals.gst!.gst).toBe(274950);
  });

  it("checks HSN codes and the customer GSTIN", () => {
    const d = gst({ customerGstin: "12345" });
    d.items[0].hsn = "87A";
    const { errors } = validateBill(d, strict);
    expect(errors.customerGstin).toBeTruthy();
    expect(errors[`item-${d.items[0].key}-hsn`]).toBeTruthy();
  });

  it("ignores GST details on plain bills", () => {
    const d = filled({ customerGstin: "12345" });
    expect(validateBill(d, strict).errors).toEqual({});
    expect(validateBill(d, strict).payload?.items[0]).not.toHaveProperty("gst_rate");
  });
});

describe("validateBill", () => {
  it("builds the payload for a valid bill with several items", () => {
    const { errors, payload } = validateBill(filled({ washing: { selected: true, amount: "250" } }), strict);
    expect(errors).toEqual({});
    expect(payload).toEqual({
      bill: {
        customer_name: "Ravi Kumar",
        address: "12 MG Road, Bengaluru",
        phone: "98765 43210",
        vehicle_reg: "KA 01 AB 1234",
        date_received: "2026-10-14",
        expected_pickup: "2026-10-16",
        delivered_on: "2026-10-16",
        labour_charge: "600.00",
        painting_charge: null,
        washing_charge: "250.00",
        discount: "0.00",
        discount_percent: null,
        gst_mode: null,
        customer_gstin: null,
        service_gst_rate: null,
        gstin: null,
        direct_sale: false,
      },
      items: [
        { description: "Brake pads", quantity: "1.00", price: "1250.00" },
        { description: "Engine oil 3L", quantity: "1.00", price: "899.50" },
      ],
      complaintIds: [],
    });
  });

  it("passes linked complaints through without duplicates, and doesn't require any", () => {
    expect(validateBill(filled({ complaintIds: ["c1", "c2", "c1"] }), strict).payload?.complaintIds).toEqual(["c1", "c2"]);
    expect(validateBill(filled({ complaintIds: [] }), strict).errors).toEqual({});
  });

  it("requires a labour charge", () => {
    expect(validateBill(filled({ labour: "" }), strict).errors.labour).toBe("Enter the labour charge.");
    expect(validateBill(filled({ labour: "" }), strict).payload).toBeNull();
  });

  it("rejects zero labour unless the workshop allows it", () => {
    expect(validateBill(filled({ labour: "0" }), strict).errors.labour).toMatch(/more than ₹0/);
    const allowed = validateBill(filled({ labour: "0" }), { allowZeroLabour: true });
    expect(allowed.errors).toEqual({});
    expect(allowed.payload?.bill.labour_charge).toBe("0.00");
  });

  it("does not require painting or washing, but needs a charge when ticked", () => {
    expect(validateBill(filled(), strict).payload).not.toBeNull();
    const r = validateBill(filled({ painting: { selected: true, amount: "" } }), strict);
    expect(r.errors.painting).toBe("Enter the painting charge. Or untick Painting.");
    expect(r.payload).toBeNull();
  });

  it("ignores blank item rows but flags half-filled ones", () => {
    const blank = newItem();
    const half = newItem("Clutch plate", "");
    const r = validateBill(filled({ items: [blank, half] }), strict);
    expect(Object.keys(r.errors)).toEqual([`item-${half.key}-price`]);
    const ok = validateBill(filled({ items: [blank] }), strict);
    expect(ok.payload?.items).toEqual([]);
  });

  it("checks required customer and vehicle fields", () => {
    const r = validateBill(emptyBill(), strict);
    expect(Object.keys(r.errors).sort()).toEqual(["customerName", "labour", "vehicleReg"]);
  });

  it("a direct sale has no labour charge", () => {
    const r = validateBill(filled({ directSale: true, labour: "" }), strict);
    expect(r.errors.labour).toBeUndefined();
    expect(r.payload?.bill).toMatchObject({ labour_charge: "0.00", direct_sale: true });
    // Labour typed before switching is ignored, in the saved bill and in the total on screen.
    expect(validateBill(filled({ directSale: true, labour: "500" }), strict).payload?.bill.labour_charge).toBe("0.00");
    expect(computeTotals(filled({ directSale: true, labour: "500" })).labour).toBe(0);
    // A normal bill still needs it.
    expect(validateBill(filled({ labour: "" }), strict).errors.labour).toBeTruthy();
    expect(validateBill(filled({ labour: "300" }), strict).payload?.bill.direct_sale).toBe(false);
  });

  it("the phone number is optional, but one that is given must be valid", () => {
    const empty = validateBill(filled({ phone: "" }), strict);
    expect(empty.errors.phone).toBeUndefined();
    expect(empty.payload?.bill.phone).toBe("");
    expect(validateBill(filled({ phone: "12345" }), strict).errors.phone).toBeTruthy();
  });

  it("rejects a pickup date before the received date", () => {
    const r = validateBill(filled({ expectedPickup: "2026-10-13" }), strict);
    expect(r.errors.expectedPickup).toMatch(/before/);
  });
});

describe("billToDraft", () => {
  it("round-trips a saved bill into editable form state", () => {
    const saved: BillWithItems = {
      id: "b1",
      bill_number: 7,
      customer_name: "Ravi Kumar",
      address: null,
      phone: "9876543210",
      vehicle_reg: "KA01AB1234",
      vehicle_reg_key: "KA01AB1234",
      date_received: "2026-10-14",
      expected_pickup: null,
      delivered_on: "2026-10-15",
      discount: 0,
      discount_percent: null,
      labour_charge: 600,
      painting_charge: null,
      washing_charge: 250.5,
      items_subtotal: 1250,
      grand_total: 2100.5,
      created_at: "",
      updated_at: "",
      bill_items: [{ id: "x", bill_id: "b1", position: 0, description: "Brake pads", quantity: 1, price: 1250, line_total: 1250 }],
      complaints: [{ id: "c1", complaint_number: 3, description: "Brake noise", status: "open", attended_by: null, reported_on: "2026-10-14" }],
    };
    const d = billToDraft(saved);
    expect(d.items.map((i) => [i.description, i.price])).toEqual([["Brake pads", "1250"]]);
    expect(d.washing).toEqual({ selected: true, amount: "250.50" });
    expect(d.painting.selected).toBe(false);
    expect(d.complaintIds).toEqual(["c1"]);
    expect(computeTotals(d).grandTotal).toBe(210050);
  });
});

describe("delivery date", () => {
  it("defaults to today, the bill date", () => {
    expect(emptyBill().deliveredOn).toBe(emptyBill().dateReceived);
  });

  it("can't be before the date received", () => {
    expect(validateBill(filled({ deliveredOn: "2026-10-13" }), strict).errors.deliveredOn).toMatch(/before/);
    expect(validateBill(filled({ deliveredOn: "2026-10-14" }), strict).errors.deliveredOn).toBeUndefined();
  });
});

describe("discount", () => {
  // filled(): items ₹2,149.50 + labour ₹600 = ₹2,749.50 before discount.
  it("takes a rupee amount off the total", () => {
    const d = filled({ discount: { mode: "amount", value: "249.50" } });
    expect(computeTotals(d)).toMatchObject({ gross: 274950, discount: 24950, grandTotal: 250000 });
    expect(validateBill(d, strict).payload?.bill).toMatchObject({ discount: "249.50", discount_percent: null });
  });

  it("takes a percentage of the total, rounded to the paisa", () => {
    const d = filled({ discount: { mode: "percent", value: "10" } });
    expect(computeTotals(d)).toMatchObject({ discount: 27495, grandTotal: 247455 });
    expect(validateBill(d, strict).payload?.bill).toMatchObject({ discount: "274.95", discount_percent: "10.00" });
  });

  it("is optional", () => {
    expect(validateBill(filled({ discount: { mode: "amount", value: "" } }), strict).payload?.bill.discount).toBe("0.00");
  });

  it("can't be more than the bill or over 100%", () => {
    expect(validateBill(filled({ discount: { mode: "amount", value: "5000" } }), strict).errors.discount).toMatch(/more than/);
    expect(validateBill(filled({ discount: { mode: "percent", value: "120" } }), strict).errors.discount).toMatch(/between 0 and 100/);
    expect(validateBill(filled({ discount: { mode: "amount", value: "abc" } }), strict).errors.discount).toBeTruthy();
  });

  it("round-trips a saved percentage discount for editing", () => {
    const d = billToDraft({
      id: "b",
      bill_number: 1,
      customer_name: "A",
      address: null,
      phone: "9876543210",
      vehicle_reg: "KA01AB1234",
      vehicle_reg_key: "KA01AB1234",
      date_received: "2026-10-14",
      expected_pickup: null,
      delivered_on: "2026-10-15",
      labour_charge: 600,
      painting_charge: null,
      washing_charge: null,
      items_subtotal: 0,
      discount: 60,
      discount_percent: 10,
      grand_total: 540,
      created_at: "",
      updated_at: "",
      bill_items: [],
      complaints: [],
    });
    expect(d.discount).toEqual({ mode: "percent", value: "10" });
    expect(d.deliveredOn).toBe("2026-10-15");
  });
});

describe("quantity", () => {
  it("multiplies quantity by unit price, rounding to the paisa", () => {
    const d = filled({ items: [newItem("Spark plug", "180", "4"), newItem("Engine oil (litre)", "433.33", "1.5")] });
    // 4 x 180 = 720.00; 1.5 x 433.33 = 649.995 -> 650.00
    expect(computeTotals(d).itemsSubtotal).toBe(72000 + 65000);
    expect(validateBill(d, strict).payload?.items).toEqual([
      { description: "Spark plug", quantity: "4.00", price: "180.00" },
      { description: "Engine oil (litre)", quantity: "1.50", price: "433.33" },
    ]);
  });

  it("treats a blank quantity as 1 and rejects zero or nonsense", () => {
    expect(validateBill(filled({ items: [newItem("Bulb", "50", "")] }), strict).payload?.items[0].quantity).toBe("1.00");
    const zero = newItem("Bulb", "50", "0");
    expect(validateBill(filled({ items: [zero] }), strict).errors[`item-${zero.key}-quantity`]).toMatch(/above 0/);
    const junk = newItem("Bulb", "50", "two");
    expect(validateBill(filled({ items: [junk] }), strict).errors[`item-${junk.key}-quantity`]).toBeTruthy();
  });

  it("starts new rows at 1", () => {
    expect(newItem().quantity).toBe("1");
  });
});
