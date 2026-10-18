import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n";
import { jobLabel } from "../lib/jobCard";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { StatusBadge } from "../components/cards";
import ComplaintForm from "../components/ComplaintForm";
import { getComplaint, setComplaintStatus } from "../lib/api";
import { complaintToDraft, documentsText, emptyComplaint, paymentMethodLabel } from "../lib/complaint";
import type { CustomerFields } from "../lib/customer";
import { formatDate } from "../lib/format";
import { formatINR, rupeesToPaise } from "../lib/money";
import { useMe } from "../lib/staff";
import { errorMessage } from "../lib/supabase";
import type { ComplaintStatus } from "../lib/types";
import { useLoad } from "../lib/useLoad";
import type { BillPrefill } from "./NewBill";
import { displayNumber } from "../lib/format";

function NotFound() {
  const { t } = useT();
  return (
    <div className="empty">
      <h1>{t("complaint.notFoundTitle")}</h1>
      <p>{t("complaint.notFoundBody")}</p>
      <Link to="/bills" className="btn btn-primary">
        {t("nav.findBills")}
      </Link>
    </div>
  );
}

function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useT();
  return (
    <div className="alert alert-error" role="alert">
      <span>{t("complaint.loadFailed", { message })}</span>
      <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
        {t("common.tryAgain")}
      </button>
    </div>
  );
}

const isUuid = (id: string | undefined) => !!id && /^[0-9a-f-]{36}$/i.test(id);

export function NewComplaint() {
  const location = useLocation();
  const me = useMe();
  const [initial] = useState(() => {
    const prefill = (location.state as { prefill?: Partial<CustomerFields> } | null)?.prefill;
    return emptyComplaint(prefill ?? {});
  });
  const name = me.status === "ok" ? me.me.full_name.trim() || me.me.username : "";
  const { t } = useT();
  return <ComplaintForm initial={initial} title={t("complaint.newComplaint")} attendedBy={name} />;
}

export function EditComplaint() {
  const { id } = useParams();
  const state = useLoad(id ?? "", () => (isUuid(id) ? getComplaint(id!) : Promise.resolve(null)));
  const initial = useMemo(() => (state.status === "ok" && state.data ? complaintToDraft(state.data) : null), [state]);
  const { t } = useT();

  if (state.status === "loading") return <p className="page-status">{t("complaint.loadingOne")}</p>;
  if (state.status === "error") return <LoadFailed message={state.message} onRetry={state.retry} />;
  if (!state.data || !initial) return <NotFound />;
  return (
    <ComplaintForm
      initial={initial}
      complaintId={state.data.id}
      attendedBy={state.data.attended_by ?? ""}
      title={t("complaint.editTitle", { number: displayNumber(state.data.complaint_number) })}
    />
  );
}

export function ComplaintView() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [justSaved] = useState(() => (location.state as { saved?: boolean } | null)?.saved === true);
  const state = useLoad(id ?? "", () => (isUuid(id) ? getComplaint(id!) : Promise.resolve(null)));
  const [statusOverride, setStatusOverride] = useState<ComplaintStatus | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const { t } = useT();

  useEffect(() => {
    if (justSaved) navigate(location.pathname, { replace: true, state: null });
  }, [justSaved, navigate, location.pathname]);

  if (state.status === "loading") return <p className="page-status">{t("complaint.loadingOne")}</p>;
  if (state.status === "error") return <LoadFailed message={state.message} onRetry={state.retry} />;
  if (!state.data) return <NotFound />;

  const c = state.data;
  const status = statusOverride ?? c.status;
  const bills = [...c.bills].sort((a, b) => (a.date_received < b.date_received ? 1 : -1));
  const customer: CustomerFields = {
    customerName: c.customer_name,
    phone: c.phone,
    address: c.address ?? "",
    vehicleReg: c.vehicle_reg,
  };
  const billPrefill: BillPrefill = { ...customer, complaintIds: [c.id] };

  async function toggleStatus() {
    const next: ComplaintStatus = status === "open" ? "resolved" : "open";
    setStatusBusy(true);
    setStatusError(null);
    try {
      await setComplaintStatus(c.id, next);
      setStatusOverride(next);
    } catch (err) {
      setStatusError(errorMessage(err));
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <Link to={`/vehicles/${c.vehicle_reg_key}`} className="back-link">
          {t("complaint.historyFor", { reg: c.vehicle_reg })}
        </Link>
        <div className="toolbar-actions">
          <Link to={`/complaints/${c.id}/edit`} className="btn btn-outline">
            {t("complaint.edit")}
          </Link>
          <button type="button" className="btn btn-outline" onClick={() => void toggleStatus()} disabled={statusBusy}>
            {statusBusy ? t("common.saving") : status === "open" ? t("complaint.markResolved") : t("complaint.reopen")}
          </button>
          <Link to="/bills/new" state={{ prefill: billPrefill }} className="btn btn-primary">
            {t("complaint.createBill")}
          </Link>
        </div>
      </div>

      {justSaved && (
        <div className="alert alert-success" role="status">
          {c.complaint_number === null ? t("complaint.savedOffline") : t("complaint.saved", { number: displayNumber(c.complaint_number) })}
        </div>
      )}
      {statusError && (
        <div className="alert alert-error" role="alert">
          {t("complaint.statusFailed", { message: statusError })}
        </div>
      )}

      <article className="card">
        <div className="complaint-head">
          <h1>
            {t("complaint.title", { number: displayNumber(c.complaint_number) })} <StatusBadge status={status} />
          </h1>
        </div>
        {(c.jobs ?? []).length > 0 && (
          <ul className="job-ticked" aria-label={t("complaint.jobsTickedLabel")}>
            {(c.jobs ?? []).map((id) => (
              <li key={id}>{jobLabel(id)}</li>
            ))}
          </ul>
        )}
        {c.description.trim() && <p className="complaint-description pre-line">{c.description}</p>}
        <dl className="bill-customer">
          <div>
            <dt>{t("complaint.reported")}</dt>
            <dd>{formatDate(c.reported_on)}</dd>
          </div>
          <div>
            <dt>{t("complaint.attendedBy")}</dt>
            <dd>{c.attended_by || t("common.notRecorded")}</dd>
          </div>
          <div>
            <dt>{t("complaint.customer")}</dt>
            <dd>{c.customer_name}</dd>
          </div>
          <div>
            <dt>{t("complaint.phone")}</dt>
            <dd>{c.phone}</dd>
          </div>
          <div>
            <dt>{t("complaint.vehicleNo")}</dt>
            <dd className="reg">{c.vehicle_reg}</dd>
          </div>
          {c.vehicle_name && (
            <div>
              <dt>{t("complaint.vehicle")}</dt>
              <dd>{c.vehicle_name}</dd>
            </div>
          )}
          {c.odometer_km !== null && c.odometer_km !== undefined && (
            <div>
              <dt>{t("complaint.km")}</dt>
              <dd>{t("complaint.kmValue", { km: c.odometer_km.toLocaleString("en-IN") })}</dd>
            </div>
          )}
          {c.helmets !== null && c.helmets !== undefined && (
            <div>
              <dt>{t("complaint.helmets")}</dt>
              <dd>{c.helmets}</dd>
            </div>
          )}
          {c.address && (
            <div className="span-all">
              <dt>{t("complaint.address")}</dt>
              <dd className="pre-line">{c.address}</dd>
            </div>
          )}
          {((c.helmets !== null && c.helmets !== undefined) || documentsText(c) !== "") && (
            <div className="span-all">
              <dt>{t("complaint.documentsReceived")}</dt>
              <dd>{documentsText(c) || t("complaint.none")}</dd>
            </div>
          )}
          {!!c.advance_amount && (
            <div className="span-all">
              <dt>{t("complaint.advanceReceived")}</dt>
              <dd>
                <strong>{formatINR(rupeesToPaise(c.advance_amount))}</strong>
                {c.advance_method && <span className="muted"> · {paymentMethodLabel(c.advance_method)}</span>}
              </dd>
            </div>
          )}
          {c.notes && (
            <div className="span-all">
              <dt>{t("complaint.notes")}</dt>
              <dd className="pre-line">{c.notes}</dd>
            </div>
          )}
        </dl>
      </article>

      <section className="card">
        <h2>{t("complaint.billsFor")}</h2>
        {bills.length === 0 ? (
          <p className="muted">
            {t("complaint.noBillYet")}{" "}
            <Link to="/bills/new" state={{ prefill: billPrefill }}>
              {t("complaint.createOne")}
            </Link>{" "}
            {t("complaint.whenDone")}
          </p>
        ) : (
          <ul className="linked-list">
            {bills.map((b) => (
              <li key={b.id}>
                <Link to={`/bills/${b.id}`}>{t("complaint.billNumber", { number: displayNumber(b.bill_number) })}</Link>
                <span className="muted">{formatDate(b.date_received)}</span>
                <strong>{formatINR(rupeesToPaise(b.grand_total))}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
