import { FunctionsHttpError } from "@supabase/supabase-js";
import type { SaveBillPayload } from "./bill";
import type { ComplaintPayload } from "./complaint";
import type { PerformanceComplaint } from "./performance";
import type { SaleRow } from "./sales";
import { supabase } from "./supabase";
import type {

  BillWithComplaints,
  BillWithItems,
  ComplaintRow,
  ComplaintStatus,
  ComplaintWithBills,
  ShopSettings,
  StaffMember,
  StaffRole,
} from "./types";

// Embedded relations (bills <-> complaints go through bill_complaints).
const COMPLAINT_SUMMARY = "complaints(id, complaint_number, description, status, attended_by, reported_on)";
const BILL_SUMMARY = "bills(id, bill_number, date_received, grand_total)";

/** Creates a bill (no id) or replaces a saved one. Totals are calculated by the database. */
export async function saveBill(payload: SaveBillPayload, id?: string): Promise<string> {
  const { data, error } = await supabase.rpc("save_bill", {
    p_bill: payload.bill,
    p_items: payload.items,
    p_id: id ?? null,
    p_complaint_ids: payload.complaintIds,
  });
  if (error) throw error;
  return data as string;
}

export async function getBill(id: string): Promise<BillWithItems | null> {
  const { data, error } = await supabase
    .from("bills")
    .select(`*, bill_items(*), ${COMPLAINT_SUMMARY}`)
    .eq("id", id)
    .order("position", { referencedTable: "bill_items" })
    .maybeSingle();
  if (error) throw error;
  return data as BillWithItems | null;
}

/** Matches customer name, phone or vehicle number. Empty query = most recent bills. */
export async function searchBills(q: string): Promise<BillWithComplaints[]> {
  const { data, error } = await supabase.rpc("search_bills", { q }).select(`*, ${COMPLAINT_SUMMARY}`);
  if (error) throw error;
  return (data ?? []) as BillWithComplaints[];
}

/** Same matching as searchBills. Empty query = most recent complaints. */
export async function searchComplaints(q: string): Promise<ComplaintWithBills[]> {
  const { data, error } = await supabase.rpc("search_complaints", { q }).select(`*, ${BILL_SUMMARY}`);
  if (error) throw error;
  return (data ?? []) as ComplaintWithBills[];
}

/** All complaints and bills for one vehicle (by normalised registration key). */
export async function vehicleHistory(key: string): Promise<{ complaints: ComplaintWithBills[]; bills: BillWithComplaints[] }> {
  const [complaints, bills] = await Promise.all([
    supabase.from("complaints").select(`*, ${BILL_SUMMARY}`).eq("vehicle_reg_key", key),
    supabase.from("bills").select(`*, ${COMPLAINT_SUMMARY}`).eq("vehicle_reg_key", key),
  ]);
  if (complaints.error) throw complaints.error;
  if (bills.error) throw bills.error;
  return {
    complaints: (complaints.data ?? []) as ComplaintWithBills[],
    bills: (bills.data ?? []) as BillWithComplaints[],
  };
}

/** Complaints for one vehicle, for linking to a bill: open first, then newest. */
export async function complaintsForVehicle(key: string): Promise<ComplaintWithBills[]> {
  const { data, error } = await supabase
    .from("complaints")
    .select(`*, ${BILL_SUMMARY}`)
    .eq("vehicle_reg_key", key)
    .order("status")
    .order("reported_on", { ascending: false })
    .order("complaint_number", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ComplaintWithBills[];
}

/** The customer details from this vehicle's most recent bill or complaint, if any. */
export async function lastCustomerForVehicle(
  key: string,
): Promise<{ customer_name: string; phone: string; address: string | null; vehicle_reg: string } | null> {
  const cols = "customer_name, phone, address, vehicle_reg, created_at";
  const [b, c] = await Promise.all([
    supabase.from("bills").select(cols).eq("vehicle_reg_key", key).order("created_at", { ascending: false }).limit(1),
    supabase.from("complaints").select(cols).eq("vehicle_reg_key", key).order("created_at", { ascending: false }).limit(1),
  ]);
  if (b.error) throw b.error;
  if (c.error) throw c.error;
  const latest = [...(b.data ?? []), ...(c.data ?? [])].sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0];
  return latest ?? null;
}

export async function getComplaint(id: string): Promise<ComplaintWithBills | null> {
  const { data, error } = await supabase
    .from("complaints")
    .select(`*, ${BILL_SUMMARY}`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ComplaintWithBills | null;
}

export async function createComplaint(payload: ComplaintPayload): Promise<string> {
  const { data, error } = await supabase.from("complaints").insert(payload).select("id").single();
  if (error) throw error;
  return (data as Pick<ComplaintRow, "id">).id;
}

export async function updateComplaint(id: string, payload: ComplaintPayload): Promise<void> {
  const { error } = await supabase
    .from("complaints")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function setComplaintStatus(id: string, status: ComplaintStatus): Promise<void> {
  const { error } = await supabase
    .from("complaints")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function getShopSettings(): Promise<ShopSettings> {
  const { data, error } = await supabase
    .from("shop_settings")
    .select("shop_name, address, phone, allow_zero_labour")
    .single();
  if (error) throw error;
  return data as ShopSettings;
}

export async function updateShopSettings(s: ShopSettings): Promise<void> {
  const { data: shopId, error: shopError } = await supabase.rpc("my_shop_id");
  if (shopError) throw shopError;
  const { error } = await supabase
    .from("shop_settings")
    .update({ ...s, updated_at: new Date().toISOString() })
    .eq("shop_id", shopId as string);
  if (error) throw error;
}

/** Creates a new workshop and its owner login (Register page; no sign-in needed). */
export async function registerShop(input: {
  shop_name: string;
  full_name: string;
  phone: string;
  username: string;
  password: string;
}): Promise<void> {
  const { error } = await supabase.functions.invoke("register-shop", { body: input });
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
      ? "Registration isn't available right now. Check your internet connection and try again."
      : error.message,
  );
}

export async function listStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from("staff")
    .select("user_id, email, username, full_name, role, created_at")
    .order("role")
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as StaffMember[];
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
      ? "The user management service isn't set up yet (see README: Edge Function)."
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

/** Bills received between two dates (inclusive), with just the amounts reports need. */
export async function salesForRange(from: string, to: string): Promise<SaleRow[]> {
  const PAGE = 1000;
  const rows: SaleRow[] = [];
  // The API returns at most 1000 rows per request, so fetch page by page.
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("bills")
      .select("date_received, items_subtotal, labour_charge, painting_charge, washing_charge, grand_total, discount, created_by")
      .gte("date_received", from)
      .lte("date_received", to)
      .order("date_received")
      .order("id")
      .range(start, start + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as SaleRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export const COMPLAINT_LIST_LIMIT = 300;

/** Most recent complaints (with their bills), optionally only Open or Resolved. */
export async function listComplaints(status?: ComplaintStatus): Promise<ComplaintWithBills[]> {
  let query = supabase
    .from("complaints")
    .select(`*, ${BILL_SUMMARY}`)
    .order("reported_on", { ascending: false })
    .order("complaint_number", { ascending: false })
    .limit(COMPLAINT_LIST_LIMIT);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ComplaintWithBills[];
}

export async function countOpenComplaints(): Promise<number> {
  const { count, error } = await supabase
    .from("complaints")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  if (error) throw error;
  return count ?? 0;
}

export async function countBillsOn(date: string): Promise<number> {
  const { count, error } = await supabase
    .from("bills")
    .select("id", { count: "exact", head: true })
    .eq("date_received", date);
  if (error) throw error;
  return count ?? 0;
}

/** Complaints reported between two dates (inclusive), with who attended and their status. */
export async function complaintsForRange(from: string, to: string): Promise<PerformanceComplaint[]> {
  const PAGE = 1000;
  const rows: PerformanceComplaint[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("complaints")
      .select("attended_by, attended_by_user, status")
      .gte("reported_on", from)
      .lte("reported_on", to)
      .order("reported_on")
      .order("id")
      .range(start, start + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as PerformanceComplaint[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Owners can rename anyone; staff can rename themselves. */
export async function setStaffName(userId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc("set_staff_name", { p_user: userId, p_name: name });
  if (error) throw error;
}

export type ComplaintBrief = Pick<ComplaintRow, "id" | "complaint_number" | "vehicle_reg" | "vehicle_reg_key" | "description" | "reported_on">;
const BRIEF = "id, complaint_number, vehicle_reg, vehicle_reg_key, description, reported_on";

/** Complaint numbers and vehicles for the given ids (to explain links that don't match a bill's vehicle). */
export async function complaintsByIds(ids: string[]): Promise<ComplaintBrief[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("complaints").select(BRIEF).in("id", ids);
  if (error) throw error;
  return (data ?? []) as ComplaintBrief[];
}

/** Open complaints from this phone number recorded under a different vehicle number (likely a typo). */
export async function openComplaintsForPhoneElsewhere(phoneDigits: string, vehicleKey: string): Promise<ComplaintBrief[]> {
  const { data, error } = await supabase
    .from("complaints")
    .select(BRIEF)
    .eq("phone_digits", phoneDigits)
    .eq("status", "open")
    .neq("vehicle_reg_key", vehicleKey)
    .order("reported_on", { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as ComplaintBrief[];
}
