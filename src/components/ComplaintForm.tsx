import { useMemo, useState, type FormEvent } from "react";
import { useT } from "../i18n";
import { Link, useNavigate } from "react-router";
import { createComplaint, updateComplaint } from "../lib/api";
import CarDiagram, { MARK_LABEL, MarkShape } from "./CarDiagram";
import { MARK_KINDS, type MarkKind } from "../lib/carMarks";
import { BELONGINGS, INTAKE_DOCUMENTS, MAX_OTHER_DOCUMENTS, PAYMENT_METHODS, validateComplaint, type ComplaintDraft } from "../lib/complaint";
import type { FieldErrors } from "../lib/customer";
import { useShopSettings } from "../lib/shopSettings";
import { errorMessage } from "../lib/supabase";
import { jobLabel, jobList } from "../lib/jobCard";
import { vehicleExamples } from "../lib/vehicleType";
import { useUnsavedGuard } from "../lib/useUnsavedGuard";
import CustomerInputs from "./CustomerInputs";
import { Field, FieldError, fieldProps, MoneyInput } from "./fields";
import type { PaymentMethod } from "../lib/types";

const FIELD_ORDER = [
  "vehicleReg",
  "customerName",
  "phone",
  "address",
  "vehicleName",
  "odometerKm",
  "otherDocuments",
  "otherBelongings",
  "description",
  "reportedOn",
  "notes",
  "advance",
];

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
  const vehicleType = useShopSettings().settings?.vehicle_type;
  const examples = vehicleExamples(vehicleType);
  // Car workshops don't take helmets; bike workshops don't need items left in the car.
  const car = vehicleType === "car";
  const bike = vehicleType === "bike";
  const [markKind, setMarkKind] = useState<MarkKind>("scratch");
  const [draft, setDraft] = useState(initial);
  const [baseline] = useState(() => JSON.stringify(initial));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== baseline;
  const errors = useMemo(() => validateComplaint(draft, { car }).errors, [draft, car]);
  const shown: FieldErrors = submitted ? errors : {};
  const errorCount = Object.keys(shown).length;

  const { t, tn } = useT();
  const guard = useUnsavedGuard(dirty, t("complaint.unsaved"));

  const set = (patch: Partial<ComplaintDraft>) => setDraft((d) => ({ ...d, ...patch }));
  // This workshop's list, plus anything ticked earlier that isn't on it (e.g. after changing the workshop type).
  const jobs = useMemo(() => {
    const list = jobList(vehicleType);
    const extra = draft.jobs.filter((id) => !list.some((j) => j.id === id)).map((id) => ({ id, label: jobLabel(id) }));
    return [...list, ...extra];
  }, [vehicleType, draft.jobs]);
  const toggleJob = (id: string, on: boolean) =>
    set({ jobs: on ? [...draft.jobs, id] : draft.jobs.filter((x) => x !== id) });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setSaveError(null);
    const { errors: errs, payload } = validateComplaint(draft, { car });
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
          {tn("form.fixFields", errorCount)}
        </div>
      )}
      {saveError && (
        <div className="alert alert-error" role="alert">
          {t("complaint.saveFailed", { message: saveError })}
        </div>
      )}

      <section className="card">
        <h2>{t("form.customerVehicle")}</h2>
        <div className="grid">
          <CustomerInputs value={draft} errors={shown} onChange={set} />
        </div>
      </section>

      <section className="card">
        <h2>{t("complaint.vehicleReceived")}</h2>
        <div className="grid">
          <Field fieldKey="vehicleName" label={t("complaint.vehicleName")} error={shown.vehicleName}>
            <input
              {...fieldProps("vehicleName", shown.vehicleName)}
              type="text"
              placeholder={examples.vehicleName}
              maxLength={100}
              value={draft.vehicleName}
              onChange={(e) => set({ vehicleName: e.target.value })}
            />
          </Field>
          <Field fieldKey="odometerKm" label={t("complaint.km")} hint={t("complaint.kmHint")} error={shown.odometerKm}>
            <input
              {...fieldProps("odometerKm", shown.odometerKm)}
              type="text"
              inputMode="numeric"
              placeholder="e.g. 12500"
              autoComplete="off"
              value={draft.odometerKm}
              onChange={(e) => set({ odometerKm: e.target.value })}
            />
          </Field>
        </div>

        {!car && (
          <fieldset className="intake-group">
            <legend>{t("complaint.helmets")}</legend>
            <div className="segmented" role="group" aria-label={t("complaint.helmets")}>
              {([0, 1, 2] as const).map((n) => (
                <button key={n} type="button" aria-pressed={draft.helmets === n} onClick={() => set({ helmets: n })}>
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {!bike && (
          <fieldset className={`intake-group${shown.otherBelongings ? " has-error" : ""}`}>
            <legend>{t("complaint.itemsInCar")}</legend>
            <div className="intake-checks">
              {BELONGINGS.map((b) => (
                <label key={b.id} className="check">
                  <input
                    type="checkbox"
                    checked={draft.belongings.includes(b.id)}
                    onChange={(e) =>
                      set({ belongings: e.target.checked ? [...draft.belongings, b.id] : draft.belongings.filter((x) => x !== b.id) })
                    }
                  />
                  {b.label}
                </label>
              ))}
            </div>
            <div className="intake-others">
              <input
                {...fieldProps("otherBelongings", shown.otherBelongings)}
                type="text"
                aria-label={t("complaint.otherItems")}
                placeholder={t("complaint.otherItems")}
                value={draft.otherBelongings}
                onChange={(e) => set({ otherBelongings: e.target.value })}
              />
            </div>
            <FieldError fieldKey="otherBelongings" error={shown.otherBelongings} />
          </fieldset>
        )}

        {!bike && (
          <fieldset className="intake-group car-condition">
            <legend>{t("complaint.carCondition")}</legend>
            <p className="hint">{t("complaint.carConditionHint")}</p>
            <div className="segmented mark-kinds" role="group" aria-label={t("complaint.carCondition")}>
              {MARK_KINDS.map((k) => (
                <button key={k} type="button" aria-pressed={markKind === k} onClick={() => setMarkKind(k)}>
                  <svg viewBox="-10 -10 20 20" width={16} height={16} aria-hidden="true">
                    <MarkShape kind={k} x={0} y={0} size={0.9} />
                  </svg>
                  {t(MARK_LABEL[k])}
                </button>
              ))}
            </div>
            <div className="car-diagram-wrap">
              <CarDiagram marks={draft.carMarks} kind={markKind} onChange={(carMarks) => set({ carMarks })} label={t("complaint.carCondition")} />
            </div>
            {draft.carMarks.length > 0 && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => set({ carMarks: [] })}>
                {t("complaint.markClear")}
              </button>
            )}
          </fieldset>
        )}

        <fieldset className={`intake-group${shown.otherDocuments ? " has-error" : ""}`}>
          <legend>{t("complaint.documentsReceived")}</legend>
          <div className="intake-checks">
            {INTAKE_DOCUMENTS.map((d) => (
              <label key={d.id} className="check">
                <input
                  type="checkbox"
                  checked={draft.documents.includes(d.id)}
                  onChange={(e) =>
                    set({ documents: e.target.checked ? [...draft.documents, d.id] : draft.documents.filter((x) => x !== d.id) })
                  }
                />
                {d.label}
              </label>
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={draft.otherDocumentsOn}
                onChange={(e) => set({ otherDocumentsOn: e.target.checked })}
              />
              {t("documents.other")}
            </label>
          </div>
          {draft.otherDocumentsOn && (
            <div className="intake-others">
              {draft.otherDocuments.map((item, i) => (
                <div key={i} className="intake-other-row">
                  <input
                    {...(i === 0 ? fieldProps("otherDocuments", shown.otherDocuments) : {})}
                    type="text"
                    aria-label={t("complaint.otherItem", { n: i + 1 })}
                    placeholder={i === 0 ? t("complaint.otherPlaceholder") : t("complaint.anotherItem")}
                    maxLength={60}
                    value={item}
                    autoFocus={i > 0 && i === draft.otherDocuments.length - 1 && item === ""}
                    onChange={(e) =>
                      set({ otherDocuments: draft.otherDocuments.map((x, j) => (j === i ? e.target.value : x)) })
                    }
                  />
                  {draft.otherDocuments.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      aria-label={t("complaint.removeOther", { n: i + 1 })}
                      onClick={() => set({ otherDocuments: draft.otherDocuments.filter((_, j) => j !== i) })}
                    >
                      {t("complaint.remove")}
                    </button>
                  )}
                </div>
              ))}
              {draft.otherDocuments.length < MAX_OTHER_DOCUMENTS && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => set({ otherDocuments: [...draft.otherDocuments, ""] })}
                >
                  {t("complaint.addAnother")}
                </button>
              )}
              <FieldError fieldKey="otherDocuments" error={shown.otherDocuments} />
            </div>
          )}
        </fieldset>
      </section>

      <section className="card">
        <h2>{t("complaint.jobCard")}</h2>
        <fieldset className={`job-list${shown.description ? " has-error" : ""}`}>
          <legend>{t("complaint.whatNeedsDoing")}</legend>
          <p className="hint">{t("complaint.tickAll")}</p>
          <div className="job-checks">
            {jobs.map((j) => (
              <label key={j.id} className={`check job-check${draft.jobs.includes(j.id) ? " checked" : ""}`}>
                <input type="checkbox" checked={draft.jobs.includes(j.id)} onChange={(e) => toggleJob(j.id, e.target.checked)} />
                {j.label}
              </label>
            ))}
          </div>
          {draft.jobs.length > 0 && (
            <p className="job-count muted">{tn("complaint.jobsTicked", draft.jobs.length)}</p>
          )}
        </fieldset>
        <Field fieldKey="description" label={t("complaint.otherProblems")} error={shown.description}>
          <textarea
            {...fieldProps("description", shown.description)}
            rows={3}
            placeholder={examples.complaint}
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
        <div className="grid">
          <Field fieldKey="reportedOn" label={t("complaint.dateReported")} required error={shown.reportedOn}>
            <input
              {...fieldProps("reportedOn", shown.reportedOn)}
              type="date"
              value={draft.reportedOn}
              onChange={(e) => set({ reportedOn: e.target.value })}
            />
          </Field>
          <div className="field">
            <span className="label-like">{t("complaint.attendedBy")}</span>
            <p className="attended-by">
              <span className="attended-avatar" aria-hidden="true">
                {attendedBy.trim().charAt(0).toUpperCase() || "?"}
              </span>
              {attendedBy || t("common.notRecorded")}
            </p>
            <p className="hint">
              {complaintId ? t("complaint.attendedSaved") : t("complaint.attendedNew")}
            </p>
          </div>
        </div>
        <Field fieldKey="notes" label={t("complaint.notes")} error={shown.notes}>
          <textarea
            {...fieldProps("notes", shown.notes)}
            rows={2}
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
        <div className="grid">
          <Field fieldKey="advance" label={t("complaint.advance")} hint={t("complaint.advanceHint")} error={shown.advance}>
            <MoneyInput
              {...fieldProps("advance", shown.advance)}
              invalid={!!shown.advance}
              value={draft.advance}
              onChange={(e) => set({ advance: e.target.value })}
            />
          </Field>
          {draft.advance.trim() !== "" && (
            <Field fieldKey="advanceMethod" label={t("complaint.paidBy")} required>
              <select
                {...fieldProps("advanceMethod")}
                value={draft.advanceMethod}
                onChange={(e) => set({ advanceMethod: e.target.value as PaymentMethod })}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <fieldset className="status-choice">
          <legend>{t("complaint.status")}</legend>
          {(["open", "resolved"] as const).map((s) => (
            <label key={s} className="check">
              <input type="radio" name="status" checked={draft.status === s} onChange={() => set({ status: s })} />
              {s === "open" ? t("status.open") : t("status.resolved")}
            </label>
          ))}
        </fieldset>
      </section>

      <div className="savebar">
        <span className="muted">{complaintId ? t("complaint.editing") : t("complaint.newComplaint")}</span>
        <div className="savebar-actions">
          {complaintId && (
            <Link to={`/complaints/${complaintId}`} className="btn btn-outline">
              {t("common.cancel")}
            </Link>
          )}
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? t("common.saving") : complaintId ? t("complaint.saveChanges") : t("complaint.saveComplaint")}
          </button>
        </div>
      </div>
      {guard.dialog}
    </form>
  );
}
