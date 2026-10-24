import { useState, type FormEvent } from "react";
import { t, tn, useT } from "../i18n";
import { addBillPayment, removeBillPayment, setBillCredit } from "../lib/api";
import { addDays, CREDIT_PRESETS } from "../lib/credit";
import { todayISO } from "../lib/customer";
import { PAYMENT_METHODS, paymentMethodLabel } from "../lib/complaint";
import { formatDate } from "../lib/format";
import { formatINR, parseAmount, rupeesToPaise } from "../lib/money";
import { emptyPayment, validatePayment, type BillMoney, type PaymentDraft } from "../lib/payments";
import { errorMessage } from "../lib/supabase";
import type { BillPayment, PaymentMethod } from "../lib/types";
import BillCredit from "./BillCredit";
import ConfirmDialog from "./ConfirmDialog";
import { MoneyInput } from "./fields";

const inr = (rupees: number) => formatINR(rupeesToPaise(rupees));

/** The two ways customers usually pay, shown as big buttons; the rest are in "More". */
const QUICK: PaymentMethod[] = ["cash", "upi"];

/** Payments received on a bill after billing: the list, and a form to record one. Not printed. */
export default function BillPayments({
  billId,
  payments,
  money,
  credit,
}: {
  billId: string;
  payments: BillPayment[];
  money: BillMoney;
  credit?: { dueOn: string | null; note: string | null; remindedOn: string | null };
}) {
  useT();
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  /** A problem with what was typed (shown under the amount). */
  const [error, setError] = useState<string | null>(null);
  /** The save itself failed (server or connection): shown above the form. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<BillPayment | null>(null);
  const today = todayISO();
  /** When the rest is due if this payment leaves a balance (and the bill isn't on credit yet). */
  const [creditDue, setCreditDue] = useState(addDays(today, CREDIT_PRESETS[0]));
  const onCredit = !!credit?.dueOn;

  const open = () => {
    setNotice(null);
    setError(null);
    setSaveError(null);
    setDraft(emptyPayment(money.balance));
    setCreditDue(addDays(today, CREDIT_PRESETS[0]));
  };

  // What this payment leaves to pay, in rupees (0 when it pays everything or isn't a valid amount yet).
  const typed = draft ? parseAmount(draft.amount) : null;
  const left = typed && typed.ok && typed.paise > 0 ? Math.max(0, rupeesToPaise(money.balance) - typed.paise) / 100 : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft || saving) return;
    const { error: err, input } = validatePayment(draft, money.balance);
    if (!input) {
      setError(err);
      document.getElementById("f-payAmount")?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    setSaveError(null);
    try {
      await addBillPayment(billId, input);
      // A part payment puts the rest on credit (unless the bill already is).
      const rest = Math.max(0, rupeesToPaise(money.balance) - rupeesToPaise(input.amount)) / 100;
      if (rest > 0 && !onCredit) {
        await setBillCredit(billId, { due_on: creditDue });
        setNotice(
          t("payments.recordedCredit", {
            amount: inr(input.amount),
            method: paymentMethodLabel(input.method),
            balance: inr(rest),
            date: formatDate(creditDue),
          }),
        );
      } else {
        setNotice(t("payments.recorded", { amount: inr(input.amount), method: paymentMethodLabel(input.method) }));
      }
      setDraft(null);
    } catch (e2) {
      setSaveError(errorMessage(e2));
    } finally {
      setSaving(false);
    }
  }

  async function onRemove(p: BillPayment) {
    setRemoving(null);
    setNotice(null);
    setSaveError(null);
    try {
      await removeBillPayment(billId, p.id);
      setNotice(t("payments.removed", { amount: inr(p.amount) }));
    } catch (e2) {
      setSaveError(errorMessage(e2));
    }
  }

  const sorted = [...payments].sort((a, b) => (a.paid_on === b.paid_on ? a.created_at.localeCompare(b.created_at) : a.paid_on < b.paid_on ? -1 : 1));

  return (
    <section className="card bill-payments no-print" aria-labelledby="payments-title">
      <div className="card-head">
        <h2 id="payments-title">{t("payments.title")}</h2>
        {money.status === "paid" ? (
          <span className="badge badge-resolved">{t("payments.paidInFull")}</span>
        ) : (
          <span className="badge badge-open">{t("lists.balance", { amount: inr(money.balance) })}</span>
        )}
      </div>

      <dl className="pay-summary">
        <div>
          <dt>{t("payments.advance")}</dt>
          <dd>{inr(money.advance)}</dd>
        </div>
        <div>
          <dt>{t("payments.paidAfter")}</dt>
          <dd>{inr(money.paid)}</dd>
        </div>
        <div className="pay-balance">
          <dt>{t("payments.balanceToPay")}</dt>
          <dd>{inr(money.balance)}</dd>
        </div>
      </dl>
      {money.extra > 0 && <p className="hint">{t("payments.overpaid", { amount: inr(money.extra) })}</p>}
      {money.balance > 0 && credit && !draft && (
        <BillCredit billId={billId} dueOn={credit.dueOn} note={credit.note} remindedOn={credit.remindedOn} />
      )}

      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      {saveError && (
        <div className="alert alert-error" role="alert">
          {t("payments.saveFailed", { message: saveError })}
        </div>
      )}

      {sorted.length > 0 && (
        <ul className="pay-list">
          {sorted.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{inr(p.amount)}</strong> · {paymentMethodLabel(p.method)}
                <div className="muted pay-meta">
                  {formatDate(p.paid_on)}
                  {p.recorded_by_name && t("payments.recordedBy", { name: p.recorded_by_name })}
                  {p.note && ` · ${p.note}`}
                </div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setRemoving(p)}>
                {t("payments.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <form className="pay-form" onSubmit={onSubmit} noValidate>
          <div className="pay-methods" role="group" aria-label={t("payments.paidBy")}>
            {QUICK.map((m) => (
              <button
                key={m}
                type="button"
                className={`btn ${draft.method === m ? "btn-primary" : "btn-outline"}`}
                aria-pressed={draft.method === m}
                onClick={() => setDraft({ ...draft, method: m })}
              >
                {paymentMethodLabel(m)}
              </button>
            ))}
            <select
              aria-label={t("payments.otherWays")}
              value={QUICK.includes(draft.method) ? "" : draft.method}
              onChange={(e) => e.target.value && setDraft({ ...draft, method: e.target.value as PaymentMethod })}
            >
              <option value="">{t("payments.more")}</option>
              {PAYMENT_METHODS.filter((m) => !QUICK.includes(m.id)).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid">
            <div className={`field${error ? " has-error" : ""}`}>
              <label htmlFor="f-payAmount">{t("payments.amountReceived")}</label>
              <MoneyInput
                id="f-payAmount"
                invalid={!!error}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "f-payAmount-error" : undefined}
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                autoFocus
              />
              {error && (
                <p className="field-error" id="f-payAmount-error">
                  {error}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="f-payDate">{t("payments.datePaid")}</label>
              <input id="f-payDate" type="date" value={draft.paidOn} onChange={(e) => setDraft({ ...draft, paidOn: e.target.value })} />
            </div>
          </div>
          {left > 0 &&
            (onCredit ? (
              <p className="hint pay-credit">{t("payments.stayOnCredit", { amount: inr(left), date: formatDate(credit!.dueOn) })}</p>
            ) : (
              <div className="field pay-credit">
                <label htmlFor="f-payCreditDue">{t("payments.toCredit", { amount: inr(left) })}</label>
                <div className="credit-presets" role="group" aria-label={t("credit.dueBy")}>
                  {CREDIT_PRESETS.map((n) => {
                    const date = addDays(today, n);
                    return (
                      <button
                        key={n}
                        type="button"
                        className={`btn btn-sm ${creditDue === date ? "btn-primary" : "btn-outline"}`}
                        aria-pressed={creditDue === date}
                        onClick={() => setCreditDue(date)}
                      >
                        {tn("credit.inDays", n)}
                      </button>
                    );
                  })}
                </div>
                <input id="f-payCreditDue" type="date" min={today} value={creditDue} onChange={(e) => e.target.value && setCreditDue(e.target.value)} />
              </div>
            ))}
          <div className="field">
            <label htmlFor="f-payNote">
              {t("payments.note")} <span className="optional">{t("common.optional")}</span>
            </label>
            <input
              id="f-payNote"
              type="text"
              maxLength={200}
              placeholder={t("payments.notePlaceholder")}
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>
          <div className="pay-actions">
            <button type="button" className="btn btn-outline" onClick={() => setDraft(null)} disabled={saving}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t("common.saving") : t("payments.savePayment")}
            </button>
          </div>
        </form>
      ) : (
        money.balance > 0 && (
          <button type="button" className="btn btn-primary" onClick={open}>
            {t("payments.recordPayment")}
          </button>
        )
      )}

      {removing && (
        <ConfirmDialog
          title={t("payments.removeTitle")}
          message={t("payments.removeMessage", {
            amount: inr(removing.amount),
            method: paymentMethodLabel(removing.method),
            date: formatDate(removing.paid_on),
          })}
          confirmLabel={t("payments.remove")}
          cancelLabel={t("payments.keepIt")}
          onConfirm={() => void onRemove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  );
}
