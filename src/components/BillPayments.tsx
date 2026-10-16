import { useState, type FormEvent } from "react";
import { addBillPayment, removeBillPayment } from "../lib/api";
import { PAYMENT_METHODS, paymentMethodLabel } from "../lib/complaint";
import { formatDate } from "../lib/format";
import { formatINR, rupeesToPaise } from "../lib/money";
import { emptyPayment, validatePayment, type BillMoney, type PaymentDraft } from "../lib/payments";
import { errorMessage } from "../lib/supabase";
import type { BillPayment, PaymentMethod } from "../lib/types";
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
}: {
  billId: string;
  payments: BillPayment[];
  money: BillMoney;
}) {
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<BillPayment | null>(null);

  const open = () => {
    setNotice(null);
    setError(null);
    setDraft(emptyPayment(money.balance));
  };

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
    try {
      await addBillPayment(billId, input);
      setDraft(null);
      setNotice(`Recorded ${inr(input.amount)} by ${paymentMethodLabel(input.method)}.`);
    } catch (e2) {
      setError(errorMessage(e2));
    } finally {
      setSaving(false);
    }
  }

  async function onRemove(p: BillPayment) {
    setRemoving(null);
    setNotice(null);
    try {
      await removeBillPayment(billId, p.id);
      setNotice(`Removed the payment of ${inr(p.amount)}.`);
    } catch (e2) {
      setError(errorMessage(e2));
    }
  }

  const sorted = [...payments].sort((a, b) => (a.paid_on === b.paid_on ? a.created_at.localeCompare(b.created_at) : a.paid_on < b.paid_on ? -1 : 1));

  return (
    <section className="card bill-payments no-print" aria-labelledby="payments-title">
      <div className="card-head">
        <h2 id="payments-title">Payments</h2>
        {money.status === "paid" ? (
          <span className="badge badge-resolved">Paid in full</span>
        ) : (
          <span className="badge badge-open">Balance {inr(money.balance)}</span>
        )}
      </div>

      <dl className="pay-summary">
        <div>
          <dt>Advance (on the complaint)</dt>
          <dd>{inr(money.advance)}</dd>
        </div>
        <div>
          <dt>Paid after billing</dt>
          <dd>{inr(money.paid)}</dd>
        </div>
        <div className="pay-balance">
          <dt>Balance to pay</dt>
          <dd>{inr(money.balance)}</dd>
        </div>
      </dl>
      {money.extra > 0 && <p className="hint">The customer has paid {inr(money.extra)} more than the bill.</p>}

      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      {error && !draft && (
        <div className="alert alert-error" role="alert">
          {error}
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
                  {p.recorded_by_name && ` · recorded by ${p.recorded_by_name}`}
                  {p.note && ` · ${p.note}`}
                </div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setRemoving(p)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <form className="pay-form" onSubmit={onSubmit} noValidate>
          <div className="pay-methods" role="group" aria-label="Paid by">
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
              aria-label="Other ways to pay"
              value={QUICK.includes(draft.method) ? "" : draft.method}
              onChange={(e) => e.target.value && setDraft({ ...draft, method: e.target.value as PaymentMethod })}
            >
              <option value="">More…</option>
              {PAYMENT_METHODS.filter((m) => !QUICK.includes(m.id)).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid">
            <div className={`field${error ? " has-error" : ""}`}>
              <label htmlFor="f-payAmount">Amount received</label>
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
              <label htmlFor="f-payDate">Date paid</label>
              <input id="f-payDate" type="date" value={draft.paidOn} onChange={(e) => setDraft({ ...draft, paidOn: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="f-payNote">
              Note <span className="optional">(optional)</span>
            </label>
            <input
              id="f-payNote"
              type="text"
              maxLength={200}
              placeholder="e.g. UPI ref 4512, rest on delivery"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>
          <div className="pay-actions">
            <button type="button" className="btn btn-outline" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save payment"}
            </button>
          </div>
        </form>
      ) : (
        money.balance > 0 && (
          <button type="button" className="btn btn-primary" onClick={open}>
            Record payment
          </button>
        )
      )}

      {removing && (
        <ConfirmDialog
          title="Remove this payment?"
          message={`${inr(removing.amount)} by ${paymentMethodLabel(removing.method)} on ${formatDate(removing.paid_on)} will be removed from the bill, and the balance goes up.`}
          confirmLabel="Remove"
          cancelLabel="Keep it"
          onConfirm={() => void onRemove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  );
}
