import type { ReactNode } from "react";
import { Link } from "react-router";
import MiniSalesChart from "../components/MiniSalesChart";
import { countAllBills, countBillsOn, countOpenComplaints, listStaff, salesForRange } from "../lib/api";
import { todayISO } from "../lib/customer";
import { formatDate } from "../lib/format";
import { formatINR } from "../lib/money";
import { salesForLastDays, shiftDay, summarize } from "../lib/sales";
import { useShopSettings } from "../lib/shopSettings";
import { useIsOwner, useMe } from "../lib/staff";
import { useLoad } from "../lib/useLoad";
import { isAndroidApp, isDesktopApp } from "../lib/platform";
import { DOWNLOADS } from "./marketing/Site";

const CHART_DAYS = 14;

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function Stat({ to, label, value, sub, strong }: { to: string; label: string; value: ReactNode; sub?: string; strong?: boolean }) {
  return (
    <Link to={to} className={`tile tile-link${strong ? " tile-strong" : ""}`}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </Link>
  );
}

const ACTIONS = [
  { to: "/complaints/new", icon: "📝", label: "New complaint" },
  { to: "/bills/new", icon: "🧾", label: "New bill" },
  { to: "/complaints", icon: "🔧", label: "Complaints" },
  { to: "/bills", icon: "🔍", label: "Find bills" },
];

/** First steps for a new workshop; once they are done, a card about the other apps. */
function GettingStarted({ isOwner, hasDetails, hasBill, hasStaff }: { isOwner: boolean; hasDetails: boolean; hasBill: boolean; hasStaff: boolean }) {
  const steps = [
    { done: true, label: "Register your workshop", to: null },
    ...(isOwner ? [{ done: hasDetails, label: "Add your address and phone", to: "/settings/shop" }] : []),
    { done: hasBill, label: "Make your first bill", to: "/bills/new" },
    ...(isOwner ? [{ done: hasStaff, label: "Add a staff login (optional)", to: "/settings/add-staff" }] : []),
  ];
  const left = steps.filter((s) => !s.done).length;
  if (left > 0) {
    return (
      <section className="card dash-side">
        <h2>Getting started</h2>
        <p className="muted">
          {left} {left === 1 ? "step" : "steps"} left
        </p>
        <ol className="checklist">
          {steps.map((s) => (
            <li key={s.label} className={s.done ? "done" : ""}>
              <span className="check-dot" aria-hidden="true" />
              {s.done || !s.to ? <span>{s.label}</span> : <Link to={s.to}>{s.label}</Link>}
            </li>
          ))}
        </ol>
      </section>
    );
  }
  // All set: point to the apps this person is not using yet.
  return (
    <section className="card dash-side dash-apps">
      <h2>Pitshop Plus everywhere</h2>
      <p className="muted">Sign in with the same account on your other devices. Every bill shows up on all of them.</p>
      <div className="dash-app-links">
        {!isDesktopApp && (
          <a href={DOWNLOADS.windows} className="btn btn-outline">
            Windows app
          </a>
        )}
        {!isAndroidApp && (
          <a href={DOWNLOADS.android} className="btn btn-outline">
            Android app
          </a>
        )}
      </div>
    </section>
  );
}

/** Landing page after sign-in: greeting, shortcuts, today's numbers and (owners) recent sales. */
export default function Dashboard() {
  const me = useMe();
  const isOwner = useIsOwner();
  const { settings } = useShopSettings();
  const today = todayISO();
  const name = me.status === "ok" ? me.me.full_name || me.me.username : "";

  const counts = useLoad(`counts|${today}`, () => Promise.all([countOpenComplaints(), countBillsOn(today), countAllBills()]));
  const staff = useLoad(`staffcount|${isOwner}`, () => (isOwner ? listStaff().then((l) => l.length) : Promise.resolve(0)));

  // Owners: one fetch covers both the 14-day chart and this month's total.
  const monthStart = `${today.slice(0, 7)}-01`;
  const chartStart = shiftDay(today, -(CHART_DAYS - 1));
  const from = chartStart < monthStart ? chartStart : monthStart;
  const sales = useLoad(`sales|${isOwner}|${today}`, () => (isOwner ? salesForRange(from, today) : Promise.resolve([])));

  const rows = sales.status === "ok" ? sales.data : [];
  const days = salesForLastDays(rows, today, CHART_DAYS);
  const todaySales = days[days.length - 1];
  const month = summarize(rows.filter((r) => r.date_received >= monthStart));
  const periodTotal = days.reduce((sum, d) => sum + d.total, 0);
  const loadingSales = sales.status === "loading";

  return (
    <div className="dashboard">
      <header className="dash-head">
        <div>
          <h1 className="dash-greet">
            {greeting()}
            {name && `, ${name}`}
          </h1>
          <p className="muted">
            {settings?.shop_name ? `${settings.shop_name} · ` : ""}
            {formatDate(today)}
          </p>
        </div>
        <div className="dash-head-actions">
          <Link to="/complaints/new" className="btn btn-outline">
            New complaint
          </Link>
          <Link to="/bills/new" className="btn btn-primary">
            New bill
          </Link>
        </div>
      </header>

      <nav className="dash-actions" aria-label="Quick actions">
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} className="dash-action">
            <span className="dash-action-icon" aria-hidden="true">
              {a.icon}
            </span>
            {a.label}
          </Link>
        ))}
      </nav>

      {(counts.status === "error" || sales.status === "error") && (
        <div className="alert alert-error" role="alert">
          <span>Couldn't load today's numbers. {counts.status === "error" ? counts.message : sales.status === "error" ? sales.message : ""}</span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              counts.retry();
              sales.retry();
            }}
          >
            Try again
          </button>
        </div>
      )}

      <div className="tiles dash-tiles">
        <Stat
          to="/complaints?show=open"
          label="Open complaints"
          value={counts.status === "ok" ? counts.data[0] : "…"}
          sub="Waiting for work or a bill"
        />
        <Stat to="/bills" label="Bills today" value={counts.status === "ok" ? counts.data[1] : "…"} sub={formatDate(today)} />
        {isOwner && (
          <>
            <Stat
              strong
              to="/reports/daily"
              label="Today's sales"
              value={loadingSales ? "…" : formatINR(todaySales.total)}
              sub={loadingSales ? undefined : `Labour ${formatINR(todaySales.labour)}`}
            />
            <Stat
              to="/reports/monthly"
              label="This month"
              value={loadingSales ? "…" : formatINR(month.total)}
              sub={loadingSales ? undefined : `${month.bills} ${month.bills === 1 ? "bill" : "bills"}`}
            />
          </>
        )}
      </div>

      <div className="dash-grid">
      {isOwner && (
        <section className="card dash-main">
          <div className="card-head">
            <h2>Daily sales · last {CHART_DAYS} days</h2>
            <Link to="/reports/chart" className="link-button">
              Full reports →
            </Link>
          </div>
          {loadingSales ? (
            <p className="muted">Loading chart…</p>
          ) : sales.status === "error" ? null : periodTotal === 0 ? (
            <div className="chart-empty">
              <div className="chart-ghost" aria-hidden="true">
                {[35, 55, 40, 70, 50, 85, 60, 45, 75, 65, 90, 55, 70, 80].map((h, i) => (
                  <span key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
              <p>
                <strong>Your daily sales will appear here.</strong>
                <br />
                <span className="muted">Make a bill and it shows up on this chart straight away.</span>
              </p>
              <Link to="/bills/new" className="btn btn-primary btn-sm">
                Make a bill
              </Link>
            </div>
          ) : (
            <>
              <p className="muted mini-chart-total">
                {formatINR(periodTotal)} total, including labour
              </p>
              <MiniSalesChart days={days} today={today} />
            </>
          )}
        </section>
      )}
      {counts.status === "ok" && staff.status !== "loading" && (
        <GettingStarted
          isOwner={isOwner}
          hasDetails={!!(settings?.address && settings?.phone)}
          hasBill={counts.data[2] > 0}
          hasStaff={staff.status === "ok" && staff.data > 1}
        />
      )}
      </div>
    </div>
  );
}
