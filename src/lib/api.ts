// All reads and writes of the workshop's data.
//
// Bills and complaints are read from the device's copy (src/lib/local), which the
// sync engine keeps up to date, so every screen works offline. Saves go straight to
// the server when online; with no connection they are stored on the device and
// queued, and the sync engine sends them when the connection is back.
//
// Staff management and shop settings changes need a connection.
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { SaveBillPayload } from "./bill";
import type { ComplaintPayload } from "./complaint";
import type { PaymentInput } from "./payments";
import { getMeta, localDb, localUserId, setMeta, type LocalBill, type LocalComplaint, type OutboxOp } from "./local/db";
import {
  applyComplaintEdit,
  billFromPayload,
  byBillDateDesc,
  byComplaintDateDesc,
  complaintFromPayload,
  linkedStatusChanges,
  matchesSearch,
  toBillWithComplaints,
  toBillWithItems,
  toComplaintWithBills,
  type Me,
} from "./local/model";
import type { PerformanceComplaint } from "./performance";
import type { SaleRow } from "./sales";
import { cachedMe } from "./staff";
import { supabase } from "./supabase";
import { isNetworkError, notifyDataChanged, refreshCounts, syncNow } from "./sync";
import type {
  BillPayment,
  BillWithComplaints,
  BillWithItems,
  ComplaintRow,
  ComplaintStatus,
  ComplaintWithBills,
  ShopSettings,
  StaffMember,
  StaffRole,
} from "./types";

const newId = () => crypto.randomUUID();

function me(): Me {
  const uid = localUserId() ?? "";
  const m = cachedMe(uid);
  return { user_id: uid, name: m ? m.full_name || m.username : "" };
}

async function complaintMap(): Promise<Map<string, LocalComplaint>> {
  return new Map((await localDb().complaints.toArray()).map((c) => [c.id, c]));
}

async function hasWaitingChanges(id: string): Promise<boolean> {
  return (await localDb().outbox.where("entityId").equals(id).count()) > 0;
}

/** Adds a change to the queue, merging with a change already waiting for the same record. */
async function enqueue(op: OutboxOp) {
  const db = localDb();
  const existing = await db.outbox.where("entityId").equals(op.entityId).toArray();
  if (op.kind === "bill") {
    // The latest version of the bill is all the server needs.
    await db.outbox.bulkDelete(existing.filter((o) => o.kind === "bill").map((o) => o.seq!));
    await db.outbox.add(op);
  } else if (op.kind === "complaint-update") {
    const create = existing.find((o) => o.kind === "complaint-create");
    const update = existing.find((o) => o.kind === "complaint-update");
    if (create && create.kind === "complaint-create") {
      await db.outbox.update(create.seq!, { payload: { ...create.payload, ...op.payload }, error: null });
    } else if (update && update.kind === "complaint-update") {
      await db.outbox.update(update.seq!, { payload: { ...update.payload, ...op.payload }, error: null });
    } else {
      await db.outbox.add(op);
    }
  } else {
    await db.outbox.add(op);
  }
  await refreshCounts();
  void syncNow();
}

// ---------- Bills ----------

/**
 * Creates a bill (no id) or replaces a saved one. Online, the server checks and saves it
 * (and any error is shown on the form). Offline, it is saved on this device and sent later.
 */
export async function saveBill(payload: SaveBillPayload, id?: string): Promise<string> {
  const db = localDb();
  const billId = id ?? newId();
  const prev = await db.bills.get(billId);
  const complaints = await complaintMap();
  // Waiting changes for this bill, or links to complaints not on the server yet, must go through the queue (in order).
  const mustQueue =
    (await hasWaitingChanges(billId)) || payload.complaintIds.some((cid) => complaints.get(cid)?.pending === 1);

  if (navigator.onLine && !mustQueue) {
    const { error } = await supabase.rpc("save_bill", {
      p_bill: payload.bill,
      p_items: payload.items,
      p_id: null,
      p_complaint_ids: payload.complaintIds,
      p_new_id: billId,
    });
    if (!error) {
      await syncNow(); // brings back the bill number and complaint statuses
      if (await db.bills.get(billId)) return billId;
      // Saved on the server but the download failed: keep a local copy until the next sync.
      await saveLocally(billId, payload, prev, complaints, false);
      return billId;
    }
    if (!isNetworkError(error)) throw error;
  }
  await saveLocally(billId, payload, prev, complaints, true);
  return billId;
}

async function saveLocally(
  billId: string,
  payload: SaveBillPayload,
  prev: LocalBill | undefined,
  complaints: Map<string, LocalComplaint>,
  queue: boolean,
) {
  const db = localDb();
  const bill = billFromPayload(billId, payload, prev, me());
  if (!queue) bill.pending = 0;
  const others = await db.bills.toArray();
  const statusChanges = linkedStatusChanges(billId, bill.complaint_ids, prev?.complaint_ids ?? [], complaints, others);
  await db.transaction("rw", db.bills, db.complaints, async () => {
    await db.bills.put(bill);
    if (statusChanges.length) await db.complaints.bulkPut(statusChanges);
  });
  notifyDataChanged();
  if (queue) await enqueue({ kind: "bill", entityId: billId, payload, createdAt: new Date().toISOString() });
}

// ---------- Payments on a bill ----------

/**
 * Records money the customer paid on a bill. Online it goes straight to the server;
 * offline (or while the bill itself is still waiting to be sent) it is kept on this
 * device and sent later. The payment's id is chosen here, so a retry never doubles it.
 */
export async function addBillPayment(billId: string, input: PaymentInput): Promise<void> {
  const db = localDb();
  const bill = await db.bills.get(billId);
  if (!bill) throw new Error("Bill not found.");
  const payment: BillPayment = {
    id: newId(),
    ...input,
    recorded_by: localUserId(),
    recorded_by_name: me().name || null,
    created_at: new Date().toISOString(),
  };
  if (navigator.onLine && !(await hasWaitingChanges(billId))) {
    const { error } = await supabase.rpc("add_bill_payment", { p_bill: billId, p_payment: payment });
    if (!error) {
      await db.bills.update(billId, { payments: [...(bill.payments ?? []), payment] });
      notifyDataChanged();
      void syncNow();
      return;
    }
    if (!isNetworkError(error)) throw error;
  }
  await db.bills.update(billId, { payments: [...(bill.payments ?? []), payment], pending: 1 });
  notifyDataChanged();
  await enqueue({ kind: "bill-payment", entityId: billId, payload: { add: payment }, createdAt: payment.created_at });
}

/** Removes a payment recorded by mistake. */
export async function removeBillPayment(billId: string, paymentId: string): Promise<void> {
  const db = localDb();
  const bill = await db.bills.get(billId);
  if (!bill) throw new Error("Bill not found.");
  const payments = (bill.payments ?? []).filter((p) => p.id !== paymentId);
  // Recorded offline and not sent yet: just drop it from the queue.
  const queued = (await db.outbox.where("entityId").equals(billId).toArray()).find(
    (o) => o.kind === "bill-payment" && "add" in o.payload && o.payload.add.id === paymentId,
  );
  if (queued) {
    await db.outbox.delete(queued.seq!);
    const stillWaiting = await db.outbox.where("entityId").equals(billId).count();
    await db.bills.update(billId, { payments, pending: stillWaiting ? 1 : 0 });
    await refreshCounts();
    notifyDataChanged();
    return;
  }
  if (navigator.onLine && !(await hasWaitingChanges(billId))) {
    const { error } = await supabase.rpc("remove_bill_payment", { p_bill: billId, p_payment: paymentId });
    if (!error) {
      await db.bills.update(billId, { payments });
      notifyDataChanged();
      void syncNow();
      return;
    }
    if (!isNetworkError(error)) throw error;
  }
  await db.bills.update(billId, { payments, pending: 1 });
  notifyDataChanged();
  await enqueue({ kind: "bill-payment", entityId: billId, payload: { remove: paymentId }, createdAt: new Date().toISOString() });
}

export async function getBill(id: string): Promise<BillWithItems | null> {
  const b = await localDb().bills.get(id);
  return b ? toBillWithItems(b, await complaintMap()) : null;
}

/** Matches customer name, phone or vehicle number. Empty query = most recent bills. */
export async function searchBills(q: string): Promise<BillWithComplaints[]> {
  const [bills, complaints] = await Promise.all([localDb().bills.toArray(), complaintMap()]);
  return bills
    .filter((b) => matchesSearch(b, q))
    .sort(byBillDateDesc)
    .slice(0, 100)
    .map((b) => toBillWithComplaints(b, complaints));
}

export async function countBillsOn(date: string): Promise<number> {
  return localDb().bills.where("date_received").equals(date).count();
}

/** How many bills this workshop has ever made (0 for a new workshop). */
export async function countAllBills(): Promise<number> {
  return localDb().bills.count();
}

/** Bills received between two dates (inclusive), with just the amounts reports need. */
export async function salesForRange(from: string, to: string): Promise<SaleRow[]> {
  const rows = await localDb().bills.where("date_received").between(from, to, true, true).toArray();
  return rows.map((b) => ({
    date_received: b.date_received,
    items_subtotal: b.items_subtotal,
    labour_charge: b.labour_charge,
    painting_charge: b.painting_charge,
    washing_charge: b.washing_charge,
    grand_total: b.grand_total,
    discount: b.discount,
    created_by: b.created_by,
  }));
}

// ---------- Complaints ----------

export async function getComplaint(id: string): Promise<ComplaintWithBills | null> {
  const c = await localDb().complaints.get(id);
  return c ? toComplaintWithBills(c, await localDb().bills.toArray()) : null;
}

/** Same matching as searchBills. Empty query = most recent complaints. */
export async function searchComplaints(q: string): Promise<ComplaintWithBills[]> {
  const [complaints, bills] = await Promise.all([localDb().complaints.toArray(), localDb().bills.toArray()]);
  return complaints
    .filter((c) => matchesSearch(c, q))
    .sort(byComplaintDateDesc)
    .slice(0, 100)
    .map((c) => toComplaintWithBills(c, bills));
}

export const COMPLAINT_LIST_LIMIT = 300;

/** Most recent complaints (with their bills), optionally only Open or Resolved. */
export async function listComplaints(status?: ComplaintStatus): Promise<ComplaintWithBills[]> {
  const [complaints, bills] = await Promise.all([localDb().complaints.toArray(), localDb().bills.toArray()]);
  return complaints
    .filter((c) => !status || c.status === status)
    .sort(byComplaintDateDesc)
    .slice(0, COMPLAINT_LIST_LIMIT)
    .map((c) => toComplaintWithBills(c, bills));
}

export async function countOpenComplaints(): Promise<number> {
  return localDb().complaints.where("status").equals("open").count();
}

/** All complaints and bills for one vehicle (by normalised registration key). */
export async function vehicleHistory(key: string): Promise<{ complaints: ComplaintWithBills[]; bills: BillWithComplaints[] }> {
  const db = localDb();
  const [vComplaints, vBills, allBills, cMap] = await Promise.all([
    db.complaints.where("vehicle_reg_key").equals(key).toArray(),
    db.bills.where("vehicle_reg_key").equals(key).toArray(),
    db.bills.toArray(),
    complaintMap(),
  ]);
  return {
    complaints: vComplaints.map((c) => toComplaintWithBills(c, allBills)),
    bills: vBills.map((b) => toBillWithComplaints(b, cMap)),
  };
}

/** Complaints for one vehicle, for linking to a bill: open first, then newest. */
export async function complaintsForVehicle(key: string): Promise<ComplaintWithBills[]> {
  const db = localDb();
  const [rows, bills] = await Promise.all([db.complaints.where("vehicle_reg_key").equals(key).toArray(), db.bills.toArray()]);
  return rows
    .sort((a, b) => (a.status === b.status ? byComplaintDateDesc(a, b) : a.status === "open" ? -1 : 1))
    .slice(0, 50)
    .map((c) => toComplaintWithBills(c, bills));
}

/** The customer details from this vehicle's most recent bill or complaint, if any. */
export async function lastCustomerForVehicle(
  key: string,
): Promise<{ customer_name: string; phone: string; address: string | null; vehicle_reg: string } | null> {
  const db = localDb();
  const [b, c] = await Promise.all([
    db.bills.where("vehicle_reg_key").equals(key).toArray(),
    db.complaints.where("vehicle_reg_key").equals(key).toArray(),
  ]);
  const latest = [...b, ...c].sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0];
  return latest
    ? { customer_name: latest.customer_name, phone: latest.phone, address: latest.address, vehicle_reg: latest.vehicle_reg }
    : null;
}

export async function createComplaint(payload: ComplaintPayload): Promise<string> {
  const db = localDb();
  const id = newId();
  if (navigator.onLine) {
    const { error } = await supabase.from("complaints").insert({ id, ...payload });
    if (!error) {
      await syncNow();
      if (await db.complaints.get(id)) return id;
      await db.complaints.put({ ...complaintFromPayload(id, payload, me()), pending: 0 });
      notifyDataChanged();
      return id;
    }
    if (!isNetworkError(error)) throw error;
  }
  await db.complaints.put(complaintFromPayload(id, payload, me()));
  notifyDataChanged();
  await enqueue({ kind: "complaint-create", entityId: id, payload, createdAt: new Date().toISOString() });
  return id;
}

async function editComplaint(id: string, patch: Partial<ComplaintPayload>): Promise<void> {
  const db = localDb();
  const current = await db.complaints.get(id);
  if (!current) throw new Error("Complaint not found.");
  if (navigator.onLine && !(await hasWaitingChanges(id))) {
    const { error } = await supabase.from("complaints").update(patch).eq("id", id);
    if (!error) {
      await syncNow();
      return;
    }
    if (!isNetworkError(error)) throw error;
  }
  await db.complaints.put(applyComplaintEdit(current, patch));
  notifyDataChanged();
  await enqueue({ kind: "complaint-update", entityId: id, payload: patch, createdAt: new Date().toISOString() });
}

export function updateComplaint(id: string, payload: ComplaintPayload): Promise<void> {
  return editComplaint(id, payload);
}

export function setComplaintStatus(id: string, status: ComplaintStatus): Promise<void> {
  return editComplaint(id, { status });
}

/** Complaints reported between two dates (inclusive), with who attended and their status. */
export async function complaintsForRange(from: string, to: string): Promise<PerformanceComplaint[]> {
  const rows = await localDb().complaints.where("reported_on").between(from, to, true, true).toArray();
  return rows.map((c) => ({ attended_by: c.attended_by, attended_by_user: c.attended_by_user, status: c.status }));
}

export type ComplaintBrief = Pick<ComplaintRow, "id" | "complaint_number" | "vehicle_reg" | "vehicle_reg_key" | "description" | "reported_on">;
const brief = (c: LocalComplaint): ComplaintBrief => ({
  id: c.id,
  complaint_number: c.complaint_number,
  vehicle_reg: c.vehicle_reg,
  vehicle_reg_key: c.vehicle_reg_key,
  description: c.description,
  reported_on: c.reported_on,
});

/** Complaint numbers and vehicles for the given ids (to explain links that don't match a bill's vehicle). */
export async function complaintsByIds(ids: string[]): Promise<ComplaintBrief[]> {
  if (ids.length === 0) return [];
  return (await localDb().complaints.bulkGet(ids)).filter((c): c is LocalComplaint => !!c).map(brief);
}

/** Open complaints from this phone number recorded under a different vehicle number (likely a typo). */
export async function openComplaintsForPhoneElsewhere(phoneDigits: string, vehicleKey: string): Promise<ComplaintBrief[]> {
  const rows = await localDb().complaints.where("phone_digits").equals(phoneDigits).toArray();
  return rows
    .filter((c) => c.status === "open" && c.vehicle_reg_key !== vehicleKey)
    .sort(byComplaintDateDesc)
    .slice(0, 5)
    .map(brief);
}

// ---------- Shop settings (read offline from the last copy; changes need a connection) ----------

export async function getShopSettings(): Promise<ShopSettings> {
  const { data, error } = await supabase.from("shop_settings").select("shop_name, address, phone, allow_zero_labour").single();
  if (!error) {
    await setMeta("shopSettings", data);
    return data as ShopSettings;
  }
  const saved = await getMeta<ShopSettings>("shopSettings");
  if (saved && isNetworkError(error)) return saved;
  throw error;
}

export async function updateShopSettings(s: ShopSettings): Promise<void> {
  const { data: shopId, error: shopError } = await supabase.rpc("my_shop_id");
  if (shopError) throw shopError;
  const { error } = await supabase
    .from("shop_settings")
    .update({ ...s, updated_at: new Date().toISOString() })
    .eq("shop_id", shopId as string);
  if (error) throw error;
  await setMeta("shopSettings", s);
}

// ---------- Staff (owner tools need a connection; the list is kept for offline reports) ----------

export async function listStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from("staff")
    .select("user_id, email, username, full_name, role, created_at")
    .order("role")
    .order("full_name");
  if (!error) {
    await setMeta("staff", data);
    return (data ?? []) as StaffMember[];
  }
  const saved = await getMeta<StaffMember[]>("staff");
  if (saved && isNetworkError(error)) return saved;
  throw error;
}

/** Calls the owner-only manage-staff Edge Function and surfaces its error message. */
async function manageStaff(body: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.functions.invoke("manage-staff", { body });
  if (!error) return;
  if (error instanceof FunctionsHttpError) {
    let payload: { error?: string } | null = null;
    try {
      payload = await error.context.json();
    } catch {
      /* not JSON */
    }
    if (payload?.error) throw new Error(payload.error);
  }
  throw new Error(
    /failed to send|not found|fetch/i.test(error.message)
      ? "Managing logins needs an internet connection. Try again when you're online."
      : error.message,
  );
}

export function addStaff(input: { full_name: string; username: string; password: string; role: StaffRole }) {
  return manageStaff({ action: "create", ...input });
}

/** Changes what someone types to sign in (owner only). */
export function setStaffUsername(userId: string, username: string) {
  return manageStaff({ action: "set_username", user_id: userId, username });
}

export function removeStaff(userId: string) {
  return manageStaff({ action: "remove", user_id: userId });
}

export function resetStaffPassword(userId: string, password: string) {
  return manageStaff({ action: "reset_password", user_id: userId, password });
}

/** Owners can rename anyone; staff can rename themselves. */
export async function setStaffName(userId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc("set_staff_name", { p_user: userId, p_name: name });
  if (error) throw error;
  void syncNow(); // complaints show the new name
}
