import { useEffect, useState } from "react";
import { Link } from "react-router";
import { complaintsByIds, complaintsForVehicle, openComplaintsForPhoneElsewhere, type ComplaintBrief } from "../lib/api";
import { isLookupKey, vehicleKey, type CustomerFields } from "../lib/customer";
import { formatDate } from "../lib/format";
import { errorMessage } from "../lib/supabase";
import type { ComplaintWithBills } from "../lib/types";
import { StatusBadge } from "./cards";
import { displayNumber } from "../lib/format";

type Load = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ok"; list: ComplaintWithBills[] };

interface Props {
  customer: CustomerFields;
  selected: string[];
  onChange: (ids: string[]) => void;
  /** When editing, the bill itself is not shown as "already on a bill". */
  billId?: string;
  /** Switch the bill to another vehicle number (offered when the number looks mistyped). */
  onUseVehicle: (vehicleReg: string) => void;
}

/** Lets staff tick which of this vehicle's complaints the bill addresses. Optional. */
export default function ComplaintPicker({ customer, selected, onChange, billId, onUseVehicle }: Props) {
  const key = vehicleKey(customer.vehicleReg);
  const phoneDigits = customer.phone.replace(/\D/g, "");
  const [load, setLoad] = useState<Load>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  // Ticked complaints that belong to a different vehicle than the one typed on this bill.
  const [mismatched, setMismatched] = useState<ComplaintBrief[]>([]);
  // This phone number's open complaints recorded under another vehicle number.
  const [elsewhere, setElsewhere] = useState<ComplaintBrief[]>([]);

  useEffect(() => {
    if (!isLookupKey(key)) {
      setLoad({ status: "idle" });
      return;
    }
    let cancelled = false;
    setLoad({ status: "loading" });
    const t = setTimeout(() => {
      complaintsForVehicle(key)
        .then((list) => {
          if (cancelled) return;
          setLoad({ status: "ok", list });
        })
        .catch((err) => {
          if (!cancelled) setLoad({ status: "error", message: errorMessage(err) });
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // Re-run only when the vehicle changes; selection changes don't need a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  // Explain ticked complaints that don't belong to this vehicle (the bill can't be saved with them).
  const listIds = load.status === "ok" ? load.list.map((c) => c.id) : null;
  const missingKey = listIds ? selected.filter((id) => !listIds.includes(id)).join(",") : "";
  useEffect(() => {
    if (!missingKey) {
      setMismatched([]);
      return;
    }
    let cancelled = false;
    complaintsByIds(missingKey.split(","))
      .then((rows) => {
        if (!cancelled) setMismatched(rows);
      })
      .catch(() => {
        /* the save will still be refused with a clear message */
      });
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  // Same customer, open complaint, different vehicle number: probably a typo in one of them.
  useEffect(() => {
    if (phoneDigits.length < 10 || !isLookupKey(key)) {
      setElsewhere([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      openComplaintsForPhoneElsewhere(phoneDigits, key)
        .then((rows) => {
          if (!cancelled) setElsewhere(rows);
        })
        .catch(() => {
          /* only a hint */
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [phoneDigits, key]);

  function toggle(id: string, on: boolean) {
    onChange(on ? [...selected, id] : selected.filter((s) => s !== id));
  }

  const newComplaintLink = (
    <Link to="/complaints/new" state={{ prefill: customer }} className="link-button">
      Record a new complaint
    </Link>
  );

  return (
    <section className="card">
      <h2>Complaints this bill fixes</h2>
      <p className="hint">
        Optional. Tick the customer's complaints that this work addresses. Ticked complaints are marked{" "}
        <strong>Resolved</strong> when you save the bill.
      </p>

      {mismatched.length > 0 && (
        <div className="alert alert-error" role="alert">
          <div>
            {mismatched.map((c) => (
              <p key={c.id} className="mismatch-line">
                Complaint <strong>{displayNumber(c.complaint_number)}</strong> is for vehicle <strong>{c.vehicle_reg}</strong>, but this bill
                is for <strong>{customer.vehicleReg.toUpperCase() || "no vehicle number"}</strong>.{" "}
                <button type="button" className="link-button" onClick={() => onUseVehicle(c.vehicle_reg)}>
                  Use {c.vehicle_reg}
                </button>{" "}
                or{" "}
                <button type="button" className="link-button" onClick={() => onChange(selected.filter((id) => id !== c.id))}>
                  unlink it
                </button>
                .
              </p>
            ))}
          </div>
        </div>
      )}

      {elsewhere.length > 0 && (
        <div className="alert alert-info">
          <div>
            <p className="mismatch-line">
              This customer's phone number has an open complaint under a <strong>different vehicle number</strong>. Is
              the number right?
            </p>
            {elsewhere.map((c) => (
              <p key={c.id} className="mismatch-line">
                <strong>{displayNumber(c.complaint_number)}</strong> · {c.vehicle_reg} · {c.description}{" "}
                <button type="button" className="btn btn-outline btn-sm" onClick={() => onUseVehicle(c.vehicle_reg)}>
                  Use {c.vehicle_reg}
                </button>
              </p>
            ))}
          </div>
        </div>
      )}

      {load.status === "idle" && <p className="muted">Enter the vehicle number above to see complaints for that vehicle.</p>}
      {load.status === "loading" && <p className="muted">Looking for complaints for {key}…</p>}
      {load.status === "error" && (
        <div className="alert alert-error" role="alert">
          <span>Couldn't load complaints. {load.message}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </div>
      )}
      {load.status === "ok" && load.list.length === 0 && (
        <p className="muted">
          No complaints recorded for {key}. You can save the bill without one. {newComplaintLink}?
        </p>
      )}
      {load.status === "ok" && load.list.length > 0 && (
        <>
          <p className="picker-scope">
            Showing complaints for <span className="reg">{key}</span>
          </p>
          <ul className="picker">
            {load.list.map((c) => {
              const otherBills = c.bills.filter((b) => b.id !== billId);
              return (
                <li key={c.id}>
                  <label className="picker-row">
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
                    <span className="picker-body">
                      <span className="picker-top">
                        <strong>{displayNumber(c.complaint_number)}</strong>
                        <StatusBadge status={c.status} />
                        <span className="muted">{formatDate(c.reported_on)}</span>
                      </span>
                      <span className="picker-desc">{c.description}</span>
                      <span className="muted picker-meta">
                        Attended by {c.attended_by || "not recorded"}
                        {otherBills.length > 0 && ` · Already on bill ${otherBills.map((b) => displayNumber(b.bill_number)).join(", ")}`}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="hint">
            {selected.length === 0 ? "No complaint selected." : `${selected.length} selected.`} Not listed? {newComplaintLink}.
          </p>
        </>
      )}
    </section>
  );
}
