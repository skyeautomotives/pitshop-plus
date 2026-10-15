import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { createComplaint, updateComplaint } from "../lib/api";
import { validateComplaint, type ComplaintDraft } from "../lib/complaint";
import type { FieldErrors } from "../lib/customer";
import { errorMessage } from "../lib/supabase";
import { useUnsavedGuard } from "../lib/useUnsavedGuard";
import CustomerInputs from "./CustomerInputs";
import { Field, fieldProps } from "./fields";

const FIELD_ORDER = ["vehicleReg", "customerName", "phone", "address", "description", "reportedOn", "notes"];

export default function ComplaintForm({
  initial,
  title,
  complaintId,
  attendedBy,
}: {
  initial: ComplaintDraft;
  title: string;
  /** Set when editing a saved complaint. */
  complaintId?: string;
  /** Who attended the customer: the signed-in staff member for a new complaint, as saved when editing. */
  attendedBy: string;
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initial);
  const [baseline] = useState(() => JSON.stringify(initial));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== baseline;
  const errors = useMemo(() => validateComplaint(draft).errors, [draft]);
  const shown: FieldErrors = submitted ? errors : {};
  const errorCount = Object.keys(shown).length;

  const guard = useUnsavedGuard(dirty, "This complaint has not been saved and will be lost.");

  const set = (patch: Partial<ComplaintDraft>) => setDraft((d) => ({ ...d, ...patch }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setSaveError(null);
    const { errors: errs, payload } = validateComplaint(draft);
    if (!payload) {
      const first = FIELD_ORDER.find((k) => errs[k]);
      if (first) document.getElementById(`f-${first}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      let id = complaintId;
      if (id) await updateComplaint(id, payload);
      else id = await createComplaint(payload);
      guard.allowLeave();
      navigate(`/complaints/${id}`, { state: { saved: true } });
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form className="bill-form" onSubmit={onSubmit} noValidate>
      <h1>{title}</h1>
      {errorCount > 0 && (
        <div className="alert alert-error" role="alert">
          Please fix the {errorCount === 1 ? "highlighted field" : `${errorCount} highlighted fields`} below.
        </div>
      )}
      {saveError && (
        <div className="alert alert-error" role="alert">
          Couldn't save the complaint. {saveError}
        </div>
      )}

      <section className="card">
        <h2>Customer & vehicle</h2>
        <div className="grid">
          <CustomerInputs value={draft} errors={shown} onChange={set} />
        </div>
      </section>

      <section className="card">
        <h2>Complaint</h2>
        <Field fieldKey="description" label="What is the problem?" required error={shown.description}>
          <textarea
            {...fieldProps("description", shown.description)}
            rows={3}
            placeholder="e.g. Brake noise when stopping, engine warning light on"
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
        <div className="grid">
          <Field fieldKey="reportedOn" label="Date reported" required error={shown.reportedOn}>
            <input
              {...fieldProps("reportedOn", shown.reportedOn)}
              type="date"
              value={draft.reportedOn}
              onChange={(e) => set({ reportedOn: e.target.value })}
            />
          </Field>
          <div className="field">
            <span className="label-like">Attended by</span>
            <p className="attended-by">
              <span className="attended-avatar" aria-hidden="true">
                {attendedBy.trim().charAt(0).toUpperCase() || "?"}
              </span>
              {attendedBy || "Not recorded"}
            </p>
            <p className="hint">
              {complaintId ? "Recorded when the complaint was saved." : "Filled in from your login when you save."}
            </p>
          </div>
        </div>
        <Field fieldKey="notes" label="Notes" error={shown.notes}>
          <textarea
            {...fieldProps("notes", shown.notes)}
            rows={2}
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
        <fieldset className="status-choice">
          <legend>Status</legend>
          {(["open", "resolved"] as const).map((s) => (
            <label key={s} className="check">
              <input type="radio" name="status" checked={draft.status === s} onChange={() => set({ status: s })} />
              {s === "open" ? "Open" : "Resolved"}
            </label>
          ))}
        </fieldset>
      </section>

      <div className="savebar">
        <span className="muted">{complaintId ? "Editing complaint" : "New complaint"}</span>
        <div className="savebar-actions">
          {complaintId && (
            <Link to={`/complaints/${complaintId}`} className="btn btn-outline">
              Cancel
            </Link>
          )}
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? "Saving…" : complaintId ? "Save changes" : "Save complaint"}
          </button>
        </div>
      </div>
      {guard.dialog}
    </form>
  );
}
