import { describe, expect, it } from "vitest";
import { isDisabled, monthLabel, timeAgo } from "./format";

const NOW = new Date("2026-10-16T12:00:00Z").getTime();

describe("timeAgo", () => {
  it("says Never for a login that never signed in", () => {
    expect(timeAgo(null, NOW)).toBe("Never");
  });

  it("uses minutes, hours and days for recent times", () => {
    expect(timeAgo("2026-10-16T11:59:40Z", NOW)).toBe("Just now");
    expect(timeAgo("2026-10-16T11:55:00Z", NOW)).toBe("5 min ago");
    expect(timeAgo("2026-10-16T09:00:00Z", NOW)).toBe("3 h ago");
    expect(timeAgo("2026-10-15T11:00:00Z", NOW)).toBe("1 day ago");
    expect(timeAgo("2026-10-06T12:00:00Z", NOW)).toBe("10 days ago");
  });

  it("shows the date after a month", () => {
    expect(timeAgo("2026-08-01T12:00:00Z", NOW)).toMatch(/2026/);
  });
});

describe("isDisabled", () => {
  it("is true only while the ban lasts", () => {
    expect(isDisabled({ banned_until: null }, NOW)).toBe(false);
    expect(isDisabled({ banned_until: "2126-10-16T00:00:00Z" }, NOW)).toBe(true);
    expect(isDisabled({ banned_until: "2026-10-01T00:00:00Z" }, NOW)).toBe(false);
  });
});

describe("monthLabel", () => {
  it("formats a yyyy-mm month", () => {
    expect(monthLabel("2026-10")).toMatch(/Oct/);
    expect(monthLabel("2026-10")).toMatch(/2026/);
    expect(monthLabel("2026-10", false)).not.toMatch(/2026/);
  });
});
