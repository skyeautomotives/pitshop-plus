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
};

/** "Oct 2026" from "2026-10". */
export function monthLabel(month: string, withYear = true): string {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString("en-IN", withYear ? { month: "short", year: "numeric" } : { month: "short" });
}
