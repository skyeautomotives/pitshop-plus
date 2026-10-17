import { describe, expect, it } from "vitest";
import { complaintText, jobLabel, jobList } from "./jobCard";

describe("job card", () => {
  it("has a list for bikes and one for cars", () => {
    expect(jobList("bike").some((j) => j.id === "chain")).toBe(true);
    expect(jobList("car").some((j) => j.id === "ac")).toBe(true);
    expect(jobList("car").some((j) => j.id === "chain")).toBe(false);
  });

  it("shows both lists, without repeats, before the workshop type is chosen", () => {
    const ids = jobList(null).map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["chain", "ac"]));
  });

  it("gives a job the same name in both lists", () => {
    const bike = new Map(jobList("bike").map((j) => [j.id, j.label]));
    for (const j of jobList("car")) if (bike.has(j.id)) expect(bike.get(j.id)).toBe(j.label);
  });

  it("uses simple ids the database accepts", () => {
    for (const j of jobList(null)) expect(j.id).toMatch(/^[a-z0-9_]{1,40}$/);
  });

  it("turns ticked jobs and comments into one line", () => {
    expect(complaintText({ jobs: ["oil_change", "brakes"], description: "" })).toBe("Engine oil change / top up, Brakes");
    expect(complaintText({ jobs: ["chain"], description: " Rattle near the seat " })).toBe("Drive chain clean & adjust. Rattle near the seat");
    expect(complaintText({ description: "Brake noise" })).toBe("Brake noise");
    expect(jobLabel("old_item")).toBe("old item");
  });
});
