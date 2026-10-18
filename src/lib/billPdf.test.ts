import { describe, expect, it } from "vitest";
import { billPdfName, pageCuts } from "./billPdf";
import type { BillWithItems } from "./types";

describe("pageCuts", () => {
  it("keeps a short bill on one page", () => {
    expect(pageCuts(900, [])).toEqual([[0, 900]]);
  });

  it("never cuts a row in two", () => {
    // Rows 40px tall from the top: the first page has about 1093px of room.
    const rows = Array.from({ length: 60 }, (_, i) => ({ top: i * 40 + 5, bottom: i * 40 + 45 }));
    const cuts = pageCuts(2405, rows);
    expect(cuts.length).toBeGreaterThan(1);
    for (const [, end] of cuts.slice(0, -1)) expect(rows.some((r) => r.top < end && r.bottom > end)).toBe(false);
    expect(cuts[cuts.length - 1][1]).toBe(2405);
  });
});

describe("billPdfName", () => {
  const bill = { bill_number: 12, vehicle_reg: "KL 39 B 4400" } as BillWithItems;
  it("names the file after the bill and vehicle", () => {
    expect(billPdfName(bill, "Sharma Motors")).toBe("Bill-SM-0012-KL39B4400.pdf");
  });
});
