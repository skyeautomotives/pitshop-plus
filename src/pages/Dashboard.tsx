import type { ReactNode } from "react";
import { Link } from "react-router";
import MiniSalesChart from "../components/MiniSalesChart";
import { countBillsOn, countOpenComplaints, salesForRange } from "../lib/api";
import { todayISO } from "../lib/customer";
import { formatDate } from "../lib/format";
import { formatINR } from "../lib/money";
import { salesForLastDays, shiftDay, summarize } from "../lib/sales";
import { useShopSettings } from "../lib/shopSettings";
import { useIsOwner, useMe } from "../lib/staff";
import { useLoad } from "../lib/useLoad";
import BrandMark from "../components/BrandMark";

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

/** Landing page after sign-in: software logo, shortcuts, today's numbers and (owners) recent sales. */
export default function Dashboard() {
  const me = useMe();
  const isOwner = useIsOwner();
  const { settings } = useShopSettings();
  const today = todayISO();
  const name = me.status === "ok" ? me.me.full_name || me.me.username : "";

  const counts = useLoad(`counts|${today}`, () => Promise.all([countOpenComplaints(), countBillsOn(today)]));

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
      <section className="card dash-hero">
        <BrandMark className="dash-logo" />
        <div className="dash-welcome">
          <p className="dash-greet">
            {greeting()}
            {name && `, ${name}`}
          </p>
          <p className="muted">
            {settings?.shop_name ? `${settings.shop_name} · ` : ""}
            {formatDate(today)}
          </p>
        </div>
      </section>

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

      {isOwner && (
        <section className="card">
          <div className="card-head">
            <h2>Daily sales · last {CHART_DAYS} days</h2>
            <Link to="/reports/chart" className="link-button">
              Full reports →
            </Link>
          </div>
          {loadingSales ? (
            <p className="muted">Loading chart…</p>
          ) : sales.status === "error" ? null : periodTotal === 0 ? (
            <p className="muted">No sales in the last {CHART_DAYS} days yet.</p>
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
    </div>
  );
}
