import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { saveBill } from "../lib/api";
import {
  computeTotals,
  isBlankItem,
  lineTotal,
  parseQuantity,
  newItem,
  validateBill,
  type BillDraft,
  type BillErrors,
  type ItemDraft,
  type OptionalService,
} from "../lib/bill";
import { formatINR } from "../lib/money";
import { useShopSettings } from "../lib/shopSettings";
import { errorMessage } from "../lib/supabase";
import { useUnsavedGuard } from "../lib/useUnsavedGuard";
import { vehicleExamples } from "../lib/vehicleType";
import ComplaintPicker from "./ComplaintPicker";
import { Field, FieldError, MoneyInput, fieldProps } from "./fields";
import CustomerInputs from "./CustomerInputs";

interface Props {
  initial: BillDraft;
  title: string;
  /** Set when editing a saved bill. */
  billId?: string;
  /** Called on every change (used to keep a draft of new bills on this device). */
  onChange?: (draft: BillDraft) => void;
  /** Called after a successful save, before leaving the form. */
  onSaved?: () => void;
  banner?: ReactNode;
}

/** Error keys in the order the fields appear on screen, so we can focus the first problem. */
function firstErrorKey(errors: BillErrors, d: BillDraft): string | null {
  const order = [
    "vehicleReg",
    "customerName",
    "phone",
    "address",
    "dateReceived",
    "expectedPickup",
    "deliveredOn",
    ...d.items.flatMap((i) => [`item-${i.key}-description`, `item-${i.key}-quantity`, `item-${i.key}-price`]),
    "labour",
    "painting",
    "washing",
    "discount",
  ];
  return order.find((k) => errors[k]) ?? null;
}

export default function BillForm({ initial, title, billId, onChange, onSaved, banner }: Props) {
  const navigate = useNavigate();
  const { settings } = useShopSettings();
  const allowZeroLabour = settings?.allow_zero_labour ?? false;

  const [draft, setDraft] = useState(initial);
  const [baseline] = useState(() => JSON.stringify(initial));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== baseline;
  const totals = computeTotals(draft);
  const errors = useMemo(() => validateBill(draft, { allowZeroLabour }).errors, [draft, allowZeroLabour]);
  // Errors appear after the first save attempt, then update live as fields are fixed.
  const shown: BillErrors = submitted ? errors : {};
  const errorCount = Object.keys(shown).length;

  useEffect(() => {
    onChange?.(draft);
  }, [draft, onChange]);

  useEffect(() => {
    if (!focusKey) return;
    document.getElementById(`f-${focusKey}`)?.focus();
    setFocusKey(null);
  }, [focusKey]);

  const guard = useUnsavedGuard(
    dirty,
    billId
      ? "Your changes to this bill have not been saved and will be lost."
      : "This bill has not been saved yet. It will be kept as a draft on this device until you come back to New bill.",
  );

  function set<K extends keyof BillDraft>(key: K, value: BillDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setItem(key: string, patch: Partial<ItemDraft>) {
    setDraft((d) => ({ ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
  }

  function addItem() {
    const item = newItem();
    setDraft((d) => ({ ...d, items: [...d.items, item] }));
    setFocusKey(`item-${item.key}-description`);
  }

  function removeItem(key: string) {
    setDraft((d) => {
      const items = d.items.filter((i) => i.key !== key);
      return { ...d, items: items.length > 0 ? items : [newItem()] };
    });
  }

  function onPriceKeyDown(e: KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = draft.items[index + 1];
    if (next) setFocusKey(`item-${next.key}-description`);
    else addItem();
  }

  function setService(field: "painting" | "washing", patch: Partial<OptionalService>) {
    setDraft((d) => ({ ...d, [field]: { ...d[field], ...patch } }));
    if (patch.selected) setFocusKey(field);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setSaveError(null);
    const { errors: errs, payload } = validateBill(draft, { allowZeroLabour });
    if (!payload) {
      setFocusKey(firstErrorKey(errs, draft));
      return;
    }
    setSaving(true);
    try {
      const id = await saveBill(payload, billId);
      guard.allowLeave();
      onSaved?.();
      navigate(`/bills/${id}`, { state: { saved: true } });
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  }

  const filledItems = draft.items.filter((i) => !isBlankItem(i)).length;

  return (
    <form className="bill-form" onSubmit={onSubmit} noValidate>
      <h1>{title}</h1>
      {banner}
      {errorCount > 0 && (
        <div className="alert alert-error" role="alert">
          Please fix the {errorCount === 1 ? "highlighted field" : `${errorCount} highlighted fields`} below.
        </div>
      )}
      {saveError && (
        <div className="alert alert-error" role="alert">
          Couldn't save the bill. {saveError}
        </div>
      )}

      <div className="bill-cols">
      <div className="bill-main">
      <section className="card">
        <h2>Customer & vehicle</h2>
        <div className="grid">
          <CustomerInputs value={draft} errors={shown} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
          <div className="grid-2 bill-dates">
            <Field fieldKey="dateReceived" label="Date received" required error={shown.dateReceived}>
              <input
                {...fieldProps("dateReceived", shown.dateReceived)}
                type="date"
                value={draft.dateReceived}
                onChange={(e) => set("dateReceived", e.target.value)}
              />
            </Field>
            <Field fieldKey="deliveredOn" label="Delivered on" required error={shown.deliveredOn}>
              <input
                {...fieldProps("deliveredOn", shown.deliveredOn)}
                type="date"
                min={draft.dateReceived || undefined}
                value={draft.deliveredOn}
                onChange={(e) => set("deliveredOn", e.target.value)}
              />
            </Field>
            <Field fieldKey="expectedPickup" label="Expected pickup" error={shown.expectedPickup}>
              <input
                {...fieldProps("expectedPickup", shown.expectedPickup)}
                type="date"
                min={draft.dateReceived || undefined}
                value={draft.expectedPickup}
                onChange={(e) => set("expectedPickup", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </section>

      <ComplaintPicker
        customer={draft}
        selected={draft.complaintIds}
        onChange={(ids) => set("complaintIds", ids)}
        billId={billId}
        onUseVehicle={(reg) => set("vehicleReg", reg)}
      />

      <section className="card">
        <h2>Parts & work done</h2>
        <p className="hint">Add every part replaced and every job done. Empty rows are ignored.</p>
        <div className="items-head" aria-hidden="true">
          <span>Item or service</span>
          <span>Qty</span>
          <span>Price (each)</span>
        </div>
        <ol className="items">
          {draft.items.map((item, index) => {
            const descKey = `item-${item.key}-description`;
            const priceKey = `item-${item.key}-price`;
            const qtyKey = `item-${item.key}-quantity`;
            const qty = parseQuantity(item.quantity);
            return (
              <li key={item.key} className="item-row">
                <span className="item-no" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="item-desc">
                  <label className="sr-only" htmlFor={`f-${descKey}`}>
                    Item {index + 1} description
                  </label>
                  <input
                    {...fieldProps(descKey, shown[descKey])}
                    type="text"
                    autoComplete="off"
                    placeholder={vehicleExamples(settings?.vehicle_type).billItem}
                    value={item.description}
                    onChange={(e) => setItem(item.key, { description: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setFocusKey(qtyKey);
                      }
                    }}
                  />
                  <FieldError fieldKey={descKey} error={shown[descKey]} />
                </div>
                <div className="item-qty">
                  <label className="sr-only" htmlFor={`f-${qtyKey}`}>
                    Item {index + 1} quantity
                  </label>
                  <input
                    {...fieldProps(qtyKey, shown[qtyKey])}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className="qty-input"
                    value={item.quantity}
                    onChange={(e) => setItem(item.key, { quantity: e.target.value })}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setFocusKey(priceKey);
                      }
                    }}
                  />
                  <FieldError fieldKey={qtyKey} error={shown[qtyKey]} />
                </div>
                <div className="item-price">
                  <label className="sr-only" htmlFor={`f-${priceKey}`}>
                    Item {index + 1} price
                  </label>
                  <MoneyInput
                    {...fieldProps(priceKey, shown[priceKey])}
                    invalid={Boolean(shown[priceKey])}
                    value={item.price}
                    onChange={(e) => setItem(item.key, { price: e.target.value })}
                    onKeyDown={(e) => onPriceKeyDown(e, index)}
                  />
                  <FieldError fieldKey={priceKey} error={shown[priceKey]} />
                  {qty !== null && qty !== 100 && item.price.trim() !== "" && (
                    <p className="line-total">= {formatINR(lineTotal(item))}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove item ${index + 1}`}
                  title="Remove item"
                  onClick={() => removeItem(item.key)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="btn btn-secondary" onClick={addItem}>
          + Add item
        </button>
      </section>
      </div>

      <aside className="bill-side">
      <section className="card">
        <h2>Charges</h2>
        <Field
          fieldKey="labour"
          label="Labour charge"
          required
          error={shown.labour}
          hint={allowZeroLabour ? "Enter 0 if there is no labour charge." : undefined}
        >
          <MoneyInput
            {...fieldProps("labour", shown.labour)}
            invalid={Boolean(shown.labour)}
            className="money-short"
            value={draft.labour}
            onChange={(e) => set("labour", e.target.value)}
          />
        </Field>

        {(["painting", "washing"] as const).map((field) => {
          const service = draft[field];
          const name = field === "painting" ? "Painting" : "Washing";
          return (
            <div key={field} className="service">
              <label className="check">
                <input
                  type="checkbox"
                  checked={service.selected}
                  onChange={(e) => setService(field, { selected: e.target.checked })}
                />
                {name}
              </label>
              {service.selected && (
                <div className={`field${shown[field] ? " has-error" : ""}`}>
                  <label htmlFor={`f-${field}`}>{name} charge</label>
                  <MoneyInput
                    {...fieldProps(field, shown[field])}
                    invalid={Boolean(shown[field])}
                    className="money-short"
                    value={service.amount}
                    onChange={(e) => setService(field, { amount: e.target.value })}
                  />
                  <FieldError fieldKey={field} error={shown[field]} />
                </div>
              )}
            </div>
          );
        })}
        <div className={`service discount${shown.discount ? " has-error" : ""}`}>
          <div className="discount-head">
            <label htmlFor="f-discount">Discount</label>
            <div className="segmented segmented-sm" role="group" aria-label="Discount type">
              <button
                type="button"
                aria-pressed={draft.discount.mode === "amount"}
                onClick={() => set("discount", { ...draft.discount, mode: "amount" })}
              >
                ₹ Amount
              </button>
              <button
                type="button"
                aria-pressed={draft.discount.mode === "percent"}
                onClick={() => set("discount", { ...draft.discount, mode: "percent" })}
              >
                % of bill
              </button>
            </div>
          </div>
          {draft.discount.mode === "amount" ? (
            <MoneyInput
              {...fieldProps("discount", shown.discount)}
              invalid={Boolean(shown.discount)}
              className="money-short"
              placeholder="0 (optional)"
              value={draft.discount.value}
              onChange={(e) => set("discount", { ...draft.discount, value: e.target.value })}
            />
          ) : (
            <div className={`money-input money-short${shown.discount ? " invalid" : ""}`}>
              <input
                {...fieldProps("discount", shown.discount)}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0 (optional)"
                value={draft.discount.value}
                onChange={(e) => set("discount", { ...draft.discount, value: e.target.value })}
              />
              <span aria-hidden="true" className="suffix">%</span>
            </div>
          )}
          {draft.discount.mode === "percent" && totals.discount > 0 && (
            <p className="hint">= {formatINR(totals.discount)} off</p>
          )}
          <FieldError fieldKey="discount" error={shown.discount} />
        </div>
      </section>

      <section className="card totals" aria-label="Bill total">
        <h2>Bill total</h2>
        <dl>
          <div>
            <dt>
              Items subtotal ({filledItems} {filledItems === 1 ? "item" : "items"})
            </dt>
            <dd>{formatINR(totals.itemsSubtotal)}</dd>
          </div>
          <div>
            <dt>Labour charge</dt>
            <dd>{formatINR(totals.labour)}</dd>
          </div>
          {draft.painting.selected && (
            <div>
              <dt>Painting</dt>
              <dd>{formatINR(totals.painting)}</dd>
            </div>
          )}
          {draft.washing.selected && (
            <div>
              <dt>Washing</dt>
              <dd>{formatINR(totals.washing)}</dd>
            </div>
          )}
          {totals.discount > 0 && (
            <div className="discount-row">
              <dt>
                Discount
                {draft.discount.mode === "percent" ? ` (${draft.discount.value.trim()}%)` : ""}
              </dt>
              <dd>−{formatINR(totals.discount)}</dd>
            </div>
          )}
          <div className="grand">
            <dt>Grand total</dt>
            <dd>{formatINR(totals.grandTotal)}</dd>
          </div>
        </dl>
      </section>
      </aside>
      </div>

      <div className="savebar">
        <div className="savebar-total" aria-hidden="true">
          <span>Total</span>
          <strong>{formatINR(totals.grandTotal)}</strong>
        </div>
        <div className="savebar-actions">
          {billId && (
            <Link to={`/bills/${billId}`} className="btn btn-outline">
              Cancel
            </Link>
          )}
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? "Saving…" : billId ? "Save changes" : "Save bill"}
          </button>
        </div>
      </div>

      {guard.dialog}
    </form>
  );
}
