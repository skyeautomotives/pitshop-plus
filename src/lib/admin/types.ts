// Shapes returned by the admin_* database functions (supabase/migrations/0014_platform_admin.sql).
// Amounts are rupees (numeric(12,2)).
import type { BillItemRow, BillRow, BillSummary, ComplaintRow, ComplaintStatus, ComplaintSummary, StaffRole } from "../types";

export interface MonthStats {
  /** "2026-10" */
  month: string;
  signups: number;
  bills: number;
  billed: number;
}

export interface AdminOverview {
  workshops: number;
  suspended: number;
  /** Workshops that created or changed a bill or complaint in the last 30 days. */
  active_30d: number;
  new_30d: number;
  logins: number;
  bills: number;
  complaints: number;
  open_complaints: number;
  total_billed: number;
  billed_30d: number;
  /** The last 12 months, oldest first. */
  by_month: MonthStats[];
}

export interface AdminShop {
  id: string;
  shop_name: string;
  phone: string | null;
  address: string | null;
  owner_user_id: string | null;
  owner_name: string;
  owner_email: string;
  owner_confirmed: boolean;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  logins: number;
  bills: number;
  complaints: number;
  total_billed: number;
  last_activity: string | null;
}

export interface AdminLogin {
  user_id: string;
  username: string;
  email: string;
  full_name: string;
  role: StaffRole;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
}

export interface AdminBillRow
  extends Pick<BillRow, "id" | "customer_name" | "phone" | "vehicle_reg" | "date_received" | "delivered_on" | "grand_total" | "created_at"> {
  bill_number: number;
}

export interface AdminComplaintRow
  extends Pick<ComplaintRow, "id" | "customer_name" | "phone" | "vehicle_reg" | "description" | "reported_on" | "attended_by"> {
  complaint_number: number;
  status: ComplaintStatus;
  /** Number of bills that address it. */
  bills: number;
}

export interface AdminBillDetail extends BillRow {
  shop_id: string;
  shop_name: string;
  created_by_name: string | null;
  vehicle_reg_key: string;
  bill_items: BillItemRow[];
  complaints: ComplaintSummary[];
}

export interface AdminComplaintDetail extends ComplaintRow {
  shop_id: string;
  shop_name: string;
  bills: BillSummary[];
}

export type AuditAction =
  | "suspend_shop"
  | "reactivate_shop"
  | "reset_password"
  | "disable_login"
  | "enable_login"
  | "remove_login";

export interface AuditEntry {
  id: number;
  created_at: string;
  admin_email: string;
  action: AuditAction;
  shop_id: string | null;
  shop_name: string;
  target_label: string;
  details: Record<string, unknown>;
}

export interface Page<T> {
  rows: T[];
  /** Matches across all pages. */
  total: number;
}

export type LoginAction = "reset_password" | "disable" | "enable" | "remove";
