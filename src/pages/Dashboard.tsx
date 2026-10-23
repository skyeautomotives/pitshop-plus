import type { ReactNode } from "react";
import { useT, type Key } from "../i18n";
import { Link } from "react-router";
import CreditReminders from "../components/CreditReminders";
import MiniSalesChart from "../components/MiniSalesChart";
import { countAllBills, countBillsOn, countOpenComplaints, listStaff, salesForRange, unpaidBills } from "../lib/api";
import { todayISO } from "../lib/customer";
import { formatDate } from "../lib/format";
import { formatINR, rupeesToPaise } from "../lib/money";
import { creditTotals } from "../lib/credit";
import { salesForLastDays, shiftDay, summarize } from "../lib/sales";
import { useShopSettings } from "../lib/shopSettings";
import { useIsOwner, useMe } from "../lib/staff";
import { useLoad } from "../lib/useLoad";
import { isAndroidApp, isDesktopApp } from "../lib/platform";
import { DOWNLOADS } from "./marketing/Site";

const CHART_DAYS = 14;

function Stat({ to, label, value, sub, strong }: { to: string; label: string; value: ReactNode; sub?: string; strong?: boolean }) {
  return (
    <Link to={to} className={`tile tile-link${strong ? " tile-strong" : ""}`}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </Link>
  );
}

const ACTIONS: { to: string; icon: string; label: Key }[] = [
  { to: "/complaints/new", icon: "📝", label: "nav.newComplaint" },
  { to: "/bills/new", icon: "🧾", label: "nav.newBill" },
  { to: "/bills/new?type=sale", icon: "🛒", label: "nav.directSale" },
  { to: "/complaints", icon: "🔧", label: "nav.complaints" },
  { to: "/bills", icon: "🔍", label: "nav.findBills" },
];

/** First steps for a new workshop; once they are done, a card about the other apps. */
function GettingStarted({ isOwner, hasDetails, hasBill, hasStaff }: { isOwner: boolean; hasDetails: boolean; hasBill: boolean; hasStaff: boolean }) {
  const { t, tn } = useT();
  const steps = [
    { done: true, label: t("dashboard.stepRegister"), to: null },
    ...(isOwner ? [{ done: hasDetails, label: t("dashboard.stepDetails"), to: "/settings/shop" }] : []),
    { done: hasBill, label: t("dashboard.stepFirstBill"), to: "/bills/new" },
    ...(isOwner ? [{ done: hasStaff, label: t("dashboard.stepStaff"), to: "/settings/add-staff" }] : []),
  ];
  const left = steps.filter((s) => !s.done).length;
  if (left > 0) {
    return (
      <section className="card dash-side">
        <h2>{t("dashboard.gettingStarted")}</h2>
        <p className="muted">{tn("dashboard.stepsLeft", left)}</p>
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
      <h2>{t("dashboard.everywhereTitle")}</h2>
      <p className="muted">{t("dashboard.everywhereBody")}</p>
      <div className="dash-app-links">
        {!isDesktopApp && (
          <a href={DOWNLOADS.windows} className="btn btn-outline">
            {t("dashboard.windowsApp")}
          </a>
        )}
        {!isAndroidApp && (
          <a href={DOWNLOADS.android} className="btn btn-outline">
            {t("dashboard.androidApp")}
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
  const { t, tn } = useT();
  const today = todayISO();
  const name = me.status === "ok" ? me.me.full_name || me.me.username : "";

  const counts = useLoad(`counts|${today}`, () => Promise.all([countOpenComplaints(), countBillsOn(today), countAllBills()]));
  const owed = useLoad(`unpaid|${today}`, () => unpaidBills());
  const credit = owed.status === "ok" ? creditTotals(owed.data.bills, today) : null;
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
          <h1 className="dash-greet">{name ? t("dashboard.greeting", { name }) : t("dashboard.greetingNoName")}</h1>
          <p className="muted">
            {settings?.shop_name ? `${settings.shop_name} · ` : ""}
            {formatDate(today)}
          </p>
        </div>
        <div className="dash-head-actions">
          <Link to="/complaints/new" className="btn btn-outline">
            {t("nav.newComplaint")}
          </Link>
          <Link to="/bills/new?type=sale" className="btn btn-outline">
            {t("nav.directSale")}
          </Link>
          <Link to="/bills/new" className="btn btn-primary">
            {t("nav.newBill")}
          </Link>
        </div>
      </header>

      <nav className="dash-actions" aria-label={t("nav.quickActions")}>
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} className="dash-action">
            <span className="dash-action-icon" aria-hidden="true">
              {a.icon}
            </span>
            {t(a.label)}
          </Link>
        ))}
      </nav>

      {(counts.status === "error" || sales.status === "error") && (
        <div className="alert alert-error" role="alert">
          <span>{t("dashboard.loadFailed", { message: counts.status === "error" ? counts.message : sales.status === "error" ? sales.message : "" })}</span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              counts.retry();
              sales.retry();
            }}
          >
            {t("common.tryAgain")}
          </button>
        </div>
      )}

      <div className="tiles dash-tiles">
        <Stat
          to="/complaints?show=open"
          label={t("dashboard.openComplaints")}
          value={counts.status === "ok" ? counts.data[0] : "…"}
          sub={t("dashboard.openComplaintsSub")}
        />
        <Stat to="/bills" label={t("dashboard.billsToday")} value={counts.status === "ok" ? counts.data[1] : "…"} sub={formatDate(today)} />
        <Stat
          to="/bills?show=unpaid"
          label={t("dashboard.toCollect")}
          value={owed.status === "ok" ? formatINR(rupeesToPaise(owed.data.due)) : "…"}
          sub={owed.status === "ok" ? tn("dashboard.billCount", owed.data.bills.length) : undefined}
        />
        {credit && credit.total > 0 && (
          <Stat
            to={isOwner ? "/reports/credit" : "/bills?show=unpaid"}
            label={t("credit.outstanding")}
            value={formatINR(rupeesToPaise(credit.total))}
            sub={
              credit.overdue.bills > 0
                ? t("credit.overdueAmount", { amount: formatINR(rupeesToPaise(credit.overdue.amount)) })
                : tn("dashboard.billCount", credit.overdue.bills + credit.soon.bills + credit.later.bills)
            }
          />
        )}
        {isOwner && (
          <>
            <Stat
              strong
              to="/reports/daily"
              label={t("dashboard.todaysSales")}
              value={loadingSales ? "…" : formatINR(todaySales.total)}
              sub={loadingSales ? undefined : t("dashboard.labourAmount", { amount: formatINR(todaySales.labour) })}
            />
            <Stat
              to="/reports/monthly"
              label={t("dashboard.thisMonth")}
              value={loadingSales ? "…" : formatINR(month.total)}
              sub={loadingSales ? undefined : tn("dashboard.billCount", month.bills)}
            />
          </>
        )}
      </div>

      {owed.status === "ok" && <CreditReminders bills={owed.data.bills} showReportLink={isOwner} />}

      <div className="dash-grid">
      {isOwner && (
        <section className="card dash-main">
          <div className="card-head">
            <h2>{t("dashboard.dailySales", { n: CHART_DAYS })}</h2>
            <Link to="/reports/chart" className="link-button">
              {t("dashboard.fullReports")}
            </Link>
          </div>
          {loadingSales ? (
            <p className="muted">{t("dashboard.loadingChart")}</p>
          ) : sales.status === "error" ? null : periodTotal === 0 ? (
            <div className="chart-empty">
              <div className="chart-ghost" aria-hidden="true">
                {[35, 55, 40, 70, 50, 85, 60, 45, 75, 65, 90, 55, 70, 80].map((h, i) => (
                  <span key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
              <p>
                <strong>{t("dashboard.chartEmptyTitle")}</strong>
                <br />
                <span className="muted">{t("dashboard.chartEmptyBody")}</span>
              </p>
              <Link to="/bills/new" className="btn btn-primary btn-sm">
                {t("dashboard.makeBill")}
              </Link>
            </div>
          ) : (
            <>
              <p className="muted mini-chart-total">
                {t("dashboard.periodTotal", { amount: formatINR(periodTotal) })}
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
