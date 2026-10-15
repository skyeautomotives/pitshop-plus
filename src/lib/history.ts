import type { BillWithComplaints, ComplaintWithBills } from "./types";

export type HistoryEntry =
  | { kind: "complaint"; date: string; complaint: ComplaintWithBills }
  | { kind: "bill"; date: string; bill: BillWithComplaints };

export type HistoryFilter = "all" | "complaints-without-bill" | "bills-without-complaint";

/**
 * Complaints and bills for one vehicle, newest first. On the same day, the
 * bill comes before the complaint it may answer (complaints usually come first).
 */
export function buildHistory(complaints: ComplaintWithBills[], bills: BillWithComplaints[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [
    ...complaints.map((c) => ({ kind: "complaint" as const, date: c.reported_on, complaint: c })),
    ...bills.map((b) => ({ kind: "bill" as const, date: b.date_received, bill: b })),
  ];
  const seq = (e: HistoryEntry) => (e.kind === "bill" ? e.bill.bill_number : e.complaint.complaint_number);
  return entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.kind !== b.kind) return a.kind === "bill" ? -1 : 1;
    return seq(b) - seq(a);
  });
}

export function filterHistory(entries: HistoryEntry[], filter: HistoryFilter): HistoryEntry[] {
  if (filter === "complaints-without-bill")
    return entries.filter((e) => e.kind === "complaint" && e.complaint.bills.length === 0);
  if (filter === "bills-without-complaint")
    return entries.filter((e) => e.kind === "bill" && e.bill.complaints.length === 0);
  return entries;
}

export function historyCounts(complaints: ComplaintWithBills[], bills: BillWithComplaints[]) {
  return {
    complaints: complaints.length,
    openComplaints: complaints.filter((c) => c.status === "open").length,
    complaintsWithoutBill: complaints.filter((c) => c.bills.length === 0).length,
    bills: bills.length,
    billsWithoutComplaint: bills.filter((b) => b.complaints.length === 0).length,
  };
}
