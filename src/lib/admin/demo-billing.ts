// Sample plans, subscriptions and payments for `npm run dev:admin-demo`.
// Mirrors 0015_subscriptions.sql (states, "paid until" on payments, MRR). Never part of a build.
import type { AdminApi } from "./api";
import { PAGE_SIZE } from "./api";
import type {
  AdminSubscription,
  AuditAction,
  BillingMonth,
  Payment,
  PaymentMethod,
  Plan,
  SubscriptionState,
  SubscriptionStatus,
} from "./types";

const DAY = 86_400_000;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const today = () => day(Date.now());

interface Sub {
  shop_id: string;
  plan_id: string | null;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  paid_until: string | null;
  price: number | null;
  notes: string | null;
}

interface DemoShop {
  id: string;
  shop_name: string;
  created_at: string;
  suspended_at: string | null;
}

export function stateOf(s: Pick<Sub, "status" | "trial_ends_at" | "paid_until">, now = today()): SubscriptionState {
  if (s.status === "cancelled") return "cancelled";
  if (s.status === "trial") return !s.trial_ends_at || s.trial_ends_at >= now ? "trial" : "trial_ended";
  return !s.paid_until || s.paid_until < now ? "overdue" : "active";
}

type BillingApi = Pick<
  AdminApi,
  | "billingOverview"
  | "plans"
  | "savePlan"
  | "subscriptions"
  | "subscription"
  | "updateSubscription"
  | "recordPayment"
  | "deletePayment"
  | "payments"
>;

export function createDemoBilling(
  shops: DemoShop[],
  ownerEmail: (shopId: string) => string,
  log: (action: AuditAction, shopId: string | null, target: string, details?: Record<string, unknown>) => void,
): BillingApi {
  const now = Date.now();
  const plans: Omit<Plan, "workshops">[] = [
    { id: "plan-basic", name: "Basic", price: 499, period: "month", description: "One workshop, unlimited bills", active: true, created_at: new Date(now - 300 * DAY).toISOString() },
    { id: "plan-yearly", name: "Yearly", price: 4999, period: "year", description: "Basic, paid yearly (2 months free)", active: true, created_at: new Date(now - 300 * DAY).toISOString() },
  ];
  const subs = new Map<string, Sub>();
  const payments: Payment[] = [];
  let seq = 0;
  const pay = (shop: DemoShop, amount: number, paidOn: number, method: PaymentMethod, coversUntil: number | null, reference: string | null) =>
    payments.push({
      id: `pay-${++seq}`,
      shop_id: shop.id,
      shop_name: shop.shop_name,
      amount,
      paid_on: day(paidOn),
      method,
      reference,
      covers_until: coversUntil === null ? null : day(coversUntil),
      notes: null,
      recorded_by_email: "demo-admin@skyeautomotives.in",
      created_at: new Date(paidOn).toISOString(),
    });

  // A spread of situations: paying monthly, paying yearly, overdue, trials, a cancellation.
  shops.forEach((shop, i) => {
    const created = new Date(shop.created_at).getTime();
    const trialEnd = created + 30 * DAY;
    const base: Sub = { shop_id: shop.id, plan_id: null, status: "trial", trial_ends_at: day(trialEnd), paid_until: null, price: null, notes: null };
    if (trialEnd > now) {
      subs.set(shop.id, base); // still in the free trial
      return;
    }
    if (i % 5 === 3) {
      subs.set(shop.id, { ...base, notes: "Asked for a demo of reports before deciding" }); // trial ended, no plan yet
      return;
    }
    if (i % 5 === 4) {
      subs.set(shop.id, { ...base, plan_id: "plan-yearly", status: "active" });
      const start = trialEnd;
      pay(shop, 4999, start, "bank", start + 365 * DAY, "NEFT 88201");
      subs.get(shop.id)!.paid_until = day(start + 365 * DAY);
      return;
    }
    const sub: Sub = { ...base, plan_id: "plan-basic", status: i === 1 ? "cancelled" : "active", price: i === 0 ? 399 : null };
    if (i === 0) sub.notes = "Founding customer: ₹399 for the first year";
    const price = sub.price ?? 499;
    let until = trialEnd;
    // Monthly payments up to now; the suspended workshop stopped paying two months ago.
    const stopAt = shop.suspended_at ? now - 60 * DAY : now;
    while (until + 30 * DAY < stopAt + 25 * DAY) {
      pay(shop, price, until, i % 2 ? "upi" : "cash", until + 30 * DAY, i % 2 ? `UPI ${(483920 + seq).toString()}` : null);
      until += 30 * DAY;
    }
    sub.paid_until = day(until);
    subs.set(shop.id, sub);
  });

  const row = (shop: DemoShop): AdminSubscription => {
    const s = subs.get(shop.id) ?? { shop_id: shop.id, plan_id: null, status: "trial" as const, trial_ends_at: null, paid_until: null, price: null, notes: null };
    const plan = plans.find((p) => p.id === s.plan_id) ?? null;
    const mine = payments.filter((p) => p.shop_id === shop.id);
    return {
      shop_id: shop.id,
      shop_name: shop.shop_name,
      owner_email: ownerEmail(shop.id),
      shop_created_at: shop.created_at,
      suspended: !!shop.suspended_at,
      plan_id: plan?.id ?? null,
      plan_name: plan?.name ?? null,
      plan_period: plan?.period ?? null,
      plan_price: plan?.price ?? null,
      price: s.price ?? plan?.price ?? null,
      status: s.status,
      state: stateOf(s),
      trial_ends_at: s.trial_ends_at,
      paid_until: s.paid_until,
      notes: s.notes,
      last_payment_on: mine.reduce<string | null>((m, p) => (!m || p.paid_on > m ? p.paid_on : m), null),
      total_paid: mine.reduce((a, p) => a + p.amount, 0),
    };
  };
  const shopById = (id: string) => {
    const s = shops.find((x) => x.id === id);
    if (!s) throw new Error("Workshop not found.");
    return s;
  };
  const pause = () => new Promise((r) => setTimeout(r, 120));

  return {
    async billingOverview() {
      await pause();
      const rows = shops.map(row);
      const t = today();
      const in7 = day(Date.now() + 7 * DAY);
      const monthStart = `${t.slice(0, 7)}-01`;
      const since30 = day(Date.now() - 29 * DAY);
      const by_month: BillingMonth[] = [];
      const d = new Date();
      for (let i = 11; i >= 0; i--) {
        const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
        const list = payments.filter((p) => p.paid_on.startsWith(key));
        by_month.push({ month: key, collected: list.reduce((a, p) => a + p.amount, 0), payments: list.length });
      }
      const sum = (list: Payment[]) => list.reduce((a, p) => a + p.amount, 0);
      return {
        mrr: rows
          .filter((r) => (r.state === "active" || r.state === "overdue") && r.price !== null)
          .reduce((a, r) => a + (r.plan_period === "year" ? r.price! / 12 : r.price!), 0),
        paying: rows.filter((r) => r.state === "active").length,
        trials: rows.filter((r) => r.state === "trial").length,
        trials_ending_7d: rows.filter((r) => r.state === "trial" && !!r.trial_ends_at && r.trial_ends_at <= in7).length,
        trial_ended: rows.filter((r) => r.state === "trial_ended").length,
        overdue: rows.filter((r) => r.state === "overdue").length,
        cancelled: rows.filter((r) => r.state === "cancelled").length,
        renewing_7d: rows.filter((r) => r.state === "active" && !!r.paid_until && r.paid_until <= in7).length,
        collected_month: sum(payments.filter((p) => p.paid_on >= monthStart)),
        collected_30d: sum(payments.filter((p) => p.paid_on >= since30)),
        collected_total: sum(payments),
        by_month,
      };
    },

    async plans() {
      await pause();
      return plans
        .map((p) => ({ ...p, workshops: [...subs.values()].filter((s) => s.plan_id === p.id && s.status !== "cancelled").length }))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.price - b.price);
    },

    async savePlan(p) {
      await pause();
      if (!p.name.trim()) throw new Error("Enter a plan name (up to 60 characters).");
      if (!(p.price >= 0)) throw new Error("Enter a price of 0 or more.");
      if (p.id) {
        const existing = plans.find((x) => x.id === p.id);
        if (!existing) throw new Error("Plan not found.");
        Object.assign(existing, { name: p.name.trim(), price: p.price, period: p.period, description: p.description, active: p.active });
      } else {
        plans.push({ id: `plan-${++seq}`, name: p.name.trim(), price: p.price, period: p.period, description: p.description, active: p.active, created_at: new Date().toISOString() });
      }
      log("save_plan", null, p.name.trim(), { price: p.price, period: p.period, active: p.active });
      return p.id ?? `plan-${seq}`;
    },

    async subscriptions() {
      await pause();
      return shops.map(row).sort((a, b) => b.shop_created_at.localeCompare(a.shop_created_at));
    },

    async subscription(shopId) {
      await pause();
      return row(shopById(shopId));
    },

    async updateSubscription(shopId, s) {
      await pause();
      const shop = shopById(shopId);
      if (s.price !== null && s.price < 0) throw new Error("The price can't be below 0.");
      subs.set(shopId, { shop_id: shopId, ...s });
      log("update_subscription", shopId, shop.shop_name, { plan: plans.find((p) => p.id === s.plan_id)?.name ?? null, status: s.status, paid_until: s.paid_until });
    },

    async recordPayment(shopId, p) {
      await pause();
      const shop = shopById(shopId);
      if (!(p.amount > 0)) throw new Error("Enter the amount received.");
      pay(shop, p.amount, new Date(`${p.paid_on}T12:00:00`).getTime(), p.method, p.covers_until ? new Date(`${p.covers_until}T12:00:00`).getTime() : null, p.reference);
      payments[payments.length - 1].notes = p.notes;
      if (p.covers_until) {
        const s = subs.get(shopId)!;
        s.status = "active";
        s.paid_until = !s.paid_until || p.covers_until > s.paid_until ? p.covers_until : s.paid_until;
      }
      log("record_payment", shopId, shop.shop_name, { amount: p.amount, method: p.method, covers_until: p.covers_until });
      return `pay-${seq}`;
    },

    async deletePayment(id) {
      await pause();
      const i = payments.findIndex((p) => p.id === id);
      if (i < 0) throw new Error("Payment not found.");
      const [p] = payments.splice(i, 1);
      log("delete_payment", p.shop_id, p.shop_name, { amount: p.amount, paid_on: p.paid_on });
    },

    async payments(shopId, n) {
      await pause();
      const rows = payments
        .filter((p) => !shopId || p.shop_id === shopId)
        .sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at));
      return { rows: rows.slice(n * PAGE_SIZE, (n + 1) * PAGE_SIZE), total: rows.length };
    },
  };
}
