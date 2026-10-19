import { describe, expect, it } from "vitest";
import { amountInWords, computeGst, halves, isGstin } from "./gst";

// The same cases as the database tests, so the app and the server agree to the paisa.
const oil = [{ amount: 60000, rate: 18 }];

describe("computeGst", () => {
  it("adds GST on top when prices are typed before GST", () => {
    const g = computeGst(oil, 50000, 18, 0, "exclusive");
    expect(g.taxable).toBe(110000);
    expect(g.gst).toBe(19800);
    expect(g.total).toBe(129800);
    expect(g.items[0]).toEqual({ taxable: 60000, gst: 10800 });
    expect(g.services).toEqual({ taxable: 50000, gst: 9000 });
  });

  it("takes GST out of the price when prices include GST", () => {
    const g = computeGst(oil, 50000, 18, 0, "inclusive");
    expect(g.total).toBe(110000);
    expect(g.items[0]).toEqual({ taxable: 50847, gst: 9153 });
    expect(g.services.taxable).toBe(42373);
    expect(g.gst).toBe(16780);
  });

  it("shares the discount across the lines before working out GST", () => {
    const g = computeGst(oil, 50000, 18, 10000, "exclusive");
    expect(g.items[0].taxable).toBe(54545);
    expect(g.services.taxable).toBe(45455);
    expect(g.taxable).toBe(100000);
    expect(g.total).toBe(118000);
  });

  it("gives the last item what is left of the discount when there is no labour", () => {
    const g = computeGst([{ amount: 10000, rate: 18 }, { amount: 20000, rate: 28 }], 0, 18, 1000, "exclusive");
    expect(g.items[0].taxable + g.items[1].taxable).toBe(29000);
  });

  it("groups the GST by rate", () => {
    const g = computeGst([{ amount: 100000, rate: 28 }], 50000, 18, 0, "exclusive");
    expect(g.byRate).toEqual([
      { rate: 18, taxable: 50000, gst: 9000 },
      { rate: 28, taxable: 100000, gst: 28000 },
    ]);
    expect(g.total).toBe(187000);
  });
});

describe("halves", () => {
  it("splits GST into CGST and SGST", () => {
    expect(halves(19800)).toEqual({ cgst: 9900, sgst: 9900 });
    expect(halves(9153)).toEqual({ cgst: 4577, sgst: 4576 });
  });
});

describe("isGstin", () => {
  it("checks the GSTIN format", () => {
    expect(isGstin("32ABCDE1234F1Z5")).toBe(true);
    expect(isGstin("32abcde1234f1z5")).toBe(true);
    expect(isGstin("32ABCDE1234F1Z")).toBe(false);
  });
});

describe("amountInWords", () => {
  it("writes amounts the Indian way", () => {
    expect(amountInWords(129800)).toBe("Rupees One Thousand Two Hundred Ninety Eight Only");
    expect(amountInWords(12500050)).toBe("Rupees One Lakh Twenty Five Thousand and Fifty Paise Only");
    expect(amountInWords(1234567800)).toBe("Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only");
  });
});
