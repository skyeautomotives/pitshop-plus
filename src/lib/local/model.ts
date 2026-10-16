// Pure helpers for the device's copy of the data. They mirror what the database does
// (save_bill's totals, search rules, complaint links) so offline results match online ones.
import type { SaveBillPayload } from "../bill";
import type { ComplaintPayload } from "../complaint";
import { todayISO, vehicleKey } from "../customer";
import type {
  BillSummary,
  BillWithComplaints,
  BillWithItems,
  ComplaintSummary,
  ComplaintWithBills,
} from "../types";
import type { LocalBill, LocalComplaint } from "./db";

export const digitsOnly = (s: string) => s.replace(/\D/g, "");

const toPaise = (s: string | null | undefined): number | null => {
  if (s === null || s === undefined || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const rupees = (paise: number) => paise / 100;

/** Who is signed in, for fields the server would fill in (created_by, attended_by). */
export interface Me {
  user_id: string;
  name: string;
}

/** The row save_bill() would store for this payload (bill_number stays as it was; new bills get it at sync). */
export function billFromPayload(id: string, p: SaveBillPayload, prev: LocalBill | undefined, me: Me, now = new Date()): LocalBill {
  const b = p.bill;
  const items = p.items.map((i, index) => {
    const price = toPaise(i.price) ?? 0;
    const qtyHundredths = toPaise(i.quantity && i.quantity.trim() !== "" ? i.quantity : "1") ?? 100;
    return {
      id: `${id}-item-${index}`,
      bill_id: id,
      position: index,
      description: i.description.trim(),
      quantity: qtyHundredths / 100,
      price: rupees(price),
      line_total: rupees(Math.round((price * qtyHundredths) / 100)),
    };
  });
  const subtotal = items.reduce((sum, i) => sum + Math.round(i.line_total * 100), 0);
  const labour = toPaise(b.labour_charge) ?? 0;
  const painting = toPaise(b.painting_charge);
  const washing = toPaise(b.washing_charge);
  const discount = toPaise(b.discount) ?? 0;
  const gross = subtotal + labour + (painting ?? 0) + (washing ?? 0);
  const vehicleReg = b.vehicle_reg.trim().toUpperCase();
  const stamp = now.toISOString();
  return {
    id,
    bill_number: prev?.bill_number ?? null,
    customer_name: b.customer_name.trim(),
    address: b.address.trim() === "" ? null : b.address.trim(),
    phone: b.phone.trim(),
    vehicle_reg: vehicleReg,
    vehicle_reg_key: vehicleKey(vehicleReg),
    phone_digits: digitsOnly(b.phone),
    date_received: b.date_received,
    expected_pickup: b.expected_pickup || null,
    delivered_on: b.delivered_on || todayISO(now),
    labour_charge: rupees(labour),
    painting_charge: painting === null ? null : rupees(painting),
    washing_charge: washing === null ? null : rupees(washing),
    items_subtotal: rupees(subtotal),
    discount: rupees(discount),
    discount_percent: discount === 0 || b.discount_percent === null ? null : Number(b.discount_percent),
    grand_total: rupees(gross - discount),
    created_by: prev?.created_by ?? me.user_id,
    created_at: prev?.created_at ?? stamp,
    updated_at: stamp,
    bill_items: items,
    complaint_ids: [...new Set(p.complaintIds)],
    pending: 1,
  };
}

/** A complaint recorded on this device (number assigned at sync). */
export function complaintFromPayload(id: string, p: ComplaintPayload, me: Me, now = new Date()): LocalComplaint {
  const stamp = now.toISOString();
  const vehicleReg = p.vehicle_reg.trim().toUpperCase();
  return {
    id,
    complaint_number: null,
    customer_name: p.customer_name.trim(),
    address: p.address,
    phone: p.phone.trim(),
    phone_digits: digitsOnly(p.phone),
    vehicle_reg: vehicleReg,
    vehicle_reg_key: vehicleKey(vehicleReg),
    description: p.description,
    reported_on: p.reported_on,
    attended_by: me.name,
    attended_by_user: me.user_id,
    notes: p.notes,
    status: p.status,
    vehicle_name: p.vehicle_name,
    odometer_km: p.odometer_km,
    helmets: p.helmets,
    documents: p.documents,
    other_documents: p.other_documents,
    advance_amount: p.advance_amount,
    advance_method: p.advance_method,
    created_at: stamp,
    updated_at: stamp,
    pending: 1,
  };
}

/** A complaint after an edit made on this device (who attended never changes). */
export function applyComplaintEdit(c: LocalComplaint, patch: Partial<ComplaintPayload>, now = new Date()): LocalComplaint {
  const next = { ...c, ...patch, updated_at: now.toISOString(), pending: 1 as const };
  if (patch.vehicle_reg !== undefined) {
    next.vehicle_reg = patch.vehicle_reg.trim().toUpperCase();
    next.vehicle_reg_key = vehicleKey(next.vehicle_reg);
  }
  if (patch.phone !== undefined) next.phone_digits = digitsOnly(patch.phone);
  return next;
}

/**
 * Complaint statuses after a bill's links change, as save_bill() does: linked complaints
 * become resolved; ones the bill no longer links go back to open if no other bill covers them.
 */
export function linkedStatusChanges(
  billId: string,
  newIds: string[],
  oldIds: string[],
  complaints: Map<string, LocalComplaint>,
  bills: LocalBill[],
): LocalComplaint[] {
  const changed: LocalComplaint[] = [];
  for (const id of newIds) {
    const c = complaints.get(id);
    if (c && c.status !== "resolved") changed.push({ ...c, status: "resolved" });
  }
  for (const id of oldIds) {
    if (newIds.includes(id)) continue;
    const c = complaints.get(id);
    const coveredElsewhere = bills.some((b) => b.id !== billId && b.complaint_ids.includes(id));
    if (c && c.status === "resolved" && !coveredElsewhere) changed.push({ ...c, status: "open" });
  }
  return changed;
}

// ---------- Reading ----------

/** The same matching rules as search_bills() / search_complaints(). */
export function matchesSearch(row: { customer_name: string; phone_digits: string; vehicle_reg_key: string }, q: string): boolean {
  const text = q.trim().toLowerCase();
  if (text === "") return true;
  const digits = digitsOnly(q);
  const reg = vehicleKey(q);
  return (
    row.customer_name.toLowerCase().includes(text) ||
    (digits.length >= 3 && row.phone_digits.includes(digits)) ||
    (reg !== "" && row.vehicle_reg_key.includes(reg))
  );
}

/** Newest first. Records still waiting to sync have no number yet and count as newest. */
const num = (n: number | null) => (n === null ? Number.MAX_SAFE_INTEGER : n);
export const byBillDateDesc = (a: LocalBill, b: LocalBill) =>
  a.date_received === b.date_received ? num(b.bill_number) - num(a.bill_number) : a.date_received < b.date_received ? 1 : -1;
export const byComplaintDateDesc = (a: LocalComplaint, b: LocalComplaint) =>
  a.reported_on === b.reported_on ? num(b.complaint_number) - num(a.complaint_number) : a.reported_on < b.reported_on ? 1 : -1;

export function complaintSummary(c: LocalComplaint): ComplaintSummary {
  return {
    id: c.id,
    complaint_number: c.complaint_number,
    description: c.description,
    status: c.status,
    attended_by: c.attended_by,
    reported_on: c.reported_on,
    advance_amount: c.advance_amount ?? null,
  };
}

export function billSummary(b: LocalBill): BillSummary {
  return { id: b.id, bill_number: b.bill_number, date_received: b.date_received, grand_total: b.grand_total };
}

function stripLocal<T extends { pending: 0 | 1 }>(row: T) {
  const { pending, ...rest } = row;
  return { ...rest, pending: pending === 1 };
}

export function toBillWithComplaints(b: LocalBill, complaints: Map<string, LocalComplaint>): BillWithComplaints {
  const { bill_items: _items, complaint_ids, phone_digits: _p, created_by: _c, ...row } = stripLocal(b);
  return {
    ...row,
    complaints: complaint_ids.map((id) => complaints.get(id)).filter((c): c is LocalComplaint => !!c).map(complaintSummary),
  };
}

export function toBillWithItems(b: LocalBill, complaints: Map<string, LocalComplaint>): BillWithItems {
  return {
    ...toBillWithComplaints(b, complaints),
    bill_items: [...b.bill_items].sort((x, y) => x.position - y.position),
  };
}

export function toComplaintWithBills(c: LocalComplaint, bills: LocalBill[]): ComplaintWithBills {
  const { phone_digits: _p, ...row } = stripLocal(c);
  return { ...row, bills: bills.filter((b) => b.complaint_ids.includes(c.id)).map(billSummary) };
}
