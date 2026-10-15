import { summarize, type SaleRow } from "./sales";
import type { StaffMember } from "./types";

export interface PerformanceComplaint {
  attended_by: string | null;
  attended_by_user: string | null;
  status: "open" | "resolved";
}

export interface StaffPerformance {
  key: string;
  name: string;
  role: StaffMember["role"] | null;
  complaints: number;
  resolved: number;
  bills: number;
  /** Paise. */
  sales: number;
  labour: number;
  spares: number;
}

export function staffName(s: Pick<StaffMember, "full_name" | "username">): string {
  return s.full_name.trim() || s.username;
}

/**
 * Complaints attended and bills made, per staff member. Records from logins
 * that no longer exist, or older complaints without a linked login, are
 * grouped by the name that was saved.
 */
export function computeStaffPerformance(
  staff: StaffMember[],
  bills: SaleRow[],
  complaints: PerformanceComplaint[],
): StaffPerformance[] {
  const byId = new Map(staff.map((s) => [s.user_id, s]));
  const rows = new Map<string, StaffPerformance>();

  const row = (key: string, name: string, role: StaffPerformance["role"]) => {
    let r = rows.get(key);
    if (!r) {
      r = { key, name, role, complaints: 0, resolved: 0, bills: 0, sales: 0, labour: 0, spares: 0 };
      rows.set(key, r);
    }
    return r;
  };
  const forUser = (id: string | null | undefined, fallbackName: string | null) => {
    const s = id ? byId.get(id) : undefined;
    if (s) return row(s.user_id, staffName(s), s.role);
    const name = fallbackName?.trim() || "Not recorded";
    return row(`name:${name.toLowerCase()}`, name, null);
  };

  // Everyone on the staff list appears, even with nothing this period.
  for (const s of staff) row(s.user_id, staffName(s), s.role);

  for (const c of complaints) {
    const r = forUser(c.attended_by_user, c.attended_by);
    r.complaints += 1;
    if (c.status === "resolved") r.resolved += 1;
  }

  const billsByUser = new Map<string, SaleRow[]>();
  for (const b of bills) {
    const k = b.created_by ?? "";
    billsByUser.set(k, [...(billsByUser.get(k) ?? []), b]);
  }
  for (const [id, list] of billsByUser) {
    const r = forUser(id || null, id ? "Former staff" : "Not recorded");
    const s = summarize(list);
    r.bills += s.bills;
    r.sales += s.total;
    r.labour += s.labour;
    r.spares += s.spares;
  }

  return [...rows.values()].sort((a, b) => b.sales - a.sales || b.complaints - a.complaints || a.name.localeCompare(b.name));
}
