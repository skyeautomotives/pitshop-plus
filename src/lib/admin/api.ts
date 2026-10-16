// Data access for the platform admin panel (/admin). Reads go through the
// admin_* database functions, which check on every call that the caller is a
// platform admin; login actions go through the admin-logins Edge Function.
//
// Development only: `npm run dev:admin-demo` serves the panel from built-in
// sample data instead, so it can be tried without a Supabase project.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import type {
  AdminSubscription,
  BillingOverview,
  Payment,
  PaymentInput,
  Plan,
  PlanInput,
  SubscriptionInput,
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
  audit(shopId: string | null, page: number): Promise<Page<AuditEntry>>;
  setSuspended(shopId: string, suspend: boolean, reason?: string): Promise<void>;
  loginAction(userId: string, action: LoginAction, password?: string): Promise<void>;
  // Billing (0015)
  billingOverview(): Promise<BillingOverview>;
  plans(): Promise<Plan[]>;
  savePlan(plan: PlanInput): Promise<string>;
  subscriptions(): Promise<AdminSubscription[]>;
  subscription(shopId: string): Promise<AdminSubscription | null>;
  updateSubscription(shopId: string, sub: SubscriptionInput): Promise<void>;
  recordPayment(shopId: string, payment: PaymentInput): Promise<string>;
  deletePayment(id: string): Promise<void>;
  payments(shopId: string | null, page: number): Promise<Page<Payment>>;
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
  audit: (shopId, page) =>
    rpc<(AuditEntry & { total_count: number })[]>("admin_audit", {
      p_shop: shopId,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    }).then(toPage),
  billingOverview: () => rpc<BillingOverview>("admin_billing_overview"),
  plans: () => rpc<Plan[]>("admin_plans"),
  savePlan: (p) =>
    rpc<string>("admin_save_plan", {
      p_id: p.id,
      p_name: p.name,
      p_price: p.price,
      p_period: p.period,
      p_description: p.description,
      p_active: p.active,
    }),
  subscriptions: () => rpc<AdminSubscription[]>("admin_subscriptions", { p_shop: null }),
  subscription: (shopId) => rpc<AdminSubscription[]>("admin_subscriptions", { p_shop: shopId }).then((rows) => rows[0] ?? null),
  updateSubscription: (shopId, s) =>
    rpc<void>("admin_update_subscription", {
      p_shop: shopId,
      p_plan: s.plan_id,
      p_status: s.status,
      p_trial_ends_at: s.trial_ends_at,
      p_paid_until: s.paid_until,
      p_price: s.price,
      p_notes: s.notes,
    }),
  recordPayment: (shopId, p) =>
    rpc<string>("admin_record_payment", {
      p_shop: shopId,
      p_amount: p.amount,
      p_paid_on: p.paid_on,
      p_method: p.method,
      p_reference: p.reference,
      p_covers_until: p.covers_until,
      p_notes: p.notes,
    }),
  deletePayment: (id) => rpc<void>("admin_delete_payment", { p_id: id }),
  payments: (shopId, page) =>
    rpc<(Payment & { total_count: number })[]>("admin_payments", {
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
