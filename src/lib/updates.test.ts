import { describe, expect, it } from "vitest";
import { isNewer } from "./updates";

describe("update check", () => {
  it("compares versions number by number", () => {
    expect(isNewer("v0.2.1", "0.2.0")).toBe(true);
    expect(isNewer("0.10.0", "0.9.3")).toBe(true);
    expect(isNewer("v1.0.0", "0.99.99")).toBe(true);
  });

  it("does not offer the same or an older version", () => {
    expect(isNewer("v0.2.0", "0.2.0")).toBe(false);
    expect(isNewer("0.1.9", "0.2.0")).toBe(false);
    expect(isNewer("v0.2", "0.2.0")).toBe(false);
  });
});
