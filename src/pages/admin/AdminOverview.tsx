import { Link } from "react-router";
import { admin } from "../../lib/admin/api";
import { timeAgo } from "../../lib/admin/format";
import { useLoad } from "../../lib/useLoad";
import { usePageTitle } from "../../lib/usePageTitle";
import { LoadFailed, MonthBars, ShopStatus, Tile } from "./parts";

// Whole rupees, so large totals fit their tiles.
const inr = (rupees: number) => `₹${Math.round(rupees).toLocaleString("en-IN")}`;
const count = (n: number) => n.toLocaleString("en-IN");

export default function AdminOverview() {
  usePageTitle("Admin overview");
  const data = useLoad("admin-overview", () =>
    admin(async (api) => {
      const [overview, billing, shops] = await Promise.all([api.overview(), api.billingOverview(), api.shops()]);
      return { overview, billing, recent: shops.slice(0, 5) };
    }),
  );

  if (data.status === "loading") return <p className="page-status">Loading…</p>;
  if (data.status === "error") return <LoadFailed what="the overview" message={data.message} onRetry={data.retry} />;
  const { overview: o, billing: b, recent } = data.data;
  const months = o.by_month.map((m) => m.month);

  return (
    <div className="admin-overview">
      <header className="dash-head">
        <div>
          <h1>Platform overview</h1>
          <p className="muted">All Pitstop Plus workshops</p>
        </div>
        <div className="dash-head-actions">
          <Link to="/admin/workshops" className="btn btn-primary">
            View workshops
          </Link>
        </div>
      </header>

      <div className="tiles dash-tiles">
        <Tile strong to="/admin/workshops" label="Workshops" value={count(o.workshops)} sub={`${o.new_30d} new in the last 30 days`} />
        <Tile label="Active (30 days)" value={count(o.active_30d)} sub="Made or changed a bill or complaint" />
        <Tile to="/admin/workshops?show=suspended" label="Suspended" value={count(o.suspended)} sub="Can't use the app" />
        <Tile label="Logins" value={count(o.logins)} sub="Owners and staff" />
      </div>
      <div className="tiles dash-tiles">
        <Tile strong to="/admin/billing" label="Monthly revenue" value={inr(b.mrr)} sub={`${count(b.paying)} paying workshops`} />
        <Tile to="/admin/billing" label="Collected this month" value={inr(b.collected_month)} sub={`${count(b.overdue)} overdue`} />
        <Tile label="Bills made" value={count(o.bills)} sub={`${count(o.bills_30d)} in the last 30 days`} />
        <Tile label="Complaints recorded" value={count(o.complaints)} sub="All workshops, all time" />
      </div>

      <div className="admin-charts">
        <section className="card">
          <div className="card-head">
            <h2>Bills made per month</h2>
          </div>
          <MonthBars
            label="Number of bills made by all workshops per month, last 12 months"
            months={months}
            value={(i) => o.by_month[i].bills}
            format={(v) => `${count(v)} ${v === 1 ? "bill" : "bills"}`}
            axis={(v) => (Number.isInteger(v) ? count(v) : "")}
            color="#2a78d6"
          />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>New workshops per month</h2>
          </div>
          <MonthBars
            label="Workshops signed up per month, last 12 months"
            months={months}
            value={(i) => o.by_month[i].signups}
            format={(v) => `${v} ${v === 1 ? "workshop" : "workshops"}`}
            axis={(v) => (Number.isInteger(v) ? String(v) : "")}
            minMax={4}
            color="#eb6834"
          />
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Latest sign-ups</h2>
          <Link to="/admin/workshops" className="link-button">
            All workshops →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="muted">No workshops have signed up yet.</p>
        ) : (
          <ul className="admin-list">
            {recent.map((s) => (
              <li key={s.id}>
                <Link to={`/admin/workshops/${s.id}`} className="admin-list-row">
                  <span>
                    <strong>{s.shop_name || "(no name)"}</strong>
                    <ShopStatus shop={s} />
                    <span className="muted admin-sub">
                      {s.owner_name} · {s.owner_email}
                    </span>
                  </span>
                  <span className="muted">Signed up {timeAgo(s.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
