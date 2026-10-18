import { Link } from "react-router";
import { t, useT } from "../i18n";
import { complaintText } from "../lib/jobCard";
import { formatDate } from "../lib/format";
import { formatINR, rupeesToPaise } from "../lib/money";
import type { BillWithComplaints, ComplaintStatus, ComplaintWithBills } from "../lib/types";
import { displayNumber, seqNumber } from "../lib/format";
import { billMoney } from "../lib/payments";

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  useT();
  return <span className={`badge badge-${status}`}>{status === "open" ? t("status.open") : t("status.resolved")}</span>;
}

const inr = (rupees: number) => formatINR(rupeesToPaise(rupees));

/** "Paid" or "Balance ₹…" once anything has been paid on the bill (nothing for older bills). */
function PaymentTag({ bill }: { bill: BillWithComplaints }) {
  const m = billMoney(bill.grand_total, bill.complaints, bill.payments ?? []);
  if (m.status === "unpaid") return null;
  return m.status === "paid" ? (
    <span className="badge badge-resolved">{t("lists.paid")}</span>
  ) : (
    <span className="badge badge-open">{t("lists.balance", { amount: inr(m.balance) })}</span>
  );
}

/** A bill in a list, with the complaints it addresses. */
export function BillCard({ bill, showCustomer = true }: { bill: BillWithComplaints; showCustomer?: boolean }) {
  useT();
  return (
    <Link to={`/bills/${bill.id}`} className="result">
      <div className="result-top">
        <span>
          <span className="kind kind-bill">{t("lists.billNumber", { number: displayNumber(bill.bill_number) })}</span>
          {showCustomer && <strong className="result-name">{bill.customer_name}</strong>}
        </span>
        <strong className="result-total">{inr(bill.grand_total)}</strong>
      </div>
      <div className="result-details">
        <span className="reg">{bill.vehicle_reg}</span>
        {showCustomer && <span>{bill.phone}</span>}
        <span>{t("lists.received", { date: formatDate(bill.date_received) })}</span>
        <span>{t("lists.delivered", { date: formatDate(bill.delivered_on) })}</span>
        <PaymentTag bill={bill} />
      </div>
      <div className="result-links">
        {bill.complaints.length === 0 ? (
          <span className="tag tag-muted">{t("lists.notLinked")}</span>
        ) : (
          <>
            <span className="muted">{t("lists.addresses")}</span>
            {[...bill.complaints]
              .sort((a, b) => seqNumber(a.complaint_number) - seqNumber(b.complaint_number))
              .map((c) => (
                <span key={c.id} className="tag">
                  {displayNumber(c.complaint_number)} {c.description.length > 40 ? `${c.description.slice(0, 40)}…` : c.description}
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
  useT();
  return (
    <Link to={`/complaints/${c.id}`} className="result result-complaint">
      <div className="result-top">
        <span>
          <span className="kind kind-complaint">{t("lists.complaintNumber", { number: displayNumber(c.complaint_number) })}</span>
          {showCustomer && <strong className="result-name">{c.customer_name}</strong>}
        </span>
        <StatusBadge status={c.status} />
      </div>
      <p className="result-description">{complaintText(c)}</p>
      <div className="result-details">
        <span className="reg">{c.vehicle_reg}</span>
        {showCustomer && <span>{c.phone}</span>}
        <span>{t("lists.reported", { date: formatDate(c.reported_on) })}</span>
        <span>{t("lists.attendedBy", { name: c.attended_by || t("lists.notRecorded") })}</span>
      </div>
      <div className="result-links">
        {c.bills.length === 0 ? (
          <span className="tag tag-warn">{t("lists.noBillYet")}</span>
        ) : (
          <>
            <span className="muted">{t("lists.billsLabel")}</span>
            {[...c.bills]
              .sort((a, b) => seqNumber(a.bill_number) - seqNumber(b.bill_number))
              .map((b) => (
                <span key={b.id} className="tag">
                  {displayNumber(b.bill_number)} · {inr(b.grand_total)}
                </span>
              ))}
          </>
        )}
      </div>
    </Link>
  );
}
