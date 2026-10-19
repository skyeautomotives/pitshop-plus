import { Link } from "react-router";
import { locale, t, type Key, type Lang } from "../i18n";
import { paymentMethodLabel } from "../lib/complaint";
import { billCode, displayNumber, formatDate, seqNumber } from "../lib/format";
import { complaintText } from "../lib/jobCard";
import { formatINR, rupeesToPaise } from "../lib/money";
import { billMoney } from "../lib/payments";
import type { BillWithItems, ShopSettings } from "../lib/types";
import { StatusBadge } from "./cards";

const inr = (rupees: number) => formatINR(rupeesToPaise(rupees));

/** The bill's lines, complaints, payments and money, in the order they are shown. */
export function billParts(bill: BillWithItems) {
  const items = [...bill.bill_items].sort((a, b) => a.position - b.position);
  const complaints = [...(bill.complaints ?? [])].sort((a, b) => seqNumber(a.complaint_number) - seqNumber(b.complaint_number));
  const payments = [...(bill.payments ?? [])].sort((a, b) => (a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : 0));
  // Advance taken on the complaints and payments after billing; the bill's own total is unchanged.
  const money = billMoney(bill.grand_total, complaints, payments);
  return { items, complaints, payments, money };
}

interface Props {
  bill: BillWithItems;
  settings: ShopSettings | null;
  /** Drawn for the PDF: fixed A4 width, no links or status badges. */
  pdf?: boolean;
}

/**
 * The customer's bill, always in English. The same layout is shown on screen, printed and made into the PDF.
 * Blocks marked data-keep are never split across PDF pages.
 */
export default function InvoiceDocument({ bill, settings, pdf = false }: Props) {
  const lang: Lang = "en";
  const d = (key: Key, vars?: Record<string, string | number>) => t(key, vars, lang);
  const date = (iso: string) => formatDate(iso, lang);
  const { items, complaints, payments, money } = billParts(bill);
  const shopName = settings?.shop_name || d("doc.workshop");
  const vehicleName = [...complaints].reverse().find((c) => c.vehicle_name)?.vehicle_name;
  const km = [...complaints].reverse().find((c) => c.odometer_km)?.odometer_km;
  const anyPaid = money.advance > 0 || payments.length > 0;
  const paidUp = money.status === "paid" && anyPaid;

  return (
    <article className={pdf ? "invoice invoice-pdf" : "card invoice"} lang={lang}>
      <header className="inv-top" data-keep>
        <div className="inv-shop">
          <h1 className="inv-shop-name">{shopName}</h1>
          {settings?.address && <p className="pre-line">{settings.address}</p>}
          {settings?.phone && <p>{d("doc.phoneLine", { phone: settings.phone })}</p>}
        </div>
        <div className="inv-title">
          <p className="inv-doc">{d("doc.invoice")}</p>
          <dl className="inv-facts">
            <div>
              <dt>{d("doc.invoiceNo")}</dt>
              <dd className="inv-strong">{billCode(bill.bill_number, settings?.shop_name)}</dd>
            </div>
            <div>
              <dt>{d("doc.invoiceDate")}</dt>
              <dd>{date(bill.delivered_on)}</dd>
            </div>
            <div>
              <dt>{d("doc.vehicleIn")}</dt>
              <dd>{date(bill.date_received)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="inv-parties" data-keep>
        <div className="inv-box">
          <h2>{d("doc.billTo")}</h2>
          <p className="inv-strong">{bill.customer_name}</p>
          <p>{bill.phone}</p>
          {bill.address && <p className="pre-line">{bill.address}</p>}
        </div>
        <div className="inv-box">
          <h2>{d("doc.vehicle")}</h2>
          <p className="inv-strong inv-reg">{bill.vehicle_reg}</p>
          {(vehicleName || km) && (
            <p>
              {vehicleName}
              {vehicleName && km ? " · " : ""}
              {km ? d("doc.km", { km: km.toLocaleString(locale(lang)) }) : ""}
            </p>
          )}
        </div>
      </section>

      {complaints.length > 0 && (
        <section className="inv-complaints">
          <h2 data-keep>{d("doc.complaintsAddressed")}</h2>
          <ul>
            {complaints.map((c) => (
              <li key={c.id} data-keep>
                {complaintText({ jobs: c.jobs, description: c.note ?? c.description }, lang)}
                <span className="inv-muted">
                  {" "}
                  (
                  {pdf ? (
                    displayNumber(c.complaint_number, lang)
                  ) : (
                    <Link to={`/complaints/${c.id}`}>{displayNumber(c.complaint_number, lang)}</Link>
                  )}
                  {d("doc.reported", { date: date(c.reported_on) })}
                  {c.attended_by && d("doc.attendedBy", { name: c.attended_by })})
                </span>
                {!pdf && (
                  <span className="no-print">
                    {" "}
                    <StatusBadge status={c.status} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <table className="inv-items">
        <thead>
          <tr data-keep>
            <th className="col-no">#</th>
            <th>{d("doc.item")}</th>
            <th className="num">{d("doc.qty")}</th>
            <th className="num">{d("doc.rate")}</th>
            <th className="num">{d("doc.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr data-keep>
              <td colSpan={5} className="inv-muted">
                {d("doc.noItems")}
              </td>
            </tr>
          ) : (
            items.map((item, i) => (
              <tr key={item.id} data-keep>
                <td className="col-no">{i + 1}</td>
                <td>{item.description}</td>
                <td className="num">{Number(item.quantity ?? 1)}</td>
                <td className="num">{inr(item.price)}</td>
                <td className="num">{inr(item.line_total ?? item.price)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <section className="inv-summary" data-keep>
        <div className="inv-stamp-area">{paidUp && <span className="inv-stamp">{d("doc.paidStamp")}</span>}</div>
        <dl className="inv-totals">
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
            <div>
              <dt>
                {d("doc.discount")}
                {bill.discount_percent !== null && ` (${Number(bill.discount_percent)}%)`}
              </dt>
              <dd>−{inr(bill.discount)}</dd>
            </div>
          )}
          <div className="inv-grand">
            <dt>{d("doc.grandTotal")}</dt>
            <dd>{inr(bill.grand_total)}</dd>
          </div>
          {money.advance > 0 && (
            <div>
              <dt>{d("doc.advance")}</dt>
              <dd>−{inr(money.advance)}</dd>
            </div>
          )}
          {payments.map((p) => (
            <div key={p.id}>
              <dt>{d("doc.paidOn", { date: date(p.paid_on), method: paymentMethodLabel(p.method, lang) })}</dt>
              <dd>−{inr(p.amount)}</dd>
            </div>
          ))}
          {anyPaid && (
            <div className={paidUp ? "inv-balance inv-paid" : "inv-balance"}>
              <dt>{paidUp ? d("doc.paidInFull") : d("doc.balance")}</dt>
              <dd>{inr(money.balance)}</dd>
            </div>
          )}
        </dl>
      </section>

      <footer className="inv-foot" data-keep>
        <p className="inv-thanks">{d("doc.thanks")}</p>
        <div className="inv-sign">
          <p>{d("doc.forShop", { shop: shopName })}</p>
          <span className="inv-sign-line" />
          <p className="inv-muted">{d("doc.signatory")}</p>
        </div>
      </footer>
      <p className="inv-powered" data-keep>
        {d("doc.poweredBy")}
        <img src={`${import.meta.env.BASE_URL}pitshop-plus.svg`} alt="Pitshop Plus" width={57} height={20} />
      </p>
    </article>
  );
}
