import { describe, expect, it } from "vitest";
import { cleanMarks, countMarks, viewAt } from "./carMarks";
import { complaintToDraft, emptyComplaint, validateComplaint } from "./complaint";

describe("car marks", () => {
  it("knows which side of the car a tap is on", () => {
    expect(viewAt(180, 50)).toBe("front");
    expect(viewAt(180, 280)).toBe("top");
    expect(viewAt(50, 280)).toBe("left");
    expect(viewAt(300, 280)).toBe("right");
    expect(viewAt(180, 500)).toBe("back");
    expect(viewAt(30, 30)).toBeNull();
  });

  it("keeps only good marks, rounded, up to 60", () => {
    const raw = [{ x: 0.12345, y: 0.5, k: "dent" }, { x: 2, y: 0.5, k: "dent" }, { x: 0.5, y: 0.5, k: "rust" }, "junk", null];
    expect(cleanMarks(raw)).toEqual([{ x: 0.123, y: 0.5, k: "dent" }]);
    expect(cleanMarks(null)).toEqual([]);
    expect(cleanMarks(Array.from({ length: 70 }, () => ({ x: 0.5, y: 0.5, k: "scratch" })))).toHaveLength(60);
  });

  it("counts each kind", () => {
    expect(countMarks([{ x: 0, y: 0, k: "scratch" }, { x: 0, y: 0, k: "scratch" }, { x: 0, y: 0, k: "broken" }])).toEqual({ scratch: 2, dent: 0, broken: 1 });
  });

  it("are saved with the complaint and come back when editing", () => {
    const marks = [{ x: 0.5, y: 0.2, k: "scratch" as const }];
    const d = { ...emptyComplaint({ customerName: "Anu", vehicleReg: "KL 07 CD 1234" }), description: "AC", carMarks: marks };
    const { payload } = validateComplaint(d, { car: true });
    expect(payload?.car_marks).toEqual(marks);
    expect(complaintToDraft({ ...payload!, id: "x" } as never).carMarks).toEqual(marks);
  });
});
