import { useState, type FormEvent } from "react";
import { t, tn, useT } from "../i18n";
import { setBillCredit } from "../lib/api";
import { addDays, CREDIT_PRESETS, creditDueText, creditStatus, validateCredit } from "../lib/credit";
import { todayISO } from "../lib/customer";
import { formatDate } from "../lib/format";
import { errorMessage } from "../lib/supabase";
import ConfirmDialog from "./ConfirmDialog";

/** Credit on a bill with a balance: when the customer will pay the rest. Part of the Payments box. */
export default function BillCredit({
  billId,
  dueOn,
  note,
  remindedOn,
}: {
  billId: string;
  dueOn: string | null;
  note: string | null;
  remindedOn: string | null;
}) {
  useT();
  const today = todayISO();
  const [editing, setEditing] = useState<{ dueOn: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const open = () => {
    setNotice(null);
    setError(null);
    setSaveError(null);
    setEditing({ dueOn: dueOn ?? addDays(today, CREDIT_PRESETS[0]), note: note ?? "" });
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing || saving) return;
    const err = validateCredit(editing.dueOn, editing.note);
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await setBillCredit(billId, { due_on: editing.dueOn, note: editing.note.trim() || null });
      setEditing(null);
      setNotice(t("credit.saved", { date: formatDate(editing.dueOn) }));
    } catch (e2) {
      setSaveError(errorMessage(e2));
    } finally {
      setSaving(false);
    }
  }

  async function onClear() {
    setClearing(false);
    setSaveError(null);
    try {
      await setBillCredit(billId, { due_on: null });
      setNotice(t("credit.cleared"));
    } catch (e2) {
      setSaveError(errorMessage(e2));
    }
  }

  const status = dueOn ? creditStatus(dueOn, today) : null;

  return (
    <div className="bill-credit">
      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      {saveError && (
        <div className="alert alert-error" role="alert">
          {t("credit.saveFailed", { message: saveError })}
        </div>
      )}

      {dueOn && !editing && (
        <div className={`credit-box${status === "overdue" ? " credit-overdue" : ""}`}>
          <div>
            <strong>{t("credit.onCredit", { date: formatDate(dueOn) })}</strong>
            <div className="muted credit-meta">
              {creditDueText(dueOn, today)}
              {note && ` · ${note}`}
              {remindedOn && ` · ${t("credit.reminded", { date: formatDate(remindedOn) })}`}
            </div>
          </div>
          <div className="credit-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={open}>
              {t("credit.change")}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setClearing(true)}>
              {t("credit.clear")}
            </button>
          </div>
        </div>
      )}

      {editing ? (
        <form className="credit-form" onSubmit={onSubmit} noValidate>
          <h3>{t("credit.title")}</h3>
          <p className="hint">{t("credit.hint")}</p>
          <div className={`field${error ? " has-error" : ""}`}>
            <label htmlFor="f-creditDue">{t("credit.dueBy")}</label>
            <div className="credit-presets" role="group" aria-label={t("credit.dueBy")}>
              {CREDIT_PRESETS.map((n) => {
                const date = addDays(today, n);
                return (
                  <button
                    key={n}
                    type="button"
                    className={`btn btn-sm ${editing.dueOn === date ? "btn-primary" : "btn-outline"}`}
                    aria-pressed={editing.dueOn === date}
                    onClick={() => {
                      setError(null);
                      setEditing({ ...editing, dueOn: date });
                    }}
                  >
                    {tn("credit.inDays", n)}
                  </button>
                );
              })}
            </div>
            <input
              id="f-creditDue"
              type="date"
              min={today}
              value={editing.dueOn}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "f-creditDue-error" : undefined}
              onChange={(e) => {
                setError(null);
                setEditing({ ...editing, dueOn: e.target.value });
              }}
            />
            {error && (
              <p className="field-error" id="f-creditDue-error">
                {error}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="f-creditNote">
              {t("credit.note")} <span className="optional">{t("common.optional")}</span>
            </label>
            <input
              id="f-creditNote"
              type="text"
              maxLength={200}
              placeholder={t("credit.notePlaceholder")}
              value={editing.note}
              onChange={(e) => setEditing({ ...editing, note: e.target.value })}
            />
          </div>
          <div className="pay-actions">
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)} disabled={saving}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t("common.saving") : t("credit.save")}
            </button>
          </div>
        </form>
      ) : (
        !dueOn && (
          <button type="button" className="btn btn-outline" onClick={open}>
            {t("credit.give")}
          </button>
        )
      )}

      {clearing && (
        <ConfirmDialog
          title={t("credit.clearTitle")}
          message={t("credit.clearMessage")}
          confirmLabel={t("credit.clear")}
          cancelLabel={t("credit.keep")}
          onConfirm={() => void onClear()}
          onCancel={() => setClearing(false)}
        />
      )}
    </div>
  );
}
