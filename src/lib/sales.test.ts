import { describe, expect, it } from "vitest";
import { daysInMonth, monthRange, salesByDay, salesForLastDays, shiftDay, shiftMonth, summarize, type SaleRow } from "./sales";

const row = (date: string, spares: number, labour: number, painting: number | null = null, washing: number | null = null): SaleRow => ({
  date_received: date,
  items_subtotal: spares,
  labour_charge: labour,
  painting_charge: painting,
  washing_charge: washing,
  grand_total: spares + labour + (painting ?? 0) + (washing ?? 0),
});

describe("summarize", () => {
  it("splits spares, labour and services, and totals with and without labour", () => {
    const s = summarize([row("2026-10-14", 1250, 450, null, 150), row("2026-10-14", 899.5, 300, 2000)]);
    expect(s).toEqual({
      bills: 2,
      spares: 214950,
      labour: 75000,
      services: 215000,
      discount: 0,
      total: 504950,
      excludingLabour: 429950,
    });
  });

  it("counts totals after discount and adds up discounts given", () => {
    const discounted = { ...row("2026-10-14", 1000, 500), discount: 150, grand_total: 1350 };
    expect(summarize([discounted])).toMatchObject({ total: 135000, discount: 15000, excludingLabour: 85000 });
  });

  it("is all zero with no bills", () => {
    expect(summarize([]).total).toBe(0);
  });
});

describe("salesByDay", () => {
  it("has one entry per day of the month, including days with no bills", () => {
    const days = salesByDay([row("2026-10-01", 100, 50), row("2026-10-01", 10, 5), row("2026-10-31", 1, 1)], "2026-10");
    expect(days).toHaveLength(31);
    expect(days[0]).toMatchObject({ date: "2026-10-01", bills: 2, total: 16500, excludingLabour: 11000 });
    expect(days[1]).toMatchObject({ date: "2026-10-02", bills: 0, total: 0 });
    expect(days[30]).toMatchObject({ date: "2026-10-31", bills: 1, total: 200 });
  });

  it("ignores bills from other months", () => {
    expect(salesByDay([row("2026-11-01", 100, 50)], "2026-10").every((d) => d.bills === 0)).toBe(true);
  });
});

describe("dates", () => {
  it("knows month lengths, including leap years", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(monthRange("2026-04")).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  it("moves across month and year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("salesForLastDays", () => {
  it("covers the last N days up to and including the end date, oldest first", () => {
    const days = salesForLastDays([row("2026-10-15", 100, 50), row("2026-10-02", 10, 5), row("2026-10-01", 1, 1)], "2026-10-15", 14);
    expect(days).toHaveLength(14);
    expect(days[0].date).toBe("2026-10-02");
    expect(days[0].total).toBe(1500);
    expect(days[13]).toMatchObject({ date: "2026-10-15", total: 15000, bills: 1 });
    expect(days.some((d) => d.date === "2026-10-01")).toBe(false);
  });
});
