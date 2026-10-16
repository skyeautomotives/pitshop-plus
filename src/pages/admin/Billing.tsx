// Billing for Skye Automotives: plans, each workshop's subscription, payments received.
// Shows only what workshops pay Skye Automotives, never what they bill their customers.
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import ConfirmDialog from "../../components/ConfirmDialog";
import { admin } from "../../lib/admin/api";
import { METHOD_LABELS, STATE_LABELS, formatDateTime, nextPeriodEnd, planPrice } from "../../lib/admin/format";
import type {
  AdminSubscription,
  Payment,
  PaymentMethod,
  Plan,
  PlanPeriod,
  SubscriptionState,
  SubscriptionStatus,
} from "../../lib/admin/types";
import { todayISO } from "../../lib/customer";
import { formatDate } from "../../lib/format";
import { errorMessage } from "../../lib/supabase";
import { useLoad } from "../../lib/useLoad";
import { usePageTitle } from "../../lib/usePageTitle";
import { compactINR } from "../../lib/chart";
import { LoadFailed, MonthBars, Pager, Tile } from "./parts";

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const exact = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const count = (n: number) => n.toLocaleString("en-IN");
/** "1 trial", "3 trials" */
const n = (value: number, one: string, many: string) => `${count(value)} ${value === 1 ? one : many}`;
const BADGE: Record<SubscriptionState, string> = {
  trial: "sub-badge sub-trial",
  trial_ended: "sub-badge sub-ended",
  active: "sub-badge sub-active",
  overdue: "sub-badge sub-overdue",
  cancelled: "sub-badge sub-cancelled",
};

export function SubscriptionBadge({ state }: { state: SubscriptionState }) {
  return <span className={BADGE[state]}>{STATE_LABELS[state]}</span>;
}

/** "Trial ends 20 Oct 2026", "Paid until 15 Nov 2026", ... */
function subscriptionLine(s: Pick<AdminSubscription, "state" | "trial_ends_at" | "paid_until">): string {
  switch (s.state) {
    case "trial":
      return s.trial_ends_at ? `Trial ends ${formatDate(s.trial_ends_at)}` : "Free trial";
    case "trial_ended":
      return s.trial_ends_at ? `Trial ended ${formatDate(s.trial_ends_at)}` : "Trial ended";
    case "active":
      return s.paid_until ? `Paid until ${formatDate(s.paid_until)}` : "Active";
    case "overdue":
      return s.paid_until ? `Was paid until ${formatDate(s.paid_until)}` : "No payment yet";
    case "cancelled":
      return "Cancelled";
  }
}

// ---------------------------------------------------------------------------
// The Billing page (/admin/billing)

const FILTERS: { id: "all" | SubscriptionState; label: string }[] = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue" },
  { id: "trial", label: "Free trial" },
  { id: "trial_ended", label: "Trial ended" },
  { id: "active", label: "Active" },
  { id: "cancelled", label: "Cancelled" },
];

export default function AdminBilling() {
  usePageTitle("Billing");
  const [version, setVersion] = useState(0);
  const [show, setShow] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [page, setPage] = useState(0);
  const data = useLoad(`admin-billing|${version}`, () =>
    admin(async (api) => {
      const [overview, plans, subs] = await Promise.all([api.billingOverview(), api.plans(), api.subscriptions()]);
      return { overview, plans, subs };
    }),
  );
  const payments = useLoad(`admin-payments|${page}|${version}`, () => admin((api) => api.payments(null, page)));

  if (data.status === "loading") return <p className="page-status">Loading…</p>;
  if (data.status === "error") return <LoadFailed what="billing" message={data.message} onRetry={data.retry} />;
  const { overview: o, plans, subs } = data.data;
  const months = o.by_month.map((m) => m.month);
  const rows = show === "all" ? subs : subs.filter((s) => s.state === show);
  // Overdue first, then trials ending soonest.
  const ordered = [...rows].sort((a, b) => {
    const rank = (s: AdminSubscription) => ["overdue", "trial_ended", "trial", "active", "cancelled"].indexOf(s.state);
    return rank(a) - rank(b) || (a.trial_ends_at ?? a.paid_until ?? "").localeCompare(b.trial_ends_at ?? b.paid_until ?? "");
  });

  return (
    <div className="admin-overview">
      <header className="dash-head">
        <div>
          <h1>Billing</h1>
          <p className="muted">What workshops pay Skye Automotives</p>
        </div>
      </header>

      <div className="tiles dash-tiles">
        <Tile strong label="Monthly revenue" value={rupees(o.mrr)} sub="Active and overdue plans; yearly ÷ 12" />
        <Tile label="Collected this month" value={rupees(o.collected_month)} sub={`${rupees(o.collected_30d)} in the last 30 days`} />
        <Tile label="Paying workshops" value={count(o.paying)} sub={`${n(o.renewing_7d, "renews", "renew")} this week`} />
        <Tile label="Overdue" value={count(o.overdue)} sub={`${n(o.trial_ended, "trial", "trials")} ended without a plan`} />
      </div>
      <div className="tiles dash-tiles">
        <Tile label="Free trials" value={count(o.trials)} sub={`${count(o.trials_ending_7d)} ending in the next 7 days`} />
        <Tile label="Cancelled" value={count(o.cancelled)} />
        <Tile label="Collected, all time" value={rupees(o.collected_total)} />
        <Tile label="Plans" value={count(plans.filter((p) => p.active).length)} sub="On sale" />
      </div>

      <div className="admin-charts">
        <section className="card">
          <div className="card-head">
            <h2>Collected per month</h2>
          </div>
          <MonthBars
            label="Payments received per month, last 12 months"
            months={months}
            value={(i) => Math.round(o.by_month[i].collected * 100)}
            format={(v) => exact(v / 100)}
            axis={compactINR}
            color="#16a34a"
            details={(i) => (
              <span className="muted">
                {count(o.by_month[i].payments)} {o.by_month[i].payments === 1 ? "payment" : "payments"}
              </span>
            )}
          />
        </section>
        <PlansCard plans={plans} onSaved={() => setVersion((v) => v + 1)} />
      </div>

      <div className="chips" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip${show === f.id ? " chip-active" : ""}${f.id === "overdue" && o.overdue > 0 ? " chip-attention" : ""}`}
            onClick={() => setShow(f.id)}
          >
            {f.label} <span className="chip-count">{f.id === "all" ? subs.length : subs.filter((s) => s.state === f.id).length}</span>
          </button>
        ))}
      </div>

      <section className="card">
        <div className="table-scroll">
          <table className="sales-table admin-table">
            <thead>
              <tr>
                <th>Workshop</th>
                <th>Plan</th>
                <th>Status</th>
                <th className="num">Paid so far</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((s) => (
                <tr key={s.shop_id}>
                  <td>
                    <Link to={`/admin/workshops/${s.shop_id}?tab=billing`} className="admin-row-link">
                      {s.shop_name || "(no name)"}
                    </Link>
                    <div className="muted admin-sub">{s.owner_email}</div>
                  </td>
                  <td>
                    {s.plan_name ?? <span className="muted">No plan</span>}
                    {s.price !== null && <div className="muted admin-sub">{planPrice(s.price, s.plan_period)}</div>}
                  </td>
                  <td>
                    <SubscriptionBadge state={s.state} />
                    <div className="muted admin-sub">{subscriptionLine(s)}</div>
                  </td>
                  <td className="num">
                    {exact(s.total_paid)}
                    <div className="muted admin-sub">{s.last_payment_on ? `Last ${formatDate(s.last_payment_on)}` : "No payments"}</div>
                  </td>
                </tr>
              ))}
              {ordered.length === 0 && (
                <tr className="no-click">
                  <td colSpan={4} className="muted">
                    No workshops here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Recent payments</h2>
        </div>
        {payments.status === "error" && <LoadFailed what="payments" message={payments.message} onRetry={payments.retry} />}
        {payments.status === "ok" && (
          <>
            <PaymentsTable rows={payments.data.rows} showShop />
            <Pager page={page} total={payments.data.total} onPage={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

function PaymentsTable({ rows, showShop, onDelete }: { rows: Payment[]; showShop?: boolean; onDelete?: (p: Payment) => void }) {
  if (rows.length === 0) return <p className="muted">No payments recorded yet.</p>;
  return (
    <div className="table-scroll">
      <table className="sales-table admin-table admin-table-static">
        <thead>
          <tr>
            <th>Date</th>
            {showShop && <th>Workshop</th>}
            <th className="num">Amount</th>
            <th>Method</th>
            <th>Covers until</th>
            {onDelete && <th aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <span className="nowrap">{formatDate(p.paid_on)}</span>
                {p.notes && <div className="muted admin-sub">{p.notes}</div>}
              </td>
              {showShop && (
                <td>
                  <Link to={`/admin/workshops/${p.shop_id}?tab=billing`} className="admin-row-link">
                    {p.shop_name || "(no name)"}
                  </Link>
                </td>
              )}
              <td className="num">{exact(p.amount)}</td>
              <td>
                {METHOD_LABELS[p.method]}
                {p.reference && <div className="muted admin-sub">{p.reference}</div>}
              </td>
              <td>{p.covers_until ? formatDate(p.covers_until) : <span className="muted">-</span>}</td>
              {onDelete && (
                <td className="num">
                  <button type="button" className="link-button danger-link" onClick={() => onDelete(p)}>
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plans

function PlansCard({ plans, onSaved }: { plans: Plan[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Plans</h2>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing("new")}>
          Add plan
        </button>
      </div>
      {plans.length === 0 && !editing && (
        <p className="muted">No plans yet. Add your first plan (for example "Basic", ₹499 per month) to start billing workshops.</p>
      )}
      {plans.length > 0 && (
        <ul className="admin-list">
          {plans.map((p) => (
            <li key={p.id}>
              <button type="button" className="admin-list-row plan-row" onClick={() => setEditing(p)}>
                <span>
                  <strong>{p.name}</strong> {!p.active && <span className="badge">Not on sale</span>}
                  <span className="muted admin-sub">{p.description || "No description"}</span>
                </span>
                <span className="num">
                  {planPrice(p.price, p.period)}
                  <span className="muted admin-sub">
                    {p.workshops} {p.workshops === 1 ? "workshop" : "workshops"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <PlanForm
          plan={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onSaved();
          }}
        />
      )}
    </section>
  );
}

function PlanForm({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState(plan ? String(plan.price) : "");
  const [period, setPeriod] = useState<PlanPeriod>(plan?.period ?? "month");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [active, setActive] = useState(plan?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const amount = Number(price);
    if (!name.trim()) return setError("Enter a plan name.");
    if (price.trim() === "" || !Number.isFinite(amount) || amount < 0) return setError("Enter a price of 0 or more.");
    setSaving(true);
    setError(null);
    try {
      await admin((api) => api.savePlan({ id: plan?.id ?? null, name: name.trim(), price: amount, period, description: description.trim() || null, active }));
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={onSubmit} noValidate>
      <h3>{plan ? `Edit ${plan.name}` : "New plan"}</h3>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <label htmlFor="plan-name">Name</label>
          <input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Basic" />
        </div>
        <div className="field">
          <label htmlFor="plan-price">Price (₹)</label>
          <input id="plan-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="499" />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="plan-period">Billed</label>
          <select id="plan-period" value={period} onChange={(e) => setPeriod(e.target.value as PlanPeriod)}>
            <option value="month">Every month</option>
            <option value="year">Every year</option>
          </select>
        </div>
        <label className="check plan-active">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          On sale (can be given to workshops)
        </label>
      </div>
      <div className="field">
        <label htmlFor="plan-desc">
          Description <span className="optional">(optional)</span>
        </label>
        <input id="plan-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One workshop, unlimited bills" />
      </div>
      <div className="admin-form-actions">
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save plan"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// The "Subscription & payments" tab of a workshop

type Notice = { kind: "success" | "error"; text: string } | null;

export function BillingTab({ shopId, version, onDone }: { shopId: string; version: number; onDone: (n: Notice) => void }) {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [deleting, setDeleting] = useState<Payment | null>(null);
  const data = useLoad(`admin-sub|${shopId}|${version}`, () =>
    admin(async (api) => {
      const [sub, plans] = await Promise.all([api.subscription(shopId), api.plans()]);
      return { sub, plans };
    }),
  );
  const payments = useLoad(`admin-shop-payments|${shopId}|${page}|${version}`, () => admin((api) => api.payments(shopId, page)));

  if (data.status === "loading") return <p className="page-status">Loading…</p>;
  if (data.status === "error") return <LoadFailed what="the subscription" message={data.message} onRetry={data.retry} />;
  const { sub, plans } = data.data;
  if (!sub) return <p className="muted">No subscription found for this workshop.</p>;

  async function remove(p: Payment) {
    try {
      await admin((api) => api.deletePayment(p.id));
      onDone({ kind: "success", text: `Deleted the ${exact(p.amount)} payment of ${formatDate(p.paid_on)}. Check "paid until" if it should change.` });
    } catch (err) {
      onDone({ kind: "error", text: errorMessage(err) });
    }
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Subscription</h2>
          <div className="admin-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => (setEditing(!editing), setPaying(false))}>
              {editing ? "Close" : "Change"}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => (setPaying(!paying), setEditing(false))}>
              {paying ? "Close" : "Record payment"}
            </button>
          </div>
        </div>
        <dl className="admin-facts">
          <dt>Status</dt>
          <dd>
            <SubscriptionBadge state={sub.state} /> <span className="muted">{subscriptionLine(sub)}</span>
          </dd>
          <dt>Plan</dt>
          <dd>{sub.plan_name ? `${sub.plan_name} (${planPrice(sub.plan_price, sub.plan_period)})` : "No plan yet"}</dd>
          <dt>Price for this workshop</dt>
          <dd>
            {planPrice(sub.price, sub.plan_period)}
            {sub.plan_price !== null && sub.price !== null && sub.price !== sub.plan_price && <span className="muted"> (agreed price)</span>}
          </dd>
          <dt>Free trial until</dt>
          <dd>{sub.trial_ends_at ? formatDate(sub.trial_ends_at) : "-"}</dd>
          <dt>Paid until</dt>
          <dd>{sub.paid_until ? formatDate(sub.paid_until) : "-"}</dd>
          <dt>Paid so far</dt>
          <dd>{exact(sub.total_paid)}</dd>
          {sub.notes && (
            <>
              <dt>Notes</dt>
              <dd>{sub.notes}</dd>
            </>
          )}
        </dl>
        {editing && (
          <SubscriptionForm
            sub={sub}
            plans={plans}
            onClose={() => setEditing(false)}
            onSaved={(text) => {
              setEditing(false);
              onDone({ kind: "success", text });
            }}
          />
        )}
        {paying && (
          <PaymentForm
            sub={sub}
            plans={plans}
            onClose={() => setPaying(false)}
            onSaved={(text) => {
              setPaying(false);
              onDone({ kind: "success", text });
            }}
          />
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Payments</h2>
        </div>
        {payments.status === "error" && <LoadFailed what="payments" message={payments.message} onRetry={payments.retry} />}
        {payments.status === "ok" && (
          <>
            <PaymentsTable rows={payments.data.rows} onDelete={setDeleting} />
            <Pager page={page} total={payments.data.total} onPage={setPage} />
          </>
        )}
      </section>

      {deleting && (
        <ConfirmDialog
          title="Delete this payment?"
          message={`${exact(deleting.amount)} received ${formatDate(deleting.paid_on)} (${METHOD_LABELS[deleting.method]}). Only delete a payment that was entered by mistake.`}
          confirmLabel="Delete payment"
          cancelLabel="Keep it"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const p = deleting;
            setDeleting(null);
            void remove(p);
          }}
        />
      )}
    </>
  );
}

function SubscriptionForm({ sub, plans, onClose, onSaved }: { sub: AdminSubscription; plans: Plan[]; onClose: () => void; onSaved: (text: string) => void }) {
  const [planId, setPlanId] = useState(sub.plan_id ?? "");
  const [status, setStatus] = useState<SubscriptionStatus>(sub.status);
  const [trialEnds, setTrialEnds] = useState(sub.trial_ends_at ?? "");
  const [paidUntil, setPaidUntil] = useState(sub.paid_until ?? "");
  const [price, setPrice] = useState(sub.plan_price !== null && sub.price !== sub.plan_price && sub.price !== null ? String(sub.price) : "");
  const [notes, setNotes] = useState(sub.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const plan = plans.find((p) => p.id === planId) ?? null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const custom = price.trim() === "" ? null : Number(price);
    if (custom !== null && (!Number.isFinite(custom) || custom < 0)) return setError("Enter a price of 0 or more, or leave it empty.");
    if (status === "active" && !planId) return setError("Choose a plan for an active subscription.");
    setSaving(true);
    setError(null);
    try {
      await admin((api) =>
        api.updateSubscription(sub.shop_id, {
          plan_id: planId || null,
          status,
          trial_ends_at: trialEnds || null,
          paid_until: paidUntil || null,
          price: custom,
          notes: notes.trim() || null,
        }),
      );
      onSaved(`Subscription for ${sub.shop_name} saved.`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={onSubmit} noValidate>
      <h3>Change subscription</h3>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <label htmlFor="sub-plan">Plan</label>
          <select id="sub-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">No plan</option>
            {plans
              .filter((p) => p.active || p.id === sub.plan_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({planPrice(p.price, p.period)})
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sub-status">Status</label>
          <select id="sub-status" value={status} onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}>
            <option value="trial">Free trial</option>
            <option value="active">Active (paying)</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="sub-trial">Free trial until</label>
          <input id="sub-trial" type="date" value={trialEnds} onChange={(e) => setTrialEnds(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sub-paid">Paid until</label>
          <input id="sub-paid" type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="sub-price">
          Agreed price (₹) <span className="optional">(optional)</span>
        </label>
        <input
          id="sub-price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={plan ? `${plan.price} (plan price)` : "Plan price"}
        />
        <p className="hint">Leave empty to use the plan's price. Use it for discounts agreed with this workshop.</p>
      </div>
      <div className="field">
        <label htmlFor="sub-notes">
          Notes <span className="optional">(optional)</span>
        </label>
        <input id="sub-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Pays by UPI on the 5th" />
      </div>
      <div className="admin-form-actions">
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function PaymentForm({ sub, plans, onClose, onSaved }: { sub: AdminSubscription; plans: Plan[]; onClose: () => void; onSaved: (text: string) => void }) {
  const today = todayISO();
  const plan = plans.find((p) => p.id === sub.plan_id) ?? null;
  // One period on from whichever is later: today, or the current "paid until".
  const from = sub.paid_until && sub.paid_until > today ? sub.paid_until : today;
  const [amount, setAmount] = useState(sub.price !== null ? String(sub.price) : "");
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [reference, setReference] = useState("");
  const [coversUntil, setCoversUntil] = useState(plan ? nextPeriodEnd(from, plan.period) : "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter the amount received.");
    if (!paidOn) return setError("Enter the date it was paid.");
    setSaving(true);
    setError(null);
    try {
      await admin((api) =>
        api.recordPayment(sub.shop_id, {
          amount: value,
          paid_on: paidOn,
          method,
          reference: reference.trim() || null,
          covers_until: coversUntil || null,
          notes: notes.trim() || null,
        }),
      );
      onSaved(`Recorded ${exact(value)} from ${sub.shop_name}${coversUntil ? `; paid until ${formatDate(coversUntil)}` : ""}.`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={onSubmit} noValidate>
      <h3>Record a payment</h3>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <label htmlFor="pay-amount">Amount received (₹)</label>
          <input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pay-date">Paid on</label>
          <input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="pay-method">How</label>
          <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pay-ref">
            Reference <span className="optional">(optional)</span>
          </label>
          <input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI / transaction number" />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="pay-covers">
            Pays up to <span className="optional">(optional)</span>
          </label>
          <input id="pay-covers" type="date" value={coversUntil} onChange={(e) => setCoversUntil(e.target.value)} />
          <p className="hint">Moves "paid until" forward and marks the subscription active.</p>
        </div>
        <div className="field">
          <label htmlFor="pay-notes">
            Notes <span className="optional">(optional)</span>
          </label>
          <input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="admin-form-actions">
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Record payment"}
        </button>
      </div>
      <p className="hint">Recorded {formatDateTime(new Date().toISOString())} by you; it appears in the activity log.</p>
    </form>
  );
}
