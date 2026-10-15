import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { StatusBadge } from "../components/cards";
import { BillNotFound, LoadError } from "../components/states";
import { formatDate } from "../lib/format";
import { formatINR, rupeesToPaise } from "../lib/money";
import { useShopSettings } from "../lib/shopSettings";
import { useBill } from "../lib/useBill";
import { whatsappLink } from "../lib/whatsapp";

const inr = (rupees: number) => formatINR(rupeesToPaise(rupees));

export default function BillView() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useShopSettings();
  const state = useBill(id);
  const [justSaved] = useState(() => (location.state as { saved?: boolean } | null)?.saved === true);

  // Drop the "saved" flag from history so a reload doesn't show the message again.
  useEffect(() => {
    if (justSaved) navigate(location.pathname, { replace: true, state: null });
  }, [justSaved, navigate, location.pathname]);

  if (state.status === "loading") return <p className="page-status">Loading bill…</p>;
  if (state.status === "not-found") return <BillNotFound />;
  if (state.status === "error") return <LoadError message={state.message} onRetry={state.retry} />;

  const bill = state.bill;
  const items = [...bill.bill_items].sort((a, b) => a.position - b.position);
  const whatsapp = whatsappLink(bill, settings);
  const complaints = [...(bill.complaints ?? [])].sort((a, b) => a.complaint_number - b.complaint_number);

  return (
    <div className="bill-page">
      <div className="toolbar no-print">
        <Link to={`/vehicles/${bill.vehicle_reg_key}`} className="back-link">
          ← History for {bill.vehicle_reg}
        </Link>
        <div className="toolbar-actions">
          <Link to={`/bills/${bill.id}/edit`} className="btn btn-outline">
            Edit
          </Link>
          <button type="button" className="btn btn-outline" onClick={() => window.print()}>
            Print / Save PDF
          </button>
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp">
              Send on WhatsApp
            </a>
          )}
        </div>
      </div>
      {!whatsapp && (
        <p className="hint no-print">
          WhatsApp isn't available for this bill because the phone number ({bill.phone}) isn't a valid mobile number.
        </p>
      )}

      {justSaved && (
        <div className="alert alert-success no-print" role="status">
          Bill #{bill.bill_number} saved.{" "}
          <Link to="/bills/new" className="link-button">
            Start a new bill
          </Link>
        </div>
      )}

      <article className="card bill-doc">
        <p className="doc-title">Invoice</p>
        <header className="bill-head">
          <div>
            <h1 className="shop-name">{settings?.shop_name || "Workshop"}</h1>
            {settings?.address && <p className="shop-line">{settings.address}</p>}
            {settings?.phone && <p className="shop-line">Phone: {settings.phone}</p>}
          </div>
          <div className="bill-meta">
            <p className="bill-no">Bill #{bill.bill_number}</p>
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

        {complaints.length > 0 ? (
          <div className="bill-complaints">
            <h2>Complaints addressed</h2>
            <ul>
              {complaints.map((c) => (
                <li key={c.id}>
                  <Link to={`/complaints/${c.id}`} className="complaint-ref">
                    #{c.complaint_number}
                  </Link>{" "}
                  {c.description}
                  <span className="muted">
                    {" "}
                    · reported {formatDate(c.reported_on)}
                    {c.attended_by && ` · attended by ${c.attended_by}`}
                  </span>{" "}
                  <span className="no-print">
                    <StatusBadge status={c.status} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="muted no-print">This bill is not linked to a complaint.</p>
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
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No parts or items recorded.
                </td>
              </tr>
            ) : (
              items.map((item, i) => (
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

        <p className="bill-foot">Thank you for your business.</p>
      </article>
    </div>
  );
}
