import { useState } from "react";
import { Link } from "react-router";
import { admin } from "../../lib/admin/api";
import { AUDIT_LABELS, formatDateTime } from "../../lib/admin/format";
import { useLoad } from "../../lib/useLoad";
import { usePageTitle } from "../../lib/usePageTitle";
import { LoadFailed, Pager } from "./parts";

/** Every admin action across all workshops, newest first. */
export default function AdminActivity() {
  usePageTitle("Activity log");
  const [page, setPage] = useState(0);
  const log = useLoad(`admin-audit-all|${page}`, () => admin((api) => api.audit(null, page)));

  return (
    <div>
      <h1>Activity log</h1>
      <p className="muted">Every change made by Pitstop Plus admins: suspensions, password resets and login changes.</p>
      {log.status === "loading" && <p className="page-status">Loading…</p>}
      {log.status === "error" && <LoadFailed what="the activity log" message={log.message} onRetry={log.retry} />}
      {log.status === "ok" &&
        (log.data.rows.length === 0 ? (
          <p className="empty-list muted">No admin actions yet.</p>
        ) : (
          <section className="card">
            <div className="table-scroll">
              <table className="sales-table admin-table admin-table-static">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Workshop</th>
                    <th>Login / details</th>
                  </tr>
                </thead>
                <tbody>
                  {log.data.rows.map((a) => (
                    <tr key={a.id}>
                      <td>{formatDateTime(a.created_at)}</td>
                      <td>{a.admin_email}</td>
                      <td>
                        <strong>{AUDIT_LABELS[a.action] ?? a.action}</strong>
                      </td>
                      <td>
                        {a.shop_id ? (
                          <Link to={`/admin/workshops/${a.shop_id}`} className="admin-row-link">
                            {a.shop_name || "Workshop"}
                          </Link>
                        ) : (
                          <span className="muted">Deleted workshop</span>
                        )}
                      </td>
                      <td className="admin-wrap">
                        {a.action.endsWith("_shop")
                          ? typeof a.details.reason === "string"
                            ? `Reason: ${a.details.reason}`
                            : ""
                          : a.target_label}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={log.data.total} onPage={setPage} />
          </section>
        ))}
    </div>
  );
}
