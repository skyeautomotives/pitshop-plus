import { useEffect, useState } from "react";
import { complaintText } from "../lib/jobCard";
import type { Key, Lang } from "../i18n";
import { useT } from "../i18n";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { StatusBadge } from "../components/cards";
import { BillNotFound, LoadError } from "../components/states";
import { formatDate } from "../lib/format";
import { formatINR, rupeesToPaise } from "../lib/money";
import { useShopSettings } from "../lib/shopSettings";
import { useBill } from "../lib/useBill";
import { whatsappLink } from "../lib/whatsapp";
import { paymentMethodLabel } from "../lib/complaint";
import { billMoney } from "../lib/payments";
import BillPayments from "../components/BillPayments";
import { canPrint, isNativeApp, openExternal } from "../lib/platform";
import { displayNumber, seqNumber } from "../lib/format";

const inr = (rupees: number) => formatINR(rupeesToPaise(rupees));

export default function BillView() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useShopSettings();
  const state = useBill(id);
  const [justSaved] = useState(() => (location.state as { saved?: boolean } | null)?.saved === true);
  const { t } = useT();

  // Drop the "saved" flag from history so a reload doesn't show the message again.
  useEffect(() => {
    if (justSaved) navigate(location.pathname, { replace: true, state: null });
  }, [justSaved, navigate, location.pathname]);

  if (state.status === "loading") return <p className="page-status">{t("billView.loading")}</p>;
  if (state.status === "not-found") return <BillNotFound />;
  if (state.status === "error") return <LoadError message={state.message} onRetry={state.retry} />;

  const bill = state.bill;
  const items = [...bill.bill_items].sort((a, b) => a.position - b.position);
  const whatsapp = whatsappLink(bill, settings);
  const complaints = [...(bill.complaints ?? [])].sort((a, b) => seqNumber(a.complaint_number) - seqNumber(b.complaint_number));
  // Advance taken on the complaints and payments after billing; the bill's own total is unchanged.
  const payments = [...(bill.payments ?? [])].sort((a, b) => (a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : 0));
  const money = billMoney(bill.grand_total, complaints, payments);
  // The printed bill is for the customer: it uses the workshop's language for customers.
  const lang: Lang = settings?.customer_language ?? "en";
  const d = (key: Key, vars?: Record<string, string | number>) => t(key, vars, lang);
  const date = (iso: string) => formatDate(iso, lang);

  return (
    <div className="bill-page">
      <div className="toolbar no-print">
        <Link to={`/vehicles/${bill.vehicle_reg_key}`} className="back-link">
          {t("billView.historyFor", { reg: bill.vehicle_reg })}
        </Link>
        <div className="toolbar-actions">
          <Link to={`/bills/${bill.id}/edit`} className="btn btn-outline">
            {t("billView.edit")}
          </Link>
          {canPrint && (
            <button type="button" className="btn btn-outline" onClick={() => window.print()}>
              {t("billView.print")}
            </button>
          )}
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-whatsapp"
              onClick={(e) => {
                if (!isNativeApp) return;
                e.preventDefault();
                void openExternal(whatsapp);
              }}
            >
              {t("billView.whatsapp")}
            </a>
          )}
        </div>
      </div>
      {!whatsapp && (
        <p className="hint no-print">
          {t("billView.noWhatsapp", { phone: bill.phone })}
        </p>
      )}

      {justSaved && (
        <div className="alert alert-success no-print" role="status">
          {bill.bill_number === null ? t("billView.savedOffline") : t("billView.saved", { number: displayNumber(bill.bill_number) })}{" "}
          <Link to="/bills/new" className="link-button">
            {t("billView.startNew")}
          </Link>
        </div>
      )}
      {!justSaved && bill.pending && (
        <div className="alert first-sync no-print" role="status">
          {t("billView.pendingChanges")}
        </div>
      )}

      <article className="card bill-doc">
        <p className="doc-title">{d("doc.invoice")}</p>
        <header className="bill-head">
          <div>
            <h1 className="shop-name">{settings?.shop_name || d("doc.workshop")}</h1>
            {settings?.address && <p className="shop-line">{settings.address}</p>}
            {settings?.phone && <p className="shop-line">{d("doc.phoneLine", { phone: settings.phone })}</p>}
          </div>
          <div className="bill-meta">
            <p className="bill-no">{d("doc.bill", { number: displayNumber(bill.bill_number, lang) })}</p>
            <p>{d("doc.received", { date: date(bill.date_received) })}</p>
            <p>{d("doc.delivered", { date: date(bill.delivered_on) })}</p>
          </div>
        </header>

        <dl className="bill-customer">
          <div>
            <dt>{d("doc.customer")}</dt>
            <dd>{bill.customer_name}</dd>
          </div>
          <div>
            <dt>{d("doc.phone")}</dt>
            <dd>{bill.phone}</dd>
          </div>
          <div>
            <dt>{d("doc.vehicleNo")}</dt>
            <dd className="reg">{bill.vehicle_reg}</dd>
          </div>
          {bill.address && (
            <div className="span-all">
              <dt>{d("doc.address")}</dt>
              <dd className="pre-line">{bill.address}</dd>
            </div>
          )}
        </dl>

        {complaints.length > 0 ? (
          <div className="bill-complaints">
            <h2>{d("doc.complaintsAddressed")}</h2>
            <ul>
              {complaints.map((c) => (
                <li key={c.id}>
                  <Link to={`/complaints/${c.id}`} className="complaint-ref">
                    {displayNumber(c.complaint_number, lang)}
                  </Link>{" "}
                  {complaintText({ jobs: c.jobs, description: c.note ?? c.description }, lang)}
                  <span className="muted">
                    {d("doc.reported", { date: date(c.reported_on) })}
                    {c.attended_by && d("doc.attendedBy", { name: c.attended_by })}
                  </span>{" "}
                  <span className="no-print">
                    <StatusBadge status={c.status} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="muted no-print">{t("lists.notLinked")}</p>
        )}

        <table className="bill-items">
          <thead>
            <tr>
              <th className="col-no">#</th>
              <th>{d("doc.item")}</th>
              <th className="col-qty">{d("doc.qty")}</th>
              <th className="num">{d("doc.rate")}</th>
              <th className="num">{d("doc.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  {d("doc.noItems")}
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
            <dt>{d("doc.itemsSubtotal")}</dt>
            <dd>{inr(bill.items_subtotal)}</dd>
          </div>
          <div>
            <dt>{d("doc.labour")}</dt>
            <dd>{inr(bill.labour_charge)}</dd>
          </div>
          {bill.painting_charge !== null && (
            <div>
              <dt>{d("doc.painting")}</dt>
              <dd>{inr(bill.painting_charge)}</dd>
            </div>
          )}
          {bill.washing_charge !== null && (
            <div>
              <dt>{d("doc.washing")}</dt>
              <dd>{inr(bill.washing_charge)}</dd>
            </div>
          )}
          {Number(bill.discount) > 0 && (
            <div className="discount-row">
              <dt>
                {d("doc.discount")}
                {bill.discount_percent !== null && ` (${Number(bill.discount_percent)}%)`}
              </dt>
              <dd>−{inr(bill.discount)}</dd>
            </div>
          )}
          <div className="grand">
            <dt>{d("doc.grandTotal")}</dt>
            <dd>{inr(bill.grand_total)}</dd>
          </div>
          {money.advance > 0 && (
            <div className="discount-row">
              <dt>{d("doc.advance")}</dt>
              <dd>−{inr(money.advance)}</dd>
            </div>
          )}
          {payments.map((p) => (
            <div key={p.id} className="discount-row">
              <dt>{d("doc.paidOn", { date: date(p.paid_on), method: paymentMethodLabel(p.method, lang) })}</dt>
              <dd>−{inr(p.amount)}</dd>
            </div>
          ))}
          {(money.advance > 0 || payments.length > 0) && (
            <div className="grand balance-row">
              <dt>{money.status === "paid" ? d("doc.paidInFull") : d("doc.balance")}</dt>
              <dd>{inr(money.balance)}</dd>
            </div>
          )}
        </dl>

        <p className="bill-foot">{d("doc.thanks")}</p>
      </article>

      <BillPayments billId={bill.id} payments={payments} money={money} />
    </div>
  );
}
