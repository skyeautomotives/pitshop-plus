// Shapes returned by the admin_* database functions (supabase/migrations/0014, 0015, 0016).
// Admins see workshops, logins, usage counts and Skye Automotives' own billing; never a
// workshop's customers or takings (0016). Amounts are rupees (numeric(12,2)).
import type { StaffRole } from "../types";

export interface MonthStats {
  /** "2026-10" */
  month: string;
  signups: number;
  bills: number;
}

export interface AdminOverview {
  workshops: number;
  suspended: number;
  /** Workshops that created or changed a bill or complaint in the last 30 days. */
  active_30d: number;
  new_30d: number;
  logins: number;
  bills: number;
  bills_30d: number;
  complaints: number;
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
  last_activity: string | null;
  /** Bike or car workshop; null if the owner hasn't chosen yet. */
  vehicle_type: "bike" | "car" | null;
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

export type AuditAction =
  | "suspend_shop"
  | "reactivate_shop"
  | "reset_password"
  | "disable_login"
  | "enable_login"
  | "remove_login"
  | "save_plan"
  | "update_subscription"
  | "record_payment"
  | "delete_payment";

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

// ---------- Billing (0015): what Skye Automotives charges workshops ----------

export type PlanPeriod = "month" | "year";

export interface Plan {
  id: string;
  name: string;
  price: number;
  period: PlanPeriod;
  description: string | null;
  active: boolean;
  created_at: string;
  /** Workshops on this plan (not cancelled). */
  workshops: number;
}

export type PlanInput = Pick<Plan, "name" | "price" | "period" | "description" | "active"> & { id: string | null };

export type SubscriptionStatus = "trial" | "active" | "cancelled";
/** Where a subscription stands today (trial and paid-until dates taken into account). */
export type SubscriptionState = "trial" | "trial_ended" | "active" | "overdue" | "cancelled";

export interface AdminSubscription {
  shop_id: string;
  shop_name: string;
  owner_email: string;
  shop_created_at: string;
  suspended: boolean;
  plan_id: string | null;
  plan_name: string | null;
  plan_period: PlanPeriod | null;
  plan_price: number | null;
  /** The price this workshop pays (agreed price, or the plan's). */
  price: number | null;
  status: SubscriptionStatus;
  state: SubscriptionState;
  trial_ends_at: string | null;
  paid_until: string | null;
  notes: string | null;
  last_payment_on: string | null;
  total_paid: number;
}

export interface SubscriptionInput {
  plan_id: string | null;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  paid_until: string | null;
  /** Null = the plan's price. */
  price: number | null;
  notes: string | null;
}

export type PaymentMethod = "upi" | "cash" | "bank" | "card" | "other";

export interface Payment {
  id: string;
  shop_id: string;
  shop_name: string;
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  covers_until: string | null;
  notes: string | null;
  recorded_by_email: string;
  created_at: string;
}

export interface PaymentInput {
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  covers_until: string | null;
  notes: string | null;
}

export interface BillingMonth {
  month: string;
  collected: number;
  payments: number;
}

export interface BillingOverview {
  /** Monthly recurring revenue: active and overdue subscriptions, yearly plans / 12. */
  mrr: number;
  paying: number;
  trials: number;
  trials_ending_7d: number;
  trial_ended: number;
  overdue: number;
  cancelled: number;
  renewing_7d: number;
  collected_month: number;
  collected_30d: number;
  collected_total: number;
  by_month: BillingMonth[];
}
