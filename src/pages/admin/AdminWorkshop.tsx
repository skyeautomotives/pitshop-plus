import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import ConfirmDialog from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/cards";
import { admin } from "../../lib/admin/api";
import { AUDIT_LABELS, formatDateTime, isDisabled, timeAgo } from "../../lib/admin/format";
import type { AdminLogin, AdminShop, LoginAction } from "../../lib/admin/types";
import { formatDate } from "../../lib/format";
import { formatINR, rupeesToPaise } from "../../lib/money";
import { errorMessage } from "../../lib/supabase";
import { useLoad } from "../../lib/useLoad";
import { usePageTitle } from "../../lib/usePageTitle";
import { LoadFailed, Pager, ShopStatus, Tile } from "./parts";

const inr = (rupees: number) => formatINR(rupeesToPaise(rupees));

const TABS = [
  { id: "logins", label: "Logins" },
  { id: "bills", label: "Bills" },
  { id: "complaints", label: "Complaints" },
  { id: "activity", label: "Admin activity" },
] as const;
type Tab = (typeof TABS)[number]["id"];

type Notice = { kind: "success" | "error"; text: string } | null;

export default function AdminWorkshop() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "logins") as Tab;
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const shop = useLoad(`admin-shop|${id}|${version}`, () => admin((api) => api.shop(id)));
  const lastShop = useRef<AdminShop | null>(null);
  usePageTitle(shop.status === "ok" && shop.data ? shop.data.shop_name : "Workshop");

  const refresh = (n: Notice) => {
    setNotice(n);
    setVersion((v) => v + 1);
  };

  // While reloading after an action, keep showing the workshop (and its open tab).
  if (shop.status === "ok") lastShop.current = shop.data;
  const s = shop.status === "ok" ? shop.data : lastShop.current?.id === id ? lastShop.current : null;

  if (shop.status === "error") return <LoadFailed what="the workshop" message={shop.message} onRetry={shop.retry} />;
  if (!s && shop.status === "loading") return <p className="page-status">Loading…</p>;
  if (!s)
    return (
      <div className="empty">
        <h1>Workshop not found</h1>
        <Link to="/admin/workshops" className="btn btn-primary">
          All workshops
        </Link>
      </div>
    );

  return (
    <div>
      <Link to="/admin/workshops" className="back-link">
        ← All workshops
      </Link>
      <header className="dash-head">
        <div>
          <h1 className="admin-title">
            {s.shop_name || "(no name)"} <ShopStatus shop={s} />
          </h1>
          <p className="muted">
            Signed up {formatDateTime(s.created_at)} · last activity {timeAgo(s.last_activity).toLowerCase()}
          </p>
        </div>
        <SuspendButton shop={s} onDone={refresh} />
      </header>

      {notice && (
        <div className={`alert ${notice.kind === "success" ? "alert-success" : "alert-error"}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}

      {s.suspended_at && (
        <div className="alert alert-error" role="status">
          <span>
            <strong>Suspended {formatDateTime(s.suspended_at)}.</strong> {s.suspended_reason && `Reason: ${s.suspended_reason}. `}Its logins can't see or change anything until it is
            reactivated. Its data is kept.
          </span>
        </div>
      )}

      <div className="admin-shop-grid">
        <section className="card">
          <h2>Details</h2>
          <dl className="admin-facts">
            <dt>Owner</dt>
            <dd>{s.owner_name || "-"}</dd>
            <dt>Owner email</dt>
            <dd>
              {s.owner_email || "-"} {!s.owner_confirmed && <span className="badge admin-badge-pending">Not confirmed</span>}
            </dd>
            <dt>Phone</dt>
            <dd>{s.phone || "-"}</dd>
            <dt>Address</dt>
            <dd>{s.address || "-"}</dd>
            <dt>Workshop ID</dt>
            <dd className="admin-id">{s.id}</dd>
          </dl>
        </section>
        <div className="tiles admin-shop-tiles">
          <Tile label="Logins" value={s.logins} />
          <Tile label="Bills" value={s.bills.toLocaleString("en-IN")} />
          <Tile label="Complaints" value={s.complaints.toLocaleString("en-IN")} />
          <Tile strong label="Billed, all time" value={inr(s.total_billed)} />
        </div>
      </div>

      <div className="segmented admin-tabs" role="tablist" aria-label="Workshop data">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-pressed={tab === t.id}
            onClick={() => {
              setNotice(null);
              setParams(t.id === "logins" ? {} : { tab: t.id }, { replace: true });
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "logins" && <LoginsTab shopId={s.id} version={version} onDone={refresh} />}
      {tab === "bills" && <BillsTab shopId={s.id} />}
      {tab === "complaints" && <ComplaintsTab shopId={s.id} />}
      {tab === "activity" && <ActivityTab shopId={s.id} version={version} />}
    </div>
  );
}

function SuspendButton({ shop, onDone }: { shop: AdminShop; onDone: (n: Notice) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const suspended = !!shop.suspended_at;

  const run = async (suspend: boolean, why?: string) => {
    setBusy(true);
    setError("");
    try {
      await admin((api) => api.setSuspended(shop.id, suspend, why));
      setOpen(false);
      setReason("");
      onDone({ kind: "success", text: suspend ? `${shop.shop_name} is suspended.` : `${shop.shop_name} is active again.` });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Enter a reason. The workshop's logins see it.");
      return;
    }
    void run(true, reason);
  };

  return (
    <>
      {suspended ? (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setOpen(true)}>
          Reactivate workshop
        </button>
      ) : (
        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setOpen(true)}>
          Suspend workshop
        </button>
      )}
      {open && suspended && (
        <ConfirmDialog
          title="Reactivate this workshop?"
          message={`${shop.shop_name}'s logins can use Pitstop Plus again straight away.`}
          confirmLabel={busy ? "Reactivating…" : "Reactivate"}
          cancelLabel="Cancel"
          onConfirm={() => void run(false)}
          onCancel={() => setOpen(false)}
        />
      )}
      {open && !suspended && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="suspend-title" onSubmit={onSubmit} noValidate>
            <h2 id="suspend-title">Suspend {shop.shop_name}?</h2>
            <p className="hint">
              All of its logins lose access to bills, complaints and settings until you reactivate it. Nothing is deleted.
            </p>
            <div className={`field${error ? " has-error" : ""}`}>
              <label htmlFor="f-suspend-reason">Reason (shown to the workshop)</label>
              <textarea
                id="f-suspend-reason"
                rows={3}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
                aria-invalid={error ? true : undefined}
              />
              {error && <p className="field-error">{error}</p>}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-danger" disabled={busy}>
                {busy ? "Suspending…" : "Suspend"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** A random 12-character password without look-alike characters. */
function randomPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function LoginsTab({ shopId, version, onDone }: { shopId: string; version: number; onDone: (n: Notice) => void }) {
  const logins = useLoad(`admin-logins|${shopId}|${version}`, () => admin((api) => api.logins(shopId)));
  const [confirm, setConfirm] = useState<{ login: AdminLogin; action: Exclude<LoginAction, "reset_password"> } | null>(null);
  const [resetting, setResetting] = useState<{ login: AdminLogin; password: string; error: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (login: AdminLogin, action: LoginAction, password?: string) => {
    setBusy(true);
    try {
      await admin((api) => api.loginAction(login.user_id, action, password));
      const who = login.full_name || login.username;
      const text = {
        reset_password: `${who}'s password is changed. Give them the new password: ${password}`,
        disable: `${who} can no longer sign in.`,
        enable: `${who} can sign in again.`,
        remove: `${who}'s login is removed.`,
      }[action];
      setConfirm(null);
      setResetting(null);
      onDone({ kind: "success", text });
    } catch (err) {
      if (action === "reset_password") setResetting((r) => (r ? { ...r, error: errorMessage(err) } : r));
      else {
        setConfirm(null);
        onDone({ kind: "error", text: errorMessage(err) });
      }
    } finally {
      setBusy(false);
    }
  };

  if (logins.status === "loading") return <p className="page-status">Loading logins…</p>;
  if (logins.status === "error") return <LoadFailed what="logins" message={logins.message} onRetry={logins.retry} />;

  return (
    <section className="card">
      <div className="table-scroll">
        <table className="sales-table admin-table admin-table-static">
          <thead>
            <tr>
              <th>Name</th>
              <th>Signs in with</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last sign-in</th>
              <th>Added</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {logins.data.map((l) => {
              const disabled = isDisabled(l);
              return (
                <tr key={l.user_id}>
                  <td>
                    <strong>{l.full_name || "-"}</strong>
                  </td>
                  <td>{l.role === "owner" ? l.email : l.username}</td>
                  <td>
                    <span className={`badge ${l.role === "owner" ? "badge-owner" : ""}`}>{l.role === "owner" ? "Owner" : "Staff"}</span>
                  </td>
                  <td>
                    {disabled ? (
                      <span className="badge admin-badge-suspended">Disabled</span>
                    ) : !l.email_confirmed_at ? (
                      <span className="badge admin-badge-pending">Email not confirmed</span>
                    ) : (
                      <span className="badge badge-resolved">Active</span>
                    )}
                  </td>
                  <td>{timeAgo(l.last_sign_in_at)}</td>
                  <td>{formatDate(l.created_at.slice(0, 10))}</td>
                  <td>
                    <div className="admin-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setResetting({ login: l, password: randomPassword(), error: "" })}
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setConfirm({ login: l, action: disabled ? "enable" : "disable" })}
                      >
                        {disabled ? "Enable" : "Disable"}
                      </button>
                      {l.role !== "owner" && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirm({ login: l, action: "remove" })}>
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirm && (
        <ConfirmDialog
          title={
            { disable: "Disable this login?", enable: "Enable this login?", remove: "Remove this login?" }[confirm.action]
          }
          message={
            {
              disable: `${confirm.login.full_name || confirm.login.username} won't be able to sign in. A sign-in that's already open stops within the hour.`,
              enable: `${confirm.login.full_name || confirm.login.username} will be able to sign in again.`,
              remove: `${confirm.login.full_name || confirm.login.username}'s login is deleted. Bills and complaints they made are kept. This can't be undone.`,
            }[confirm.action]
          }
          confirmLabel={busy ? "Working…" : { disable: "Disable", enable: "Enable", remove: "Remove" }[confirm.action]}
          cancelLabel="Cancel"
          onConfirm={() => void run(confirm.login, confirm.action)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {resetting && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-reset-title"
            onSubmit={(e) => {
              e.preventDefault();
              if (resetting.password.length < 8) {
                setResetting({ ...resetting, error: "Password must be at least 8 characters." });
                return;
              }
              void run(resetting.login, "reset_password", resetting.password);
            }}
            noValidate
          >
            <h2 id="admin-reset-title">Reset password for {resetting.login.full_name || resetting.login.username}</h2>
            <p className="hint">Give the new password to the person. They can sign in with it straight away.</p>
            <div className={`field${resetting.error ? " has-error" : ""}`}>
              <label htmlFor="f-admin-reset">New password</label>
              <div className="password-row">
                <input
                  id="f-admin-reset"
                  type="text"
                  value={resetting.password}
                  onChange={(e) => setResetting({ ...resetting, password: e.target.value, error: "" })}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setResetting({ ...resetting, password: randomPassword(), error: "" })}>
                  New one
                </button>
              </div>
              {resetting.error && <p className="field-error">{resetting.error}</p>}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setResetting(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Set password"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

/** Search box that updates `onSearch` a moment after the last key. */
function SearchBox({ id, placeholder, onSearch }: { id: string; placeholder: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const t = setTimeout(() => onSearch(text.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <input id={id} type="search" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
    </>
  );
}

function BillsTab({ shopId }: { shopId: string }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const bills = useLoad(`admin-bills|${shopId}|${q}|${page}`, () => admin((api) => api.bills(shopId, q, page)));

  return (
    <section className="card">
      <div className="admin-tab-tools">
        <SearchBox
          id="admin-bill-search"
          placeholder="Search by customer, phone or vehicle number"
          onSearch={(v) => {
            setQ(v);
            setPage(0);
          }}
        />
      </div>
      {bills.status === "loading" && <p className="page-status">Loading bills…</p>}
      {bills.status === "error" && <LoadFailed what="bills" message={bills.message} onRetry={bills.retry} />}
      {bills.status === "ok" &&
        (bills.data.rows.length === 0 ? (
          <p className="muted">{q ? "No bills match." : "This workshop hasn't made any bills yet."}</p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="sales-table admin-table">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Vehicle</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.data.rows.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link to={`/admin/bills/${b.id}`} className="admin-row-link">
                          #{b.bill_number}
                        </Link>
                      </td>
                      <td>{formatDate(b.date_received)}</td>
                      <td>{b.customer_name}</td>
                      <td>{b.phone}</td>
                      <td className="reg">{b.vehicle_reg}</td>
                      <td className="num">{inr(b.grand_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={bills.data.total} onPage={setPage} />
          </>
        ))}
    </section>
  );
}

function ComplaintsTab({ shopId }: { shopId: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"open" | "resolved" | null>(null);
  const [page, setPage] = useState(0);
  const complaints = useLoad(`admin-complaints|${shopId}|${q}|${status}|${page}`, () =>
    admin((api) => api.complaints(shopId, q, status, page)),
  );

  return (
    <section className="card">
      <div className="admin-tab-tools">
        <SearchBox
          id="admin-complaint-search"
          placeholder="Search by customer, phone or vehicle number"
          onSearch={(v) => {
            setQ(v);
            setPage(0);
          }}
        />
        <div className="segmented segmented-sm" role="group" aria-label="Status">
          {([null, "open", "resolved"] as const).map((s) => (
            <button
              key={s ?? "all"}
              type="button"
              aria-pressed={status === s}
              onClick={() => {
                setStatus(s);
                setPage(0);
              }}
            >
              {s === null ? "All" : s === "open" ? "Open" : "Resolved"}
            </button>
          ))}
        </div>
      </div>
      {complaints.status === "loading" && <p className="page-status">Loading complaints…</p>}
      {complaints.status === "error" && <LoadFailed what="complaints" message={complaints.message} onRetry={complaints.retry} />}
      {complaints.status === "ok" &&
        (complaints.data.rows.length === 0 ? (
          <p className="muted">{q || status ? "No complaints match." : "This workshop hasn't recorded any complaints yet."}</p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="sales-table admin-table">
                <thead>
                  <tr>
                    <th>Complaint</th>
                    <th>Reported</th>
                    <th>Customer</th>
                    <th>Vehicle</th>
                    <th>Problem</th>
                    <th>Attended by</th>
                    <th>Status</th>
                    <th className="num">Bills</th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.data.rows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/admin/complaints/${c.id}`} className="admin-row-link">
                          #{c.complaint_number}
                        </Link>
                      </td>
                      <td>{formatDate(c.reported_on)}</td>
                      <td>{c.customer_name}</td>
                      <td className="reg">{c.vehicle_reg}</td>
                      <td className="admin-wrap">{c.description}</td>
                      <td>{c.attended_by || "-"}</td>
                      <td>
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="num">{c.bills}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={complaints.data.total} onPage={setPage} />
          </>
        ))}
    </section>
  );
}

function ActivityTab({ shopId, version }: { shopId: string; version: number }) {
  const [page, setPage] = useState(0);
  const log = useLoad(`admin-audit|${shopId}|${page}|${version}`, () => admin((api) => api.audit(shopId, page)));
  if (log.status === "loading") return <p className="page-status">Loading…</p>;
  if (log.status === "error") return <LoadFailed what="admin activity" message={log.message} onRetry={log.retry} />;
  if (log.data.rows.length === 0)
    return (
      <section className="card">
        <p className="muted">No admin has changed anything for this workshop yet.</p>
      </section>
    );
  return (
    <section className="card">
      <ul className="admin-list">
        {log.data.rows.map((a) => (
          <li key={a.id} className="admin-list-row">
            <span>
              <strong>{AUDIT_LABELS[a.action] ?? a.action}</strong> · {a.target_label}
              {typeof a.details.reason === "string" && <span className="muted admin-sub">Reason: {a.details.reason}</span>}
            </span>
            <span className="muted">
              {a.admin_email} · {formatDateTime(a.created_at)}
            </span>
          </li>
        ))}
      </ul>
      <Pager page={page} total={log.data.total} onPage={setPage} />
    </section>
  );
}
