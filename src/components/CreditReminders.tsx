import { useState } from "react";
import { Link } from "react-router";
import { t, useT } from "../i18n";
import { setBillCredit } from "../lib/api";
import { creditDueText, creditReminderLink, creditReminders } from "../lib/credit";
import { todayISO } from "../lib/customer";
import { displayNumber, formatDate } from "../lib/format";
import { formatINR, rupeesToPaise } from "../lib/money";
import { openExternal } from "../lib/platform";
import { useShopSettings } from "../lib/shopSettings";
import { errorMessage } from "../lib/supabase";
import type { BillWithComplaints } from "../lib/types";

/** Dashboard card: credit that is overdue or due soon, with a WhatsApp reminder for each. */
export default function CreditReminders({ bills, showReportLink = false }: { bills: BillWithComplaints[]; showReportLink?: boolean }) {
  useT();
  const { settings } = useShopSettings();
  const today = todayISO();
  const [error, setError] = useState<string | null>(null);
  const list = creditReminders(bills, today);

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

  return (
    <section className="card credit-reminders" aria-labelledby="credit-reminders-title">
      <div className="card-head">
        <h2 id="credit-reminders-title">{t("credit.remindersTitle")}</h2>
        {showReportLink ? (
          <Link to="/reports/credit" className="link-button">
            {t("credit.reportLink")}
          </Link>
        ) : (
          <Link to="/bills?show=unpaid" className="link-button">
            {t("credit.allUnpaid")}
          </Link>
        )}
      </div>
      <p className="muted">{t("credit.remindersHint")}</p>
      {error && (
        <div className="alert alert-error" role="alert">
          {t("credit.saveFailed", { message: error })}
        </div>
      )}
      {list.length === 0 ? (
        <p className="muted credit-none">{t("credit.noneDue")}</p>
      ) : (
        <ul className="credit-list">
          {list.map((r, i) => (
            <li key={r.bill.id} className={r.status === "overdue" ? "credit-overdue" : ""}>
              <Link to={`/bills/${r.bill.id}`} className="credit-who">
                <strong>{r.bill.customer_name}</strong>
                <span className="muted">
                  {t("lists.billNumber", { number: displayNumber(r.bill.bill_number) })} · <span className="reg">{r.bill.vehicle_reg}</span>
                </span>
              </Link>
              <div className="credit-when">
                <strong>{formatINR(rupeesToPaise(r.balance))}</strong>
                <span className={r.status === "overdue" ? "credit-late" : "muted"}>{creditDueText(r.dueOn, today)}</span>
                {r.bill.credit_reminded_on && (
                  <span className="muted credit-meta">{t("credit.reminded", { date: formatDate(r.bill.credit_reminded_on) })}</span>
                )}
              </div>
              <button type="button" className="btn btn-whatsapp btn-sm" onClick={() => void remind(i)}>
                {t("credit.remind")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
