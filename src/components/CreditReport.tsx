import { useState } from "react";
import { Link } from "react-router";
import { t, tn, useT } from "../i18n";
import { setBillCredit, unpaidBills } from "../lib/api";
import { creditBills, creditDueText, creditReminderLink, creditTotals, type CreditStatus } from "../lib/credit";
import { todayISO } from "../lib/customer";
import { displayNumber, formatDate } from "../lib/format";
import { formatINR, rupeesToPaise } from "../lib/money";
import { openExternal } from "../lib/platform";
import { useShopSettings } from "../lib/shopSettings";
import { errorMessage } from "../lib/supabase";
import type { BillWithComplaints } from "../lib/types";
import { useLoad } from "../lib/useLoad";

type Show = "all" | "overdue" | "soon" | "later";
const inr = (rupees: number) => formatINR(rupeesToPaise(rupees));

/** Reports, Credit: every bill on credit, what is overdue and what is coming, with reminders. */
export default function CreditReport() {
  useT();
  const today = todayISO();
  const state = useLoad(`credit-report|${today}`, () => unpaidBills());

  if (state.status === "loading") return <p className="page-status">{t("common.loading")}</p>;
  if (state.status === "error")
    return (
      <div className="alert alert-error" role="alert">
        <span>{t("credit.saveFailed", { message: state.message })}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={state.retry}>
          {t("common.tryAgain")}
        </button>
      </div>
    );

  return <CreditReportView bills={state.data.bills} />;
}

export function CreditReportView({ bills }: { bills: BillWithComplaints[] }) {
  useT();
  const { settings } = useShopSettings();
  const today = todayISO();
  const [show, setShow] = useState<Show>("all");
  const [error, setError] = useState<string | null>(null);
  const totals = creditTotals(bills, today);
  const all = creditBills(bills, today);
  const matches = (s: CreditStatus) => show === "all" || (show === "soon" ? s === "soon" || s === "today" : s === show);
  const list = all.filter((r) => matches(r.status));

  async function remind(i: number) {
    const r = list[i];
    setError(null);
    await openExternal(creditReminderLink(r, settings, today));
    try {
      await setBillCredit(r.bill.id, { reminded_on: today });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const filters: { id: Show; label: string; n: number }[] = [
    { id: "all", label: t("lists.filterAll"), n: all.length },
    { id: "overdue", label: t("credit.overdueTag"), n: totals.overdue.bills },
    { id: "soon", label: t("credit.filterSoon"), n: totals.soon.bills },
    { id: "later", label: t("credit.filterLater"), n: totals.later.bills },
  ];

  return (
    <section className="card credit-report">
      <div className="card-head">
        <h2>{t("reports.credit")}</h2>
      </div>
      <p className="muted">{t("credit.reportHint")}</p>

      <div className="tiles credit-tiles">
        <div className="tile tile-strong">
          <span className="tile-label">{t("credit.outstanding")}</span>
          <span className="tile-value">{inr(totals.total)}</span>
          <span className="tile-sub">{tn("dashboard.billCount", totals.overdue.bills + totals.soon.bills + totals.later.bills)}</span>
        </div>
        <div className="tile">
          <span className="tile-label">{t("credit.overdueTag")}</span>
          <span className="tile-value credit-late">{inr(totals.overdue.amount)}</span>
          <span className="tile-sub">{tn("dashboard.billCount", totals.overdue.bills)}</span>
        </div>
        <div className="tile">
          <span className="tile-label">{t("credit.filterSoon")}</span>
          <span className="tile-value">{inr(totals.soon.amount)}</span>
          <span className="tile-sub">{tn("dashboard.billCount", totals.soon.bills)}</span>
        </div>
        <Link to="/bills?show=unpaid" className="tile tile-link">
          <span className="tile-label">{t("credit.noDate")}</span>
          <span className="tile-value">{inr(totals.noDate.amount)}</span>
          <span className="tile-sub">{tn("dashboard.billCount", totals.noDate.bills)}</span>
        </Link>
      </div>

      <div className="filter-bar" role="group" aria-label={t("lists.show")}>
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip${show === f.id ? " chip-active" : ""}`}
            aria-pressed={show === f.id}
            onClick={() => setShow(f.id)}
          >
            {f.label} <span className="chip-count">{f.n}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {t("credit.saveFailed", { message: error })}
        </div>
      )}

      {list.length === 0 ? (
        <p className="muted">{all.length === 0 ? t("credit.noneOnCredit") : t("credit.noneHere")}</p>
      ) : (
        <div className="table-scroll">
          <table className="sales-table credit-table">
            <thead>
              <tr>
                <th>{t("credit.colBill")}</th>
                <th>{t("credit.colCustomer")}</th>
                <th>{t("credit.colVehicle")}</th>
                <th className="num">{t("credit.colBalance")}</th>
                <th>{t("credit.colDue")}</th>
                <th>{t("credit.colReminded")}</th>
                <th>
                  <span className="sr-only">{t("credit.remind")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={r.bill.id} className={r.status === "overdue" ? "credit-row-late" : ""}>
                  <td>
                    <Link to={`/bills/${r.bill.id}`}>{displayNumber(r.bill.bill_number)}</Link>
                  </td>
                  <td>
                    {r.bill.customer_name}
                    {r.bill.phone && <div className="muted credit-meta">{r.bill.phone}</div>}
                  </td>
                  <td className="reg">{r.bill.vehicle_reg}</td>
                  <td className="num">
                    <strong>{inr(r.balance)}</strong>
                  </td>
                  <td>
                    {formatDate(r.dueOn)}
                    <div className={`credit-meta ${r.status === "overdue" ? "credit-late" : "muted"}`}>{creditDueText(r.dueOn, today)}</div>
                  </td>
                  <td>{r.bill.credit_reminded_on ? formatDate(r.bill.credit_reminded_on) : <span className="muted">{t("credit.notReminded")}</span>}</td>
                  <td>
                    <button type="button" className="btn btn-whatsapp btn-sm" onClick={() => void remind(i)}>
                      {t("credit.remind")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
