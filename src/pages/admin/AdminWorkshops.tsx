import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { admin } from "../../lib/admin/api";
import { timeAgo } from "../../lib/admin/format";
import type { AdminShop } from "../../lib/admin/types";
import { formatINR, rupeesToPaise } from "../../lib/money";
import { useLoad } from "../../lib/useLoad";
import { usePageTitle } from "../../lib/usePageTitle";
import { LoadFailed, ShopStatus } from "./parts";

type Show = "all" | "active" | "suspended" | "unconfirmed";

const FILTERS: { id: Show; label: string; test: (s: AdminShop) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "active", label: "Active", test: (s) => !s.suspended_at },
  { id: "suspended", label: "Suspended", test: (s) => !!s.suspended_at },
  { id: "unconfirmed", label: "Email not confirmed", test: (s) => !s.owner_confirmed },
];

export default function AdminWorkshops() {
  usePageTitle("Workshops");
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get("q") ?? "";
  const show = (FILTERS.find((f) => f.id === params.get("show"))?.id ?? "all") as Show;
  const [text, setText] = useState(q);

  // Search as you type, a moment after the last key.
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() === q) return;
      const next = new URLSearchParams(params);
      if (text.trim()) next.set("q", text.trim());
      else next.delete("q");
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [text, q, params, setParams]);

  const shops = useLoad(`admin-shops|${q}`, () => admin((api) => api.shops(q)));
  const setShow = (id: Show) => {
    const next = new URLSearchParams(params);
    if (id === "all") next.delete("show");
    else next.set("show", id);
    setParams(next, { replace: true });
  };

  const all = shops.status === "ok" ? shops.data : [];
  const rows = all.filter(FILTERS.find((f) => f.id === show)!.test);

  return (
    <div>
      <h1>Workshops</h1>
      <div className="card search-card">
        <label htmlFor="admin-shop-search" className="sr-only">
          Search workshops
        </label>
        <input
          id="admin-shop-search"
          type="search"
          placeholder="Search by workshop name, owner, email or phone"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="filter-bar" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip${show === f.id ? " chip-active" : ""}`}
            aria-pressed={show === f.id}
            onClick={() => setShow(f.id)}
          >
            {f.label}
            {shops.status === "ok" && <span className="chip-count">{all.filter(f.test).length}</span>}
          </button>
        ))}
      </div>

      {shops.status === "loading" && <p className="page-status">Loading workshops…</p>}
      {shops.status === "error" && <LoadFailed what="workshops" message={shops.message} onRetry={shops.retry} />}
      {shops.status === "ok" &&
        (rows.length === 0 ? (
          <p className="empty-list muted">{q ? `No workshops match "${q}".` : "No workshops here."}</p>
        ) : (
          <section className="card">
            <div className="table-scroll">
              <table className="sales-table admin-table">
                <thead>
                  <tr>
                    <th>Workshop</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th>Signed up</th>
                    <th className="num">Logins</th>
                    <th className="num">Bills</th>
                    <th className="num">Billed</th>
                    <th>Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} onClick={() => navigate(`/admin/workshops/${s.id}`)}>
                      <td>
                        <Link to={`/admin/workshops/${s.id}`} onClick={(e) => e.stopPropagation()} className="admin-row-link">
                          {s.shop_name || "(no name)"}
                        </Link>
                        <div className="muted admin-sub">{s.phone || "No phone"}</div>
                      </td>
                      <td>
                        {s.owner_name}
                        <div className="muted admin-sub">{s.owner_email}</div>
                      </td>
                      <td>
                        <ShopStatus shop={s} />
                      </td>
                      <td>{new Date(s.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="num">{s.logins}</td>
                      <td className="num">{s.bills.toLocaleString("en-IN")}</td>
                      <td className="num">{formatINR(rupeesToPaise(s.total_billed))}</td>
                      <td>{timeAgo(s.last_activity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
    </div>
  );
}
