import { useState } from "react";
import { locale, useT, type Key } from "../i18n";
import { Navigate, NavLink, useNavigate, useParams } from "react-router";
import SalesChart from "../components/SalesChart";
import { complaintsForRange, listStaff, salesForRange } from "../lib/api";
import { todayISO } from "../lib/customer";
import { formatDate } from "../lib/format";
import { formatINR } from "../lib/money";
import { computeStaffPerformance } from "../lib/performance";
import { monthRange, salesByDay, shiftDay, shiftMonth, summarize, type SaleRow, type SalesSummary } from "../lib/sales";
import { useIsOwner, useMe } from "../lib/staff";
import { useLoad } from "../lib/useLoad";

type View = "combined" | "separate";

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(locale(), { month: "long", year: "numeric" });
}

function Tile({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`tile${strong ? " tile-strong" : ""}`}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

function SummaryTiles({ s, view }: { s: SalesSummary; view: View }) {
  const { t, tn } = useT();
  const bills = tn("dashboard.billCount", s.bills);
  if (view === "combined")
    return (
      <div className="tiles">
        <Tile
          strong
          label={t("reports.totalInclLabour")}
          value={formatINR(s.total)}
          sub={s.discount > 0 ? t("reports.afterDiscount", { bills, amount: formatINR(s.discount) }) : bills}
        />
        <Tile label={t("reports.excludingLabour")} value={formatINR(s.excludingLabour)} sub={t("reports.sparesAndServices")} />
      </div>
    );
  return (
    <div className="tiles">
      <Tile strong label={t("reports.totalSales")} value={formatINR(s.total)} sub={bills} />
      <Tile label={t("reports.spareParts")} value={formatINR(s.spares)} sub={t("reports.sparePartsSub")} />
      <Tile label={t("reports.labourCharge")} value={formatINR(s.labour)} />
      <Tile label={t("reports.paintingWashing")} value={formatINR(s.services)} />
      {s.discount > 0 && <Tile label={t("reports.discounts")} value={`−${formatINR(s.discount)}`} sub={t("reports.discountsSub")} />}
      {s.gst > 0 && <Tile label={t("reports.gstCollected")} value={formatINR(s.gst)} sub={t("reports.gstCollectedSub")} />}
    </div>
  );
}

/** Owner-only reports: daily and monthly sales overview. */
const CATEGORIES = [
  {
    label: "reports.catSales",
    items: [
      { id: "daily", label: "reports.daily", hint: "reports.dailyHint" },
      { id: "monthly", label: "reports.monthly", hint: "reports.monthlyHint" },
      { id: "chart", label: "reports.chart", hint: "reports.chartHint" },
    ],
  },
  {
    label: "reports.catStaff",
    items: [{ id: "staff", label: "reports.staff", hint: "reports.staffHint" }],
  },
] as const satisfies readonly { label: Key; items: readonly { id: string; label: Key; hint: Key }[] }[];

type ReportId = (typeof CATEGORIES)[number]["items"][number]["id"];
const REPORT_IDS = CATEGORIES.flatMap((c) => c.items.map((i) => i.id)) as ReportId[];

/** Month picker with previous/next buttons, shared by the monthly, chart and staff reports. */
function MonthStepper({ month, today, onMonth }: { month: string; today: string; onMonth: (m: string) => void }) {
  const { t } = useT();
  return (
    <div className="stepper">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        aria-label={t("reports.prevMonth")}
        onClick={() => onMonth(shiftMonth(month, -1))}
      >
        ‹
      </button>
      <input
        type="month"
        aria-label={t("reports.month")}
        value={month}
        max={today.slice(0, 7)}
        onChange={(e) => e.target.value && onMonth(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-outline btn-sm"
        aria-label={t("reports.nextMonth")}
        disabled={month >= today.slice(0, 7)}
        onClick={() => onMonth(shiftMonth(month, 1))}
      >
        ›
      </button>
    </div>
  );
}

export default function Reports() {
  const me = useMe();
  const isOwner = useIsOwner();
  const { section } = useParams();
  const navigate = useNavigate();
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState(today);
  const [view, setView] = useState<View>("separate");
  const { from, to } = monthRange(month);
  const state = useLoad(month, () => salesForRange(from, to));
  const { t } = useT();

  if (me.status === "loading") return <p className="page-status">{t("common.loading")}</p>;
  if (!isOwner)
    return (
      <div className="empty empty-list">
        <h1>{t("reports.title")}</h1>
        <p>{t("reports.ownerOnly")}</p>
      </div>
    );
  if (section === "credit") return <Navigate to="/credit-report" replace />;
  if (!section || !REPORT_IDS.includes(section as ReportId)) return <Navigate to="/reports/daily" replace />;
  const current = section as ReportId;

  function goToMonth(m: string) {
    setMonth(m);
    // Keep the selected day inside the month shown: today if it's this month, else the 1st.
    setDay(today.startsWith(m) ? today : `${m}-01`);
  }

  function goToDay(d: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    setDay(d);
    if (!d.startsWith(month)) setMonth(d.slice(0, 7));
  }

  const viewToggle = (
    <div className="segmented" role="group" aria-label={t("reports.howToShow")}>
      <button type="button" aria-pressed={view === "separate"} onClick={() => setView("separate")}>
        {t("reports.separate")}
      </button>
      <button type="button" aria-pressed={view === "combined"} onClick={() => setView("combined")}>
        {t("reports.combined")}
      </button>
    </div>
  );

  return (
    <div>
      <div className="sales-head">
        <h1>{t("reports.title")}</h1>
        {viewToggle}
      </div>

      {state.status === "error" && (
        <div className="alert alert-error" role="alert">
          <span>{t("reports.loadFailed", { message: state.message })}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={state.retry}>
            {t("common.tryAgain")}
          </button>
        </div>
      )}

      <div className="settings-layout">
        <nav className="settings-nav card" aria-label={t("reports.categories")}>
          {CATEGORIES.map((c) => (
            <div key={c.label} className="settings-group">
              <p className="settings-group-label">{t(c.label)}</p>
              <ul>
                {c.items.map((item) => (
                  <li key={item.id}>
                    <NavLink to={`/reports/${item.id}`} className="settings-link">
                      <span>{t(item.label)}</span>
                      <small>{t(item.hint)}</small>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="settings-content">
          {state.status !== "error" && (
            <SalesBody
              section={current}
              loading={state.status === "loading"}
              rows={state.status === "ok" ? state.data : []}
              month={month}
              day={day}
              today={today}
              view={view}
              onMonth={goToMonth}
              onDay={goToDay}
              onOpenDay={(d) => {
                goToDay(d);
                navigate("/reports/daily");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SalesBody({
  section,
  onOpenDay,
  loading,
  rows,
  month,
  day,
  today,
  view,
  onMonth,
  onDay,
}: {
  section: ReportId;
  onOpenDay: (d: string) => void;
  loading: boolean;
  rows: Parameters<typeof summarize>[0];
  month: string;
  day: string;
  today: string;
  view: View;
  onMonth: (m: string) => void;
  onDay: (d: string) => void;
}) {
  const days = salesByDay(rows, month);
  const monthTotal = summarize(rows);
  const daySales = days.find((d) => d.date === day) ?? { date: day, ...summarize([]) };
  const activeDays = days.filter((d) => d.bills > 0);
  const best = activeDays.reduce<(typeof days)[number] | null>((b, d) => (!b || d.total > b.total ? d : b), null);
  const isFutureMonth = month > today.slice(0, 7);
  const { t, tn } = useT();

  return (
    <>
      {section === "daily" && (
        <section className="card">
          <div className="card-head">
            <h2>{t("reports.daily")}</h2>
            <div className="stepper">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                aria-label={t("reports.prevDay")}
                onClick={() => onDay(shiftDay(day, -1))}
              >
                ‹
              </button>
              <input type="date" aria-label={t("reports.day")} value={day} max={today} onChange={(e) => onDay(e.target.value)} />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                aria-label={t("reports.nextDay")}
                disabled={day >= today}
                onClick={() => onDay(shiftDay(day, 1))}
              >
                ›
              </button>
            </div>
          </div>
          <p className="muted overview-date">
            {formatDate(day)}
            {day === today && t("reports.todaySuffix")}
          </p>
          {loading ? <p className="muted">{t("common.loading")}</p> : <SummaryTiles s={daySales} view={view} />}
          {!loading && daySales.bills === 0 && <p className="muted">{t("reports.noBillsDay")}</p>}
        </section>
      )}

      {section === "monthly" && (
        <>
          <section className="card">
            <div className="card-head">
              <h2>{t("reports.monthly")}</h2>
              <MonthStepper month={month} today={today} onMonth={onMonth} />
            </div>
            <p className="muted overview-date">{monthLabel(month)}</p>
            {loading ? (
              <p className="muted">{t("common.loading")}</p>
            ) : (
              <>
                <SummaryTiles s={monthTotal} view={view} />
                {monthTotal.bills > 0 ? (
                  <p className="month-facts">
                    <span>
                      {t("reports.averagePerDay", { amount: formatINR(Math.round(monthTotal.total / activeDays.length)) })}{" "}
                      {tn("reports.daysWithBills", activeDays.length)}
                    </span>
                    {best && <span>{t("reports.bestDay", { date: formatDate(best.date), amount: formatINR(best.total) })}</span>}
                  </p>
                ) : (
                  <p className="muted">
                    {isFutureMonth ? t("reports.notStarted") : t("reports.noBillsMonth")}
                  </p>
                )}
              </>
            )}
          </section>

          <section className="card">
            <h2>{t("reports.dayByDay")}</h2>
            {loading ? (
              <p className="muted">{t("common.loading")}</p>
            ) : activeDays.length === 0 ? (
              <p className="muted">{t("reports.noBillsThisMonth")}</p>
            ) : (
              <div className="table-scroll">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>{t("reports.date")}</th>
                      <th className="num">{t("reports.bills")}</th>
                      {view === "separate" ? (
                        <>
                          <th className="num">{t("reports.spares")}</th>
                          <th className="num">{t("reports.labour")}</th>
                          <th className="num">{t("reports.paintingWashing")}</th>
                          <th className="num">{t("reports.discount")}</th>
                        </>
                      ) : (
                        <th className="num">{t("reports.exclLabour")}</th>
                      )}
                      <th className="num">{t("reports.total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDays.map((d) => (
                      <tr
                        key={d.date}
                        className={d.date === day ? "row-selected" : undefined}
                        onClick={() => onOpenDay(d.date)}
                      >
                        <td>{formatDate(d.date)}</td>
                        <td className="num">{d.bills}</td>
                        {view === "separate" ? (
                          <>
                            <td className="num">{formatINR(d.spares)}</td>
                            <td className="num">{formatINR(d.labour)}</td>
                            <td className="num">{formatINR(d.services)}</td>
                            <td className="num">{d.discount > 0 ? `−${formatINR(d.discount)}` : "-"}</td>
                          </>
                        ) : (
                          <td className="num">{formatINR(d.excludingLabour)}</td>
                        )}
                        <td className="num">
                          <b>{formatINR(d.total)}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>{t("reports.monthTotal")}</td>
                      <td className="num">{monthTotal.bills}</td>
                      {view === "separate" ? (
                        <>
                          <td className="num">{formatINR(monthTotal.spares)}</td>
                          <td className="num">{formatINR(monthTotal.labour)}</td>
                          <td className="num">{formatINR(monthTotal.services)}</td>
                          <td className="num">
                            {monthTotal.discount > 0 ? `−${formatINR(monthTotal.discount)}` : "-"}
                          </td>
                        </>
                      ) : (
                        <td className="num">{formatINR(monthTotal.excludingLabour)}</td>
                      )}
                      <td className="num">{formatINR(monthTotal.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="hint">{t("reports.countedHint")}</p>
          </section>
        </>
      )}

      {section === "chart" && (
        <section className="card">
          <div className="card-head">
            <h2>{t("reports.chart")}</h2>
            <MonthStepper month={month} today={today} onMonth={onMonth} />
          </div>
          <p className="muted overview-date">{monthLabel(month)}</p>
          {loading ? (
            <p className="muted">{t("reports.loadingChart")}</p>
          ) : monthTotal.bills === 0 ? (
            <p className="muted">{t("reports.nothingToChart")}</p>
          ) : (
            <SalesChart days={days} selected={day} onSelect={onOpenDay} />
          )}
        </section>
      )}

      {section === "staff" && (
        <StaffPerformanceSection
          month={month}
          rows={rows}
          loadingSales={loading}
          view={view}
          today={today}
          onMonth={onMonth}
        />
      )}
    </>
  );
}

/** Per-staff complaints attended and bills made for the month (owner only, like the rest of Reports). */
function StaffPerformanceSection({
  month,
  rows,
  loadingSales,
  view,
  today,
  onMonth,
}: {
  month: string;
  rows: SaleRow[];
  loadingSales: boolean;
  view: View;
  today: string;
  onMonth: (m: string) => void;
}) {
  const { from, to } = monthRange(month);
  const extra = useLoad(`staff|${month}`, () => Promise.all([listStaff(), complaintsForRange(from, to)]));
  const { t } = useT();

  let body;
  if (extra.status === "error") {
    body = (
      <div className="alert alert-error" role="alert">
        <span>{t("reports.staffLoadFailed", { message: extra.message })}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={extra.retry}>
          {t("common.tryAgain")}
        </button>
      </div>
    );
  } else if (extra.status === "loading" || loadingSales) {
    body = <p className="muted">{t("common.loading")}</p>;
  } else {
    const [staff, complaints] = extra.data;
    const perf = computeStaffPerformance(staff, rows, complaints);
    const topSales = Math.max(1, ...perf.map((p) => p.sales));
    body = (
      <div className="table-scroll">
        <table className="sales-table staff-table">
          <thead>
            <tr>
              <th>{t("reports.staffCol")}</th>
              <th className="num">{t("reports.complaintsAttended")}</th>
              <th className="num">{t("reports.resolved")}</th>
              <th className="num">{t("reports.billsMade")}</th>
              {view === "separate" && (
                <>
                  <th className="num">{t("reports.spares")}</th>
                  <th className="num">{t("reports.labour")}</th>
                </>
              )}
              <th className="num">{t("reports.sales")}</th>
            </tr>
          </thead>
          <tbody>
            {perf.map((p) => (
              <tr key={p.key} className="no-click">
                <td>
                  <strong>{p.name}</strong>
                  {p.role === "owner" && <span className="badge badge-owner">{t("common.owner")}</span>}
                  {p.role === null && <span className="badge">{t("reports.notOnList")}</span>}
                </td>
                <td className="num">{p.complaints}</td>
                <td className="num">
                  {p.resolved}
                  {p.complaints > 0 && (
                    <span className="muted"> ({Math.round((p.resolved / p.complaints) * 100)}%)</span>
                  )}
                </td>
                <td className="num">{p.bills}</td>
                {view === "separate" && (
                  <>
                    <td className="num">{formatINR(p.spares)}</td>
                    <td className="num">{formatINR(p.labour)}</td>
                  </>
                )}
                <td className="num">
                  <b>{formatINR(p.sales)}</b>
                  <span className="share-bar" aria-hidden="true">
                    <i style={{ width: `${(p.sales / topSales) * 100}%` }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t("reports.staff")}</h2>
        <MonthStepper month={month} today={today} onMonth={onMonth} />
      </div>
      <p className="muted overview-date">{monthLabel(month)}</p>
      {body}
      <p className="hint">{t("reports.staffHintLong")}</p>
    </section>
  );
}
