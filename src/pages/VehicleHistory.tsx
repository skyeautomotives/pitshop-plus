import { useState } from "react";
import { Link, useParams } from "react-router";
import { BillCard, ComplaintCard } from "../components/cards";
import { vehicleHistory } from "../lib/api";
import { vehicleKey, type CustomerFields } from "../lib/customer";
import { buildHistory, filterHistory, historyCounts, type HistoryFilter } from "../lib/history";
import { useLoad } from "../lib/useLoad";
import type { BillPrefill } from "./NewBill";

const FILTER_EMPTY: Record<HistoryFilter, string> = {
  all: "No bills or complaints for this vehicle yet.",
  "complaints-without-bill": "Every complaint for this vehicle has a bill.",
  "bills-without-complaint": "Every bill for this vehicle is linked to a complaint.",
};

/** Complaints and bills for one vehicle, together in date order. */
export default function VehicleHistory() {
  const key = vehicleKey(useParams().key ?? "");
  const state = useLoad(key, () => vehicleHistory(key));
  const [filter, setFilter] = useState<HistoryFilter>("all");

  if (state.status === "loading") return <p className="page-status">Loading history…</p>;
  if (state.status === "error")
    return (
      <div className="alert alert-error" role="alert">
        <span>Couldn't load the history. {state.message}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={state.retry}>
          Try again
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
    { id: "all", label: "Everything", count: all.length },
    { id: "complaints-without-bill", label: "Complaints without a bill", count: counts.complaintsWithoutBill },
    { id: "bills-without-complaint", label: "Bills without a complaint", count: counts.billsWithoutComplaint },
  ];

  return (
    <div>
      <Link to={`/bills?q=${encodeURIComponent(key)}`} className="back-link">
        ← Find bills
      </Link>
      <div className="history-head">
        <div>
          <h1>
            <span className="reg">{latest?.vehicle_reg ?? key}</span>
          </h1>
          {latest && (
            <p className="muted">
              {latest.customer_name} · {latest.phone}
              {otherNames.length > 0 && ` · also recorded as ${otherNames.join(", ")}`}
            </p>
          )}
        </div>
        <div className="toolbar-actions">
          <Link to="/complaints/new" state={{ prefill: customer ?? { vehicleReg: key } }} className="btn btn-outline">
            New complaint
          </Link>
          <Link to="/bills/new" state={{ prefill: billPrefill }} className="btn btn-primary">
            New bill
          </Link>
        </div>
      </div>

      <p className="history-summary">
        {counts.complaints} {counts.complaints === 1 ? "complaint" : "complaints"} ({counts.openComplaints} open) · {counts.bills}{" "}
        {counts.bills === 1 ? "bill" : "bills"}
      </p>

      <div className="filter-bar" role="group" aria-label="Show">
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
