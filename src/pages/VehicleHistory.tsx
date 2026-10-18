import { useState } from "react";
import { useT, type Key } from "../i18n";
import { Link, useParams } from "react-router";
import { BillCard, ComplaintCard } from "../components/cards";
import { vehicleHistory } from "../lib/api";
import { vehicleKey, type CustomerFields } from "../lib/customer";
import { buildHistory, filterHistory, historyCounts, type HistoryFilter } from "../lib/history";
import { useLoad } from "../lib/useLoad";
import type { BillPrefill } from "./NewBill";

const FILTER_EMPTY: Record<HistoryFilter, Key> = {
  all: "history.emptyAll",
  "complaints-without-bill": "history.emptyComplaintsWithoutBill",
  "bills-without-complaint": "history.emptyBillsWithoutComplaint",
};

/** Complaints and bills for one vehicle, together in date order. */
export default function VehicleHistory() {
  const key = vehicleKey(useParams().key ?? "");
  const state = useLoad(key, () => vehicleHistory(key));
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const { t, tn } = useT();

  if (state.status === "loading") return <p className="page-status">{t("history.loading")}</p>;
  if (state.status === "error")
    return (
      <div className="alert alert-error" role="alert">
        <span>{t("history.loadFailed", { message: state.message })}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={state.retry}>
          {t("common.tryAgain")}
        </button>
      </div>
    );

  const { complaints, bills } = state.data;
  const all = buildHistory(complaints, bills);
  const shown = filterHistory(all, filter);
  const counts = historyCounts(complaints, bills);

  // Most recent customer details for this vehicle (for display and for new records).
  const latest = all[0] && (all[0].kind === "bill" ? all[0].bill : all[0].complaint);
  const customer: CustomerFields | undefined = latest && {
    customerName: latest.customer_name,
    phone: latest.phone,
    address: latest.address ?? "",
    vehicleReg: latest.vehicle_reg,
  };
  const otherNames = [...new Set(all.map((e) => (e.kind === "bill" ? e.bill.customer_name : e.complaint.customer_name)))].filter(
    (n) => n !== latest?.customer_name,
  );
  const billPrefill: BillPrefill = customer ?? { vehicleReg: key };

  const filters: { id: HistoryFilter; label: string; count: number }[] = [
    { id: "all", label: t("history.everything"), count: all.length },
    { id: "complaints-without-bill", label: t("history.complaintsWithoutBill"), count: counts.complaintsWithoutBill },
    { id: "bills-without-complaint", label: t("history.billsWithoutComplaint"), count: counts.billsWithoutComplaint },
  ];

  return (
    <div>
      <Link to={`/bills?q=${encodeURIComponent(key)}`} className="back-link">
        {t("history.back")}
      </Link>
      <div className="history-head">
        <div>
          <h1>
            <span className="reg">{latest?.vehicle_reg ?? key}</span>
          </h1>
          {latest && (
            <p className="muted">
              {latest.customer_name} · {latest.phone}
              {otherNames.length > 0 && t("history.alsoRecordedAs", { names: otherNames.join(", ") })}
            </p>
          )}
        </div>
        <div className="toolbar-actions">
          <Link to="/complaints/new" state={{ prefill: customer ?? { vehicleReg: key } }} className="btn btn-outline">
            {t("nav.newComplaint")}
          </Link>
          <Link to="/bills/new" state={{ prefill: billPrefill }} className="btn btn-primary">
            {t("nav.newBill")}
          </Link>
        </div>
      </div>

      <p className="history-summary">
        {tn("history.complaintsSummary", counts.complaints, { open: counts.openComplaints })} · {tn("dashboard.billCount", counts.bills)}
      </p>

      <div className="filter-bar" role="group" aria-label={t("lists.show")}>
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip${filter === f.id ? " chip-active" : ""}${f.id !== "all" && f.count > 0 ? " chip-attention" : ""}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label} <span className="chip-count">{f.count}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty empty-list">
          <p>{FILTER_EMPTY[filter]}</p>
        </div>
      ) : (
        <ul className="results timeline">
          {shown.map((e) => (
            <li key={`${e.kind}-${e.kind === "bill" ? e.bill.id : e.complaint.id}`}>
              {e.kind === "bill" ? (
                <BillCard bill={e.bill} showCustomer={false} />
              ) : (
                <ComplaintCard complaint={e.complaint} showCustomer={false} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
