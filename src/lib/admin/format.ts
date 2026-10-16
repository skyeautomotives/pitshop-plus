import type { AdminLogin, AuditAction } from "./types";

/** A timestamp as "14 Oct 2026, 3:05 pm". */
export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function timeAgo(ts: string | null | undefined, now = Date.now()): string {
  if (!ts) return "Never";
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return ts;
  const min = Math.floor((now - t) / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** True while the login is disabled (banned in Supabase Auth). */
export function isDisabled(login: Pick<AdminLogin, "banned_until">, now = Date.now()): boolean {
  return !!login.banned_until && new Date(login.banned_until).getTime() > now;
}

export const AUDIT_LABELS: Record<AuditAction, string> = {
  suspend_shop: "Suspended workshop",
  reactivate_shop: "Reactivated workshop",
  reset_password: "Reset password",
  disable_login: "Disabled login",
  enable_login: "Enabled login",
  remove_login: "Removed login",
  save_plan: "Saved plan",
  update_subscription: "Changed subscription",
  record_payment: "Recorded payment",
  delete_payment: "Deleted payment",
};

export const STATE_LABELS: Record<import("./types").SubscriptionState, string> = {
  trial: "Free trial",
  trial_ended: "Trial ended",
  active: "Active",
  overdue: "Payment overdue",
  cancelled: "Cancelled",
};

export const METHOD_LABELS: Record<import("./types").PaymentMethod, string> = {
  upi: "UPI",
  cash: "Cash",
  bank: "Bank transfer",
  card: "Card",
  other: "Other",
};

/** "₹499 / month" */
export function planPrice(price: number | null, period: "month" | "year" | null): string {
  if (price === null) return "-";
  return `₹${price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${period ? ` / ${period}` : ""}`;
}

/** The next "paid until" date after paying one period from `from` (yyyy-mm-dd). */
export function nextPeriodEnd(from: string, period: "month" | "year"): string {
  const d = new Date(`${from}T00:00:00`);
  if (period === "year") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Oct 2026" from "2026-10". */
export function monthLabel(month: string, withYear = true): string {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString("en-IN", withYear ? { month: "short", year: "numeric" } : { month: "short" });
}
