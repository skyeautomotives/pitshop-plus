import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { StatusBadge } from "../components/cards";
import ComplaintForm from "../components/ComplaintForm";
import { getComplaint, setComplaintStatus } from "../lib/api";
import { complaintToDraft, emptyComplaint } from "../lib/complaint";
import type { CustomerFields } from "../lib/customer";
import { formatDate } from "../lib/format";
import { formatINR, rupeesToPaise } from "../lib/money";
import { useMe } from "../lib/staff";
import { errorMessage } from "../lib/supabase";
import type { ComplaintStatus } from "../lib/types";
import { useLoad } from "../lib/useLoad";
import type { BillPrefill } from "./NewBill";

function NotFound() {
  return (
    <div className="empty">
      <h1>Complaint not found</h1>
      <p>This complaint doesn't exist or the link is wrong.</p>
      <Link to="/bills" className="btn btn-primary">
        Find bills
      </Link>
    </div>
  );
}

function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      <span>Couldn't load the complaint. {message}</span>
      <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
        Try again
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
  return <ComplaintForm initial={initial} title="New complaint" attendedBy={name} />;
}

export function EditComplaint() {
  const { id } = useParams();
  const state = useLoad(id ?? "", () => (isUuid(id) ? getComplaint(id!) : Promise.resolve(null)));
  const initial = useMemo(() => (state.status === "ok" && state.data ? complaintToDraft(state.data) : null), [state]);

  if (state.status === "loading") return <p className="page-status">Loading complaint…</p>;
  if (state.status === "error") return <LoadFailed message={state.message} onRetry={state.retry} />;
  if (!state.data || !initial) return <NotFound />;
  return (
    <ComplaintForm
      initial={initial}
      complaintId={state.data.id}
      attendedBy={state.data.attended_by ?? ""}
      title={`Edit complaint #${state.data.complaint_number}`}
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

  useEffect(() => {
    if (justSaved) navigate(location.pathname, { replace: true, state: null });
  }, [justSaved, navigate, location.pathname]);

  if (state.status === "loading") return <p className="page-status">Loading complaint…</p>;
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
          ← History for {c.vehicle_reg}
        </Link>
        <div className="toolbar-actions">
          <Link to={`/complaints/${c.id}/edit`} className="btn btn-outline">
            Edit
          </Link>
          <button type="button" className="btn btn-outline" onClick={() => void toggleStatus()} disabled={statusBusy}>
            {statusBusy ? "Saving…" : status === "open" ? "Mark resolved" : "Reopen"}
          </button>
          <Link to="/bills/new" state={{ prefill: billPrefill }} className="btn btn-primary">
            Create bill for this complaint
          </Link>
        </div>
      </div>

      {justSaved && (
        <div className="alert alert-success" role="status">
          Complaint #{c.complaint_number} saved.
        </div>
      )}
      {statusError && (
        <div className="alert alert-error" role="alert">
          Couldn't change the status. {statusError}
        </div>
      )}

      <article className="card">
        <div className="complaint-head">
          <h1>
            Complaint #{c.complaint_number} <StatusBadge status={status} />
          </h1>
        </div>
        <p className="complaint-description pre-line">{c.description}</p>
        <dl className="bill-customer">
          <div>
            <dt>Reported</dt>
            <dd>{formatDate(c.reported_on)}</dd>
          </div>
          <div>
            <dt>Attended by</dt>
            <dd>{c.attended_by || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Customer</dt>
            <dd>{c.customer_name}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{c.phone}</dd>
          </div>
          <div>
            <dt>Vehicle no.</dt>
            <dd className="reg">{c.vehicle_reg}</dd>
          </div>
          {c.address && (
            <div className="span-all">
              <dt>Address</dt>
              <dd className="pre-line">{c.address}</dd>
            </div>
          )}
          {c.notes && (
            <div className="span-all">
              <dt>Notes</dt>
              <dd className="pre-line">{c.notes}</dd>
            </div>
          )}
        </dl>
      </article>

      <section className="card">
        <h2>Bills for this complaint</h2>
        {bills.length === 0 ? (
          <p className="muted">
            No bill yet for this complaint.{" "}
            <Link to="/bills/new" state={{ prefill: billPrefill }}>
              Create one
            </Link>{" "}
            when the work is done.
          </p>
        ) : (
          <ul className="linked-list">
            {bills.map((b) => (
              <li key={b.id}>
                <Link to={`/bills/${b.id}`}>Bill #{b.bill_number}</Link>
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
