import { describe, expect, it } from "vitest";
import { computeStaffPerformance } from "./performance";
import type { SaleRow } from "./sales";
import type { StaffMember } from "./types";

const staff: StaffMember[] = [
  { user_id: "u1", email: "owner@shop.in", username: "owner", full_name: "", role: "owner", created_at: "" },
  { user_id: "u2", email: "sudhi@shop.in", username: "sudhi", full_name: "Sudhi", role: "staff", created_at: "" },
  { user_id: "u3", email: "anu@shop.in", username: "anu", full_name: "Anu", role: "staff", created_at: "" },
];

const bill = (by: string | null, spares: number, labour: number): SaleRow => ({
  date_received: "2026-10-15",
  items_subtotal: spares,
  labour_charge: labour,
  painting_charge: null,
  washing_charge: null,
  grand_total: spares + labour,
  created_by: by,
});

describe("computeStaffPerformance", () => {
  const result = computeStaffPerformance(
    staff,
    [bill("u2", 1000, 500), bill("u2", 200, 100), bill("u1", 50, 50), bill("gone", 10, 10)],
    [
      { attended_by: "Sudhi", attended_by_user: "u2", status: "resolved" },
      { attended_by: "Sudhi", attended_by_user: "u2", status: "open" },
      { attended_by: "Ravi", attended_by_user: null, status: "open" },
    ],
  );
  const by = (name: string) => result.find((r) => r.name === name)!;

  it("adds up bills and complaints per staff member", () => {
    expect(by("Sudhi")).toMatchObject({ bills: 2, sales: 180000, labour: 60000, spares: 120000, complaints: 2, resolved: 1 });
    expect(by("owner")).toMatchObject({ bills: 1, sales: 10000, role: "owner" });
  });

  it("lists staff with nothing this period", () => {
    expect(by("Anu")).toMatchObject({ bills: 0, complaints: 0, sales: 0 });
  });

  it("keeps older or orphaned records under their saved name", () => {
    expect(by("Ravi")).toMatchObject({ complaints: 1, role: null });
    expect(by("Former staff")).toMatchObject({ bills: 1, sales: 2000 });
  });

  it("sorts by sales, highest first", () => {
    expect(result[0].name).toBe("Sudhi");
  });
});
