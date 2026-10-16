// Data access for the platform admin panel (/admin). Reads go through the
// admin_* database functions, which check on every call that the caller is a
// platform admin; login actions go through the admin-logins Edge Function.
//
// Development only: `npm run dev:admin-demo` serves the panel from built-in
// sample data instead, so it can be tried without a Supabase project.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import type {
  AdminBillDetail,
  AdminBillRow,
  AdminComplaintDetail,
  AdminComplaintRow,
  AdminLogin,
  AdminOverview,
  AdminShop,
  AuditEntry,
  LoginAction,
  Page,
} from "./types";

export const PAGE_SIZE = 25;

/** True in `npm run dev:admin-demo`. Always false in builds, so the sample data is never shipped. */
export const adminDemo = import.meta.env.DEV && import.meta.env.MODE === "admin-demo";

export interface AdminApi {
  isPlatformAdmin(): Promise<boolean>;
  overview(): Promise<AdminOverview>;
  shops(search?: string): Promise<AdminShop[]>;
  shop(id: string): Promise<AdminShop | null>;
  logins(shopId: string): Promise<AdminLogin[]>;
  bills(shopId: string, search: string, page: number): Promise<Page<AdminBillRow>>;
  bill(id: string): Promise<AdminBillDetail | null>;
  complaints(shopId: string, search: string, status: "open" | "resolved" | null, page: number): Promise<Page<AdminComplaintRow>>;
  complaint(id: string): Promise<AdminComplaintDetail | null>;
  audit(shopId: string | null, page: number): Promise<Page<AuditEntry>>;
  setSuspended(shopId: string, suspend: boolean, reason?: string): Promise<void>;
  loginAction(userId: string, action: LoginAction, password?: string): Promise<void>;
}

/** Rows with a window `total_count` column -> one page. */
function toPage<T>(rows: (T & { total_count: number })[] | null): Page<T> {
  const list = rows ?? [];
  return {
    rows: list.map(({ total_count: _total, ...row }) => row as unknown as T),
    total: list.length ? Number(list[0].total_count) : 0,
  };
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

const serverApi: AdminApi = {
  isPlatformAdmin: () => rpc<boolean>("is_platform_admin").then((v) => v === true),
  overview: () => rpc<AdminOverview>("admin_overview"),
  shops: (search) => rpc<AdminShop[]>("admin_shops", { p_search: search || null }),
  shop: (id) => rpc<AdminShop[]>("admin_shops", { p_shop: id }).then((rows) => rows[0] ?? null),
  logins: (shopId) => rpc<AdminLogin[]>("admin_shop_logins", { p_shop: shopId }),
  bills: (shopId, search, page) =>
    rpc<(AdminBillRow & { total_count: number })[]>("admin_bills", {
      p_shop: shopId,
      p_search: search || null,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    }).then(toPage),
  bill: (id) => rpc<AdminBillDetail | null>("admin_bill", { p_id: id }),
  complaints: (shopId, search, status, page) =>
    rpc<(AdminComplaintRow & { total_count: number })[]>("admin_complaints", {
      p_shop: shopId,
      p_search: search || null,
      p_status: status,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    }).then(toPage),
  complaint: (id) => rpc<AdminComplaintDetail | null>("admin_complaint", { p_id: id }),
  audit: (shopId, page) =>
    rpc<(AuditEntry & { total_count: number })[]>("admin_audit", {
      p_shop: shopId,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    }).then(toPage),
  setSuspended: (shopId, suspend, reason) =>
    rpc<void>("admin_set_shop_suspended", { p_shop: shopId, p_suspend: suspend, p_reason: reason ?? null }),
  async loginAction(userId, action, password) {
    const { error } = await supabase.functions.invoke("admin-logins", { body: { action, user_id: userId, password } });
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
        ? "Couldn't reach the admin-logins function. Check your connection, and that the function is deployed (see README)."
        : error.message,
    );
  },
};

let demoApi: Promise<AdminApi> | null = null;

/** The admin API: the server's, or the sample data in admin-demo mode. */
export function adminApi(): Promise<AdminApi> {
  if (adminDemo) {
    demoApi ??= import("./demo").then((m) => m.createDemoApi());
    return demoApi;
  }
  return Promise.resolve(serverApi);
}

/** Runs one admin API call: `admin((api) => api.shops())`. */
export function admin<T>(call: (api: AdminApi) => Promise<T>): Promise<T> {
  return adminApi().then(call);
}
