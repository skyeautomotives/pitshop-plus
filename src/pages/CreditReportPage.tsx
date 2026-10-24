import { Link } from "react-router";
import { t, useT } from "../i18n";
import CreditReminders from "../components/CreditReminders";
import { CreditReportView } from "../components/CreditReport";
import { unpaidBills } from "../lib/api";
import { todayISO } from "../lib/customer";
import { useIsOwner, useMe } from "../lib/staff";
import { useLoad } from "../lib/useLoad";

/** Credit report on its own page: reminders due now, then every bill on credit. */
export default function CreditReportPage() {
  useT();
  const me = useMe();
  const isOwner = useIsOwner();
  const today = todayISO();
  const state = useLoad(`credit-report|${today}`, () => unpaidBills());

  if (me.status === "loading") return <p className="page-status">{t("common.loading")}</p>;
  if (!isOwner)
    return (
      <div className="empty empty-list">
        <h1>{t("reports.credit")}</h1>
        <p>{t("reports.ownerOnly")}</p>
      </div>
    );

  return (
    <div className="credit-page">
      <div className="sales-head">
        <h1>{t("reports.credit")}</h1>
        <Link to="/" className="btn btn-outline">
          {t("nav.dashboard")}
        </Link>
      </div>
      {state.status === "loading" && <p className="page-status">{t("common.loading")}</p>}
      {state.status === "error" && (
        <div className="alert alert-error" role="alert">
          <span>{t("credit.saveFailed", { message: state.message })}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={state.retry}>
            {t("common.tryAgain")}
          </button>
        </div>
      )}
      {state.status === "ok" && (
        <>
          <CreditReminders bills={state.data.bills} link="none" />
          <CreditReportView bills={state.data.bills} />
        </>
      )}
    </div>
  );
}
