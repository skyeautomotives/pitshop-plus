import { Link } from "react-router";
import { formatDate } from "../lib/format";
import { formatINR, rupeesToPaise } from "../lib/money";
import type { BillWithComplaints, ComplaintStatus, ComplaintWithBills } from "../lib/types";

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  return <span className={`badge badge-${status}`}>{status === "open" ? "Open" : "Resolved"}</span>;
}

const inr = (rupees: number) => formatINR(rupeesToPaise(rupees));

/** A bill in a list, with the complaints it addresses. */
export function BillCard({ bill, showCustomer = true }: { bill: BillWithComplaints; showCustomer?: boolean }) {
  return (
    <Link to={`/bills/${bill.id}`} className="result">
      <div className="result-top">
        <span>
          <span className="kind kind-bill">Bill #{bill.bill_number}</span>
          {showCustomer && <strong className="result-name">{bill.customer_name}</strong>}
        </span>
        <strong className="result-total">{inr(bill.grand_total)}</strong>
      </div>
      <div className="result-details">
        <span className="reg">{bill.vehicle_reg}</span>
        {showCustomer && <span>{bill.phone}</span>}
        <span>Received {formatDate(bill.date_received)}</span>
        <span>Delivered {formatDate(bill.delivered_on)}</span>
      </div>
      <div className="result-links">
        {bill.complaints.length === 0 ? (
          <span className="tag tag-muted">Not linked to a complaint</span>
        ) : (
          <>
            <span className="muted">Addresses:</span>
            {[...bill.complaints]
              .sort((a, b) => a.complaint_number - b.complaint_number)
              .map((c) => (
                <span key={c.id} className="tag">
                  #{c.complaint_number} {c.description.length > 40 ? `${c.description.slice(0, 40)}…` : c.description}
                </span>
              ))}
          </>
        )}
      </div>
    </Link>
  );
}

/** A complaint in a list, with who attended and the bills that address it. */
export function ComplaintCard({ complaint, showCustomer = true }: { complaint: ComplaintWithBills; showCustomer?: boolean }) {
  const c = complaint;
  return (
    <Link to={`/complaints/${c.id}`} className="result result-complaint">
      <div className="result-top">
        <span>
          <span className="kind kind-complaint">Complaint #{c.complaint_number}</span>
          {showCustomer && <strong className="result-name">{c.customer_name}</strong>}
        </span>
        <StatusBadge status={c.status} />
      </div>
      <p className="result-description">{c.description}</p>
      <div className="result-details">
        <span className="reg">{c.vehicle_reg}</span>
        {showCustomer && <span>{c.phone}</span>}
        <span>Reported {formatDate(c.reported_on)}</span>
        <span>Attended by {c.attended_by || "not recorded"}</span>
      </div>
      <div className="result-links">
        {c.bills.length === 0 ? (
          <span className="tag tag-warn">No bill yet</span>
        ) : (
          <>
            <span className="muted">Bills:</span>
            {[...c.bills]
              .sort((a, b) => a.bill_number - b.bill_number)
              .map((b) => (
                <span key={b.id} className="tag">
                  #{b.bill_number} · {inr(b.grand_total)}
                </span>
              ))}
          </>
        )}
      </div>
    </Link>
  );
}
