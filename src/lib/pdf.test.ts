import { describe, expect, it } from "vitest";
import { imagesToPdf } from "./pdf";

const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

describe("imagesToPdf", () => {
  it("makes one A4 page per image", () => {
    const pdf = text(imagesToPdf([{ jpeg, width: 10, height: 14 }, { jpeg, width: 10, height: 14 }], "Bill SM-0012"));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Count 2");
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(2);
    expect(pdf).toContain("/MediaBox [0 0 595.28 841.89]");
  });

  it("points every cross-reference entry at its object", () => {
    const bytes = imagesToPdf([{ jpeg, width: 10, height: 14 }], "Bill");
    const pdf = text(bytes);
    const xref = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...pdf.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    offsets.forEach((at, i) => expect(pdf.slice(at, at + 8)).toBe(`${i + 1} 0 obj`.padEnd(8, "\n").slice(0, 8)));
  });

  it("keeps the title in any script", () => {
    const pdf = text(imagesToPdf([{ jpeg, width: 1, height: 1 }], "₹"));
    expect(pdf).toContain("/Title <FEFF20B9>");
  });
});
