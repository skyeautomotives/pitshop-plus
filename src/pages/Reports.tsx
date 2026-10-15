import { useState } from "react";
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
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
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
  const bills = `${s.bills} ${s.bills === 1 ? "bill" : "bills"}`;
  if (view === "combined")
    return (
      <div className="tiles">
        <Tile
          strong
          label="Total sales (incl. labour)"
          value={formatINR(s.total)}
          sub={s.discount > 0 ? `${bills} · after ${formatINR(s.discount)} discount` : bills}
        />
        <Tile label="Excluding labour" value={formatINR(s.excludingLabour)} sub="Spares + painting & washing" />
      </div>
    );
  return (
    <div className="tiles">
      <Tile strong label="Total sales" value={formatINR(s.total)} sub={bills} />
      <Tile label="Spare parts" value={formatINR(s.spares)} sub="Parts & items on bills" />
      <Tile label="Labour charge" value={formatINR(s.labour)} />
      <Tile label="Painting & washing" value={formatINR(s.services)} />
      {s.discount > 0 && (
        <Tile label="Discounts given" value={`−${formatINR(s.discount)}`} sub="Already taken off the total" />
      )}
    </div>
  );
}

/** Owner-only reports: daily and monthly sales overview. */
const CATEGORIES = [
  {
    label: "Sales",
    items: [
      { id: "daily", label: "Daily sales", hint: "One day's totals" },
      { id: "monthly", label: "Monthly sales", hint: "Month totals, day by day" },
      { id: "chart", label: "Daily comparison", hint: "Chart: with and without labour" },
    ],
  },
  {
    label: "Staff",
    items: [{ id: "staff", label: "Staff performance", hint: "Complaints and bills per person" }],
  },
] as const;

type ReportId = (typeof CATEGORIES)[number]["items"][number]["id"];
const REPORT_IDS = CATEGORIES.flatMap((c) => c.items.map((i) => i.id)) as ReportId[];

/** Month picker with previous/next buttons, shared by the monthly, chart and staff reports. */
function MonthStepper({ month, today, onMonth }: { month: string; today: string; onMonth: (m: string) => void }) {
  return (
    <div className="stepper">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        aria-label="Previous month"
        onClick={() => onMonth(shiftMonth(month, -1))}
      >
        ‹
      </button>
      <input
        type="month"
        aria-label="Month"
        value={month}
        max={today.slice(0, 7)}
        onChange={(e) => e.target.value && onMonth(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-outline btn-sm"
        aria-label="Next month"
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

  if (me.status === "loading") return <p className="page-status">Loading…</p>;
  if (!isOwner)
    return (
      <div className="empty">
        <h1>Reports</h1>
        <p>Only the workshop owner can see reports.</p>
      </div>
    );
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
    <div className="segmented" role="group" aria-label="How to show amounts">
      <button type="button" aria-pressed={view === "separate"} onClick={() => setView("separate")}>
        Spares & labour separately
      </button>
      <button type="button" aria-pressed={view === "combined"} onClick={() => setView("combined")}>
        Combined
      </button>
    </div>
  );

  return (
    <div>
      <div className="sales-head">
        <h1>Reports</h1>
        {viewToggle}
      </div>

      {state.status === "error" && (
        <div className="alert alert-error" role="alert">
          <span>Couldn't load sales. {state.message}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={state.retry}>
            Try again
          </button>
        </div>
      )}

      <div className="settings-layout">
        <nav className="settings-nav card" aria-label="Report categories">
          {CATEGORIES.map((c) => (
            <div key={c.label} className="settings-group">
              <p className="settings-group-label">{c.label}</p>
              <ul>
                {c.items.map((item) => (
                  <li key={item.id}>
                    <NavLink to={`/reports/${item.id}`} className="settings-link">
                      <span>{item.label}</span>
                      <small>{item.hint}</small>
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

  return (
    <>
      {section === "daily" && (
        <section className="card">
          <div className="card-head">
            <h2>Daily sales</h2>
            <div className="stepper">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                aria-label="Previous day"
                onClick={() => onDay(shiftDay(day, -1))}
              >
                ‹
              </button>
              <input type="date" aria-label="Day" value={day} max={today} onChange={(e) => onDay(e.target.value)} />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                aria-label="Next day"
                disabled={day >= today}
                onClick={() => onDay(shiftDay(day, 1))}
              >
                ›
              </button>
            </div>
          </div>
          <p className="muted overview-date">
            {formatDate(day)}
            {day === today && " · Today"}
          </p>
          {loading ? <p className="muted">Loading…</p> : <SummaryTiles s={daySales} view={view} />}
          {!loading && daySales.bills === 0 && <p className="muted">No bills received on this day.</p>}
        </section>
      )}

      {section === "monthly" && (
        <>
          <section className="card">
            <div className="card-head">
              <h2>Monthly sales</h2>
              <MonthStepper month={month} today={today} onMonth={onMonth} />
            </div>
            <p className="muted overview-date">{monthLabel(month)}</p>
            {loading ? (
              <p className="muted">Loading…</p>
            ) : (
              <>
                <SummaryTiles s={monthTotal} view={view} />
                {monthTotal.bills > 0 ? (
                  <p className="month-facts">
                    <span>
                      Average per working day: <b>{formatINR(Math.round(monthTotal.total / activeDays.length))}</b> (
                      {activeDays.length} {activeDays.length === 1 ? "day" : "days"} with bills)
                    </span>
                    {best && (
                      <span>
                        Best day: <b>{formatDate(best.date)}</b> · {formatINR(best.total)}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="muted">
                    {isFutureMonth ? "This month hasn't started yet." : "No bills received this month."}
                  </p>
                )}
              </>
            )}
          </section>

          <section className="card">
            <h2>Day by day</h2>
            {loading ? (
              <p className="muted">Loading…</p>
            ) : activeDays.length === 0 ? (
              <p className="muted">No bills this month.</p>
            ) : (
              <div className="table-scroll">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="num">Bills</th>
                      {view === "separate" ? (
                        <>
                          <th className="num">Spares</th>
                          <th className="num">Labour</th>
                          <th className="num">Painting & washing</th>
                          <th className="num">Discount</th>
                        </>
                      ) : (
                        <th className="num">Excl. labour</th>
                      )}
                      <th className="num">Total</th>
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
                      <td>Month total</td>
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
            <p className="hint">Sales are counted on the bill's "Date received". Tap a day to open its daily sales.</p>
          </section>
        </>
      )}

      {section === "chart" && (
        <section className="card">
          <div className="card-head">
            <h2>Daily comparison</h2>
            <MonthStepper month={month} today={today} onMonth={onMonth} />
          </div>
          <p className="muted overview-date">{monthLabel(month)}</p>
          {loading ? (
            <p className="muted">Loading chart…</p>
          ) : monthTotal.bills === 0 ? (
            <p className="muted">No sales to chart for this month.</p>
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

  let body;
  if (extra.status === "error") {
    body = (
      <div className="alert alert-error" role="alert">
        <span>Couldn't load staff performance. {extra.message}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={extra.retry}>
          Try again
        </button>
      </div>
    );
  } else if (extra.status === "loading" || loadingSales) {
    body = <p className="muted">Loading…</p>;
  } else {
    const [staff, complaints] = extra.data;
    const perf = computeStaffPerformance(staff, rows, complaints);
    const topSales = Math.max(1, ...perf.map((p) => p.sales));
    body = (
      <div className="table-scroll">
        <table className="sales-table staff-table">
          <thead>
            <tr>
              <th>Staff</th>
              <th className="num">Complaints attended</th>
              <th className="num">Resolved</th>
              <th className="num">Bills made</th>
              {view === "separate" && (
                <>
                  <th className="num">Spares</th>
                  <th className="num">Labour</th>
                </>
              )}
              <th className="num">Sales</th>
            </tr>
          </thead>
          <tbody>
            {perf.map((p) => (
              <tr key={p.key} className="no-click">
                <td>
                  <strong>{p.name}</strong>
                  {p.role === "owner" && <span className="badge badge-owner">Owner</span>}
                  {p.role === null && <span className="badge">Not on staff list</span>}
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
        <h2>Staff performance</h2>
        <MonthStepper month={month} today={today} onMonth={onMonth} />
      </div>
      <p className="muted overview-date">{monthLabel(month)}</p>
      {body}
      <p className="hint">
        Complaints count for the staff member who was signed in when the complaint was saved; bills count for whoever
        created them. Complaints are counted by date reported, bills by date received.
      </p>
    </section>
  );
}
