import { describe, expect, it } from "vitest";
import { billCode, shopCode } from "./format";

describe("shopCode", () => {
  it("takes the first letters of the workshop name's words", () => {
    expect(shopCode("Sharma Motors")).toBe("SM");
    expect(shopCode("Ravi Motors & Sons")).toBe("RMS");
    expect(shopCode("The Bike Doctor")).toBe("BD");
    expect(shopCode("A1 Auto Works and Spares Centre")).toBe("AAWS");
  });

  it("uses the first three letters of a one-word name", () => {
    expect(shopCode("Skyline")).toBe("SKY");
  });

  it("is empty when the name has no English letters", () => {
    expect(shopCode("മോട്ടോർസ്")).toBe("");
    expect(shopCode("")).toBe("");
    expect(shopCode(null)).toBe("");
  });
});

describe("billCode", () => {
  it("puts the workshop code before the bill number", () => {
    expect(billCode(12, "Sharma Motors")).toBe("SM-0012");
    expect(billCode(12345, "Sharma Motors")).toBe("SM-12345");
  });

  it("is just the number when there is no code", () => {
    expect(billCode(7, "")).toBe("0007");
  });

  it("says the bill is waiting to sync when it has no number yet", () => {
    expect(billCode(null, "Sharma Motors")).toBe("(waiting to sync)");
  });
});
