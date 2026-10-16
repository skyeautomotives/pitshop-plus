// Read-only views of one bill or complaint from any workshop, for support.
import { Link, useParams } from "react-router";
import { StatusBadge } from "../../components/cards";
import { admin } from "../../lib/admin/api";
import { formatDateTime } from "../../lib/admin/format";
import { displayNumber, formatDate } from "../../lib/format";
import { formatINR, rupeesToPaise } from "../../lib/money";
import { useLoad } from "../../lib/useLoad";
import { usePageTitle } from "../../lib/usePageTitle";
import { LoadFailed } from "./parts";

const inr = (rupees: number) => formatINR(rupeesToPaise(rupees));

function NotFound({ what }: { what: string }) {
  return (
    <div className="empty">
      <h1>{what} not found</h1>
      <Link to="/admin/workshops" className="btn btn-primary">
        All workshops
      </Link>
    </div>
  );
}

function ReadOnlyNote({ shopId, shopName, tab }: { shopId: string; shopName: string; tab: string }) {
  return (
    <div className="admin-record-head">
      <Link to={`/admin/workshops/${shopId}?tab=${tab}`} className="back-link">
        ← {shopName || "Workshop"}
      </Link>
      <span className="badge">Read-only</span>
    </div>
  );
}

export function AdminBill() {
  const { id = "" } = useParams();
  const state = useLoad(`admin-bill|${id}`, () => admin((api) => api.bill(id)));
  usePageTitle(state.status === "ok" && state.data ? `Bill #${state.data.bill_number}` : "Bill");

  if (state.status === "loading") return <p className="page-status">Loading bill…</p>;
  if (state.status === "error") return <LoadFailed what="the bill" message={state.message} onRetry={state.retry} />;
  const bill = state.data;
  if (!bill) return <NotFound what="Bill" />;

  return (
    <div>
      <ReadOnlyNote shopId={bill.shop_id} shopName={bill.shop_name} tab="bills" />
      <article className="card bill-doc">
        <header className="bill-head">
          <div>
            <h1 className="shop-name">{bill.shop_name}</h1>
            <p className="shop-line">
              Made by {bill.created_by_name || "a removed login"} · {formatDateTime(bill.created_at)}
            </p>
            {bill.updated_at !== bill.created_at && <p className="shop-line">Last changed {formatDateTime(bill.updated_at)}</p>}
          </div>
          <div className="bill-meta">
            <p className="bill-no">Bill {displayNumber(bill.bill_number)}</p>
            <p>Received: {formatDate(bill.date_received)}</p>
            <p>Delivered: {formatDate(bill.delivered_on)}</p>
          </div>
        </header>

        <dl className="bill-customer">
          <div>
            <dt>Customer</dt>
            <dd>{bill.customer_name}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{bill.phone}</dd>
          </div>
          <div>
            <dt>Vehicle no.</dt>
            <dd className="reg">{bill.vehicle_reg}</dd>
          </div>
          {bill.address && (
            <div className="span-all">
              <dt>Address</dt>
              <dd className="pre-line">{bill.address}</dd>
            </div>
          )}
        </dl>

        {bill.complaints.length > 0 ? (
          <div className="bill-complaints">
            <h2>Complaints addressed</h2>
            <ul>
              {bill.complaints.map((c) => (
                <li key={c.id}>
                  <Link to={`/admin/complaints/${c.id}`} className="complaint-ref">
                    {displayNumber(c.complaint_number)}
                  </Link>{" "}
                  {c.description}
                  <span className="muted">
                    {" "}
                    · reported {formatDate(c.reported_on)}
                    {c.attended_by && ` · attended by ${c.attended_by}`}
                  </span>{" "}
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="muted">This bill is not linked to a complaint.</p>
        )}

        <table className="bill-items">
          <thead>
            <tr>
              <th className="col-no">#</th>
              <th>Item or service</th>
              <th className="col-qty">Qty</th>
              <th className="num">Rate</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.bill_items.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No parts or items recorded.
                </td>
              </tr>
            ) : (
              bill.bill_items.map((item, i) => (
                <tr key={item.id}>
                  <td className="col-no">{i + 1}</td>
                  <td>{item.description}</td>
                  <td className="col-qty">{Number(item.quantity ?? 1)}</td>
                  <td className="num">{inr(item.price)}</td>
                  <td className="num">{inr(item.line_total ?? item.price)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <dl className="bill-totals">
          <div>
            <dt>Items subtotal</dt>
            <dd>{inr(bill.items_subtotal)}</dd>
          </div>
          <div>
            <dt>Labour charge</dt>
            <dd>{inr(bill.labour_charge)}</dd>
          </div>
          {bill.painting_charge !== null && (
            <div>
              <dt>Painting</dt>
              <dd>{inr(bill.painting_charge)}</dd>
            </div>
          )}
          {bill.washing_charge !== null && (
            <div>
              <dt>Washing</dt>
              <dd>{inr(bill.washing_charge)}</dd>
            </div>
          )}
          {Number(bill.discount) > 0 && (
            <div className="discount-row">
              <dt>
                Discount
                {bill.discount_percent !== null && ` (${Number(bill.discount_percent)}%)`}
              </dt>
              <dd>−{inr(bill.discount)}</dd>
            </div>
          )}
          <div className="grand">
            <dt>Grand total</dt>
            <dd>{inr(bill.grand_total)}</dd>
          </div>
        </dl>
      </article>
    </div>
  );
}

export function AdminComplaint() {
  const { id = "" } = useParams();
  const state = useLoad(`admin-complaint|${id}`, () => admin((api) => api.complaint(id)));
  usePageTitle(state.status === "ok" && state.data ? `Complaint #${state.data.complaint_number}` : "Complaint");

  if (state.status === "loading") return <p className="page-status">Loading complaint…</p>;
  if (state.status === "error") return <LoadFailed what="the complaint" message={state.message} onRetry={state.retry} />;
  const c = state.data;
  if (!c) return <NotFound what="Complaint" />;

  return (
    <div>
      <ReadOnlyNote shopId={c.shop_id} shopName={c.shop_name} tab="complaints" />
      <article className="card">
        <div className="card-head">
          <h1>
            Complaint {displayNumber(c.complaint_number)} <StatusBadge status={c.status} />
          </h1>
          <span className="muted">{c.shop_name}</span>
        </div>
        <p className="complaint-description pre-line">{c.description}</p>
        <dl className="admin-facts">
          <dt>Customer</dt>
          <dd>{c.customer_name}</dd>
          <dt>Phone</dt>
          <dd>{c.phone}</dd>
          <dt>Vehicle no.</dt>
          <dd className="reg">{c.vehicle_reg}</dd>
          {c.address && (
            <>
              <dt>Address</dt>
              <dd className="pre-line">{c.address}</dd>
            </>
          )}
          <dt>Reported</dt>
          <dd>{formatDate(c.reported_on)}</dd>
          <dt>Attended by</dt>
          <dd>{c.attended_by || "Not recorded"}</dd>
          {c.notes && (
            <>
              <dt>Notes</dt>
              <dd className="pre-line">{c.notes}</dd>
            </>
          )}
          <dt>Recorded</dt>
          <dd>{formatDateTime(c.created_at)}</dd>
        </dl>
        <h2>Bills</h2>
        {c.bills.length === 0 ? (
          <p className="muted">No bill addresses this complaint yet.</p>
        ) : (
          <ul className="admin-list">
            {c.bills.map((b) => (
              <li key={b.id}>
                <Link to={`/admin/bills/${b.id}`} className="admin-list-row">
                  <span>
                    <strong>Bill {displayNumber(b.bill_number)}</strong> · {formatDate(b.date_received)}
                  </span>
                  <strong>{inr(b.grand_total)}</strong>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}
