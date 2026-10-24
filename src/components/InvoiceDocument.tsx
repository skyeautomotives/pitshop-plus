import { Link } from "react-router";
import { locale, t, type Key, type Lang } from "../i18n";
import { paymentMethodLabel } from "../lib/complaint";
import { billCode, displayNumber, formatDate, seqNumber } from "../lib/format";
import { amountInWords, DEFAULT_GST_RATE, halves, SERVICE_SAC } from "../lib/gst";
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

const paise = (rupees: number | null | undefined) => rupeesToPaise(Number(rupees ?? 0));

/** GST grouped by rate, from the amounts saved on the bill. */
export function gstSummary(bill: BillWithItems) {
  const groups = new Map<number, { taxable: number; gst: number }>();
  const add = (rate: number, taxable: number, gst: number) => {
    const g = groups.get(rate) ?? { taxable: 0, gst: 0 };
    groups.set(rate, { taxable: g.taxable + taxable, gst: g.gst + gst });
  };
  for (const item of bill.bill_items) add(Number(item.gst_rate ?? DEFAULT_GST_RATE), paise(item.taxable_value), paise(item.gst_amount));
  if (paise(bill.service_taxable) > 0) add(Number(bill.service_gst_rate ?? DEFAULT_GST_RATE), paise(bill.service_taxable), paise(bill.service_gst));
  return [...groups.entries()]
    .filter(([, g]) => g.taxable > 0 || g.gst > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([rate, g]) => ({ rate, ...g, ...halves(g.gst) }));
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
  const gst = bill.gst_mode ? gstSummary(bill) : null;
  const gstTotal = paise(bill.gst_total);
  const { cgst, sgst } = halves(gstTotal);

  return (
    <article className={pdf ? "invoice invoice-pdf" : "card invoice"} lang={lang}>
      <header className="inv-top" data-keep>
        <div className="inv-shop">
          <h1 className="inv-shop-name">{shopName}</h1>
          {settings?.address && <p className="pre-line">{settings.address}</p>}
          {settings?.phone && <p>{d("doc.phoneLine", { phone: settings.phone })}</p>}
          {gst && bill.gstin && <p className="inv-strong">{d("doc.gstinLine", { gstin: bill.gstin })}</p>}
        </div>
        <div className="inv-title">
          <p className="inv-doc">{gst ? d("doc.taxInvoice") : d("doc.invoice")}</p>
          <dl className="inv-facts">
            <div>
              <dt>{d("doc.invoiceNo")}</dt>
              <dd className="inv-strong">{billCode(bill.bill_number, settings?.shop_name)}</dd>
            </div>
            <div>
              <dt>{d("doc.invoiceDate")}</dt>
              <dd>{date(bill.delivered_on)}</dd>
            </div>
            {!bill.direct_sale && (
              <div>
                <dt>{d("doc.vehicleIn")}</dt>
                <dd>{date(bill.date_received)}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <section className="inv-parties" data-keep>
        <div className="inv-box">
          <h2>{d("doc.billTo")}</h2>
          <p className="inv-strong">{bill.customer_name}</p>
          <p>{bill.phone}</p>
          {bill.address && <p className="pre-line">{bill.address}</p>}
          {gst && bill.customer_gstin && <p>{d("doc.gstinLine", { gstin: bill.customer_gstin })}</p>}
        </div>
        {!!(bill.vehicle_reg || vehicleName || km) && (
          <div className="inv-box">
            <h2>{d("doc.vehicle")}</h2>
            {bill.vehicle_reg && <p className="inv-strong inv-reg">{bill.vehicle_reg}</p>}
            {(vehicleName || km) && (
              <p>
                {vehicleName}
                {vehicleName && km ? " · " : ""}
                {km ? d("doc.km", { km: km.toLocaleString(locale(lang)) }) : ""}
              </p>
            )}
          </div>
        )}
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
                  ({pdf ? displayNumber(c.complaint_number, lang) : <Link to={`/complaints/${c.id}`}>{displayNumber(c.complaint_number, lang)}</Link>}
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
            {gst && <th>{d("doc.hsn")}</th>}
            {gst && <th className="num">{d("doc.gstRate")}</th>}
            <th className="num">{d("doc.qty")}</th>
            <th className="num">{d("doc.rate")}</th>
            <th className="num">{d("doc.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr data-keep>
              <td colSpan={gst ? 7 : 5} className="inv-muted">
                {d("doc.noItems")}
              </td>
            </tr>
          ) : (
            items.map((item, i) => (
              <tr key={item.id} data-keep>
                <td className="col-no">{i + 1}</td>
                <td>{item.description}</td>
                {gst && <td>{item.hsn ?? ""}</td>}
                {gst && <td className="num">{`${Number(item.gst_rate ?? DEFAULT_GST_RATE)}%`}</td>}
                <td className="num">{Number(item.quantity ?? 1)}</td>
                <td className="num">{inr(item.price)}</td>
                <td className="num">{inr(item.line_total ?? item.price)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {bill.gst_mode === "inclusive" && <p className="inv-note">{d("doc.pricesInclude")}</p>}

      <section className="inv-summary" data-keep>
        <div className="inv-summary-left">
          <p className="inv-words">
            <span className="inv-muted">{d("doc.amountWords")}</span>
            {amountInWords(rupeesToPaise(bill.grand_total))}
          </p>
          {gst && gst.length > 0 && (
            <table className="inv-tax">
              <caption>{d("doc.taxSummary")}</caption>
              <thead>
                <tr>
                  <th>{d("doc.gstRate")}</th>
                  <th className="num">{d("doc.taxable")}</th>
                  <th className="num">{d("doc.cgst")}</th>
                  <th className="num">{d("doc.sgst")}</th>
                </tr>
              </thead>
              <tbody>
                {gst.map((g) => (
                  <tr key={g.rate}>
                    <td>{`${g.rate}%`}</td>
                    <td className="num">{formatINR(g.taxable)}</td>
                    <td className="num">{formatINR(g.cgst)}</td>
                    <td className="num">{formatINR(g.sgst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {paidUp && <span className="inv-stamp">{d("doc.paidStamp")}</span>}
        </div>
        <dl className="inv-totals">
          <div>
            <dt>{d("doc.itemsSubtotal")}</dt>
            <dd>{inr(bill.items_subtotal)}</dd>
          </div>
          {!(bill.direct_sale && Number(bill.labour_charge) === 0) && (
            <div>
              <dt>{gst ? d("doc.labourSac", { sac: SERVICE_SAC }) : d("doc.labour")}</dt>
              <dd>{inr(bill.labour_charge)}</dd>
            </div>
          )}
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
          {gst && (
            <>
              <div className="inv-sub">
                <dt>{d("doc.taxable")}</dt>
                <dd>{inr(Number(bill.taxable_total ?? 0))}</dd>
              </div>
              <div>
                <dt>{d("doc.cgst")}</dt>
                <dd>{formatINR(cgst)}</dd>
              </div>
              <div>
                <dt>{d("doc.sgst")}</dt>
                <dd>{formatINR(sgst)}</dd>
              </div>
            </>
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
