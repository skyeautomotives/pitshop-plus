import { t, type Key, type Lang } from "../i18n";
import { countMarks, MARK_KINDS, type CarMark } from "../lib/carMarks";
import { belongingsText, documentsText, paymentMethodLabel } from "../lib/complaint";
import { displayNumber, formatDate } from "../lib/format";
import { jobLabel } from "../lib/jobCard";
import { formatINR, rupeesToPaise } from "../lib/money";
import type { ComplaintRow, ShopSettings } from "../lib/types";
import CarDiagram, { MARK_LABEL, MarkShape } from "./CarDiagram";

/**
 * The job card handed over when a vehicle comes in: who brought it, the work asked for,
 * what was left in it and, for cars, the scratches and dents already on it. Always in English, like bills.
 */
export default function JobCardDocument({
  complaint: c,
  settings,
  showCar,
}: {
  complaint: ComplaintRow;
  settings: ShopSettings | null;
  /** Show the car diagram (car workshops, or when marks were made). */
  showCar: boolean;
}) {
  const lang: Lang = "en";
  const d = (key: Key, vars?: Record<string, string | number>) => t(key, vars, lang);
  const shopName = settings?.shop_name || d("doc.workshop");
  const marks: CarMark[] = c.car_marks ?? [];
  const counts = countMarks(marks);
  const jobs = c.jobs ?? [];
  const items = belongingsText(c, lang);
  const docs = documentsText(c, lang);

  return (
    <article className="invoice invoice-pdf job-card-doc" lang={lang}>
      <header className="inv-top" data-keep>
        <div className="inv-shop">
          {settings?.logo && <img className="inv-logo" src={settings.logo} alt="" />}
          <h1 className="inv-shop-name">{shopName}</h1>
          {settings?.address && <p className="pre-line">{settings.address}</p>}
          {settings?.phone && <p>{d("doc.phoneLine", { phone: settings.phone })}</p>}
        </div>
        <div className="inv-title">
          <p className="inv-doc">{d("doc.jobCard")}</p>
          <dl className="inv-facts">
            <div>
              <dt>{d("doc.jobCardNo")}</dt>
              <dd className="inv-strong">{displayNumber(c.complaint_number, lang)}</dd>
            </div>
            <div>
              <dt>{d("doc.dateIn")}</dt>
              <dd>{formatDate(c.reported_on, lang)}</dd>
            </div>
            {c.attended_by && (
              <div>
                <dt>{d("complaint.attendedBy")}</dt>
                <dd>{c.attended_by}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <section className="inv-parties" data-keep>
        <div className="inv-box">
          <h2>{d("doc.customer")}</h2>
          <p className="inv-strong">{c.customer_name}</p>
          {c.phone && <p>{c.phone}</p>}
          {c.address && <p className="pre-line">{c.address}</p>}
        </div>
        <div className="inv-box">
          <h2>{d("doc.vehicle")}</h2>
          <p className="inv-strong inv-reg">{c.vehicle_reg}</p>
          {(c.vehicle_name || c.odometer_km) && (
            <p>
              {c.vehicle_name}
              {c.vehicle_name && c.odometer_km ? " · " : ""}
              {c.odometer_km ? d("doc.km", { km: c.odometer_km.toLocaleString("en-IN") }) : ""}
            </p>
          )}
        </div>
      </section>

      <section className="jc-section" data-keep>
        <h2>{d("doc.workToDo")}</h2>
        {jobs.length > 0 && (
          <ol className="jc-jobs">
            {jobs.map((id) => (
              <li key={id}>{jobLabel(id, lang)}</li>
            ))}
          </ol>
        )}
        {c.description.trim() && (
          <>
            <h3>{d("doc.otherWork")}</h3>
            <p className="pre-line">{c.description}</p>
          </>
        )}
      </section>

      {(items || docs || (c.helmets !== null && c.helmets !== undefined) || !!c.advance_amount) && (
        <section className="jc-section jc-facts" data-keep>
          {items && (
            <p>
              <strong>{d("complaint.itemsInCar")}:</strong> {items}
            </p>
          )}
          {c.helmets !== null && c.helmets !== undefined && (
            <p>
              <strong>{d("complaint.helmets")}:</strong> {c.helmets}
            </p>
          )}
          {docs && (
            <p>
              <strong>{d("complaint.documentsReceived")}:</strong> {docs}
            </p>
          )}
          {!!c.advance_amount && (
            <p>
              <strong>{d("doc.advance")}:</strong> {formatINR(rupeesToPaise(c.advance_amount))}
              {c.advance_method ? ` · ${paymentMethodLabel(c.advance_method, lang)}` : ""}
            </p>
          )}
        </section>
      )}

      {showCar && (
        <section className="jc-section jc-car" data-keep>
          <h2>{d("doc.carCondition")}</h2>
          <div className="jc-car-row">
            <div className="jc-car-diagram">
              <CarDiagram marks={marks} lang={lang} label={d("doc.carCondition")} />
            </div>
            <div className="jc-legend">
              {MARK_KINDS.map((k) => (
                <p key={k}>
                  <svg viewBox="-10 -10 20 20" width={18} height={18} aria-hidden="true">
                    <MarkShape kind={k} x={0} y={0} size={0.9} />
                  </svg>
                  {d(MARK_LABEL[k])}: <strong>{counts[k]}</strong>
                </p>
              ))}
              {marks.length === 0 && <p className="inv-muted">{d("doc.noMarks")}</p>}
              <p className="inv-muted jc-agree">{d("doc.conditionAgree")}</p>
            </div>
          </div>
        </section>
      )}

      <footer className="inv-foot jc-signs" data-keep>
        <div className="inv-sign">
          <span className="inv-sign-line" />
          <p className="inv-muted">{d("doc.customerSign")}</p>
        </div>
        <div className="inv-sign">
          <p>{d("doc.forShop", { shop: shopName })}</p>
          {settings?.signature ? <img className="inv-signature" src={settings.signature} alt="" /> : null}
          <span className={settings?.signature ? "inv-sign-line is-signed" : "inv-sign-line"} />
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
