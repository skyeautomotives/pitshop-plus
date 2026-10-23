import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useT } from "../i18n";
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
import { GST_RATES, halves, type GstMode } from "../lib/gst";
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
  /** A direct sale: no complaint step. */
  directSale?: boolean;
}

/** Error keys in the order the fields appear on screen, so we can focus the first problem. */
function firstErrorKey(errors: BillErrors, d: BillDraft): string | null {
  const order = [
    "vehicleReg",
    "customerName",
    "phone",
    "address",
    "customerGstin",
    "dateReceived",
    "expectedPickup",
    "deliveredOn",
    ...d.items.flatMap((i) => [`item-${i.key}-description`, `item-${i.key}-hsn`, `item-${i.key}-quantity`, `item-${i.key}-price`]),
    "labour",
    "painting",
    "washing",
    "discount",
  ];
  return order.find((k) => errors[k]) ?? null;
}

export default function BillForm({ initial, title, billId, onChange, onSaved, banner, directSale = false }: Props) {
  const navigate = useNavigate();
  const { settings } = useShopSettings();
  const { t, tn } = useT();
  const allowZeroLabour = settings?.allow_zero_labour ?? false;
  const gstin = settings?.gstin ?? null;

  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== baseline;
  const totals = computeTotals(draft);
  const errors = useMemo(() => validateBill(draft, { allowZeroLabour, gstin }).errors, [draft, allowZeroLabour, gstin]);
  const showGst = Boolean(settings?.gst_enabled) || draft.gstMode !== null;

  // A new bill in a GST workshop starts with the workshop's usual GST choice.
  const gstDefault: GstMode | null = settings?.gst_enabled ? (settings.gst_inclusive ? "inclusive" : "exclusive") : null;
  useEffect(() => {
    if (billId || !gstDefault || draft.gstMode !== null || JSON.stringify(draft) !== baseline) return;
    const next = { ...draft, gstMode: gstDefault };
    setDraft(next);
    setBaseline(JSON.stringify(next));
  }, [billId, gstDefault, draft, baseline]);
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
    billId ? t("bill.unsavedEdit") : t("bill.unsavedNew"),
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
    const { errors: errs, payload } = validateBill(draft, { allowZeroLabour, gstin });
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
      {directSale && <p className="hint">{t("billView.directSaleHint")}</p>}
      {banner}
      {errorCount > 0 && (
        <div className="alert alert-error" role="alert">
          {tn("form.fixFields", errorCount)}
        </div>
      )}
      {saveError && (
        <div className="alert alert-error" role="alert">
          {t("bill.saveFailed", { message: saveError })}
        </div>
      )}

      <div className="bill-cols">
      <div className="bill-main">
      <section className="card">
        <h2>{t("form.customerVehicle")}</h2>
        <div className="grid">
          <CustomerInputs value={draft} errors={shown} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
          <div className="grid-2 bill-dates">
            <Field fieldKey="dateReceived" label={t("bill.dateReceived")} required error={shown.dateReceived}>
              <input
                {...fieldProps("dateReceived", shown.dateReceived)}
                type="date"
                value={draft.dateReceived}
                onChange={(e) => set("dateReceived", e.target.value)}
              />
            </Field>
            <Field fieldKey="deliveredOn" label={t("bill.deliveredOn")} required error={shown.deliveredOn}>
              <input
                {...fieldProps("deliveredOn", shown.deliveredOn)}
                type="date"
                min={draft.dateReceived || undefined}
                value={draft.deliveredOn}
                onChange={(e) => set("deliveredOn", e.target.value)}
              />
            </Field>
            <Field fieldKey="expectedPickup" label={t("bill.expectedPickup")} error={shown.expectedPickup}>
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

      {!directSale && (
        <ComplaintPicker
          customer={draft}
          selected={draft.complaintIds}
          onChange={(ids) => set("complaintIds", ids)}
          billId={billId}
          onUseVehicle={(reg) => set("vehicleReg", reg)}
        />
      )}

      <section className="card">
        <h2>{t("bill.partsWork")}</h2>
        <p className="hint">{t("bill.partsHint")}</p>
        <div className="items-head" aria-hidden="true">
          <span>{t("bill.itemOrService")}</span>
          <span>{t("bill.qty")}</span>
          <span>{t("bill.priceEach")}</span>
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
                    {t("bill.itemDescription", { n: index + 1 })}
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
                  {draft.gstMode && (
                    <div className="item-gst">
                      <label>
                        <span>{t("gst.rate")}</span>
                        <select
                          aria-label={`${t("gst.rate")} ${index + 1}`}
                          value={item.gstRate}
                          onChange={(e) => setItem(item.key, { gstRate: e.target.value })}
                        >
                          {GST_RATES.map((r) => (
                            <option key={r} value={String(r)}>
                              {r}%
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>{t("gst.hsn")}</span>
                        <input
                          {...fieldProps(`item-${item.key}-hsn`, shown[`item-${item.key}-hsn`])}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={8}
                          className="hsn-input"
                          placeholder={t("common.optional")}
                          value={item.hsn}
                          onChange={(e) => setItem(item.key, { hsn: e.target.value.replace(/[^0-9]/g, "") })}
                        />
                      </label>
                      <FieldError fieldKey={`item-${item.key}-hsn`} error={shown[`item-${item.key}-hsn`]} />
                    </div>
                  )}
                </div>
                <div className="item-qty">
                  <label className="sr-only" htmlFor={`f-${qtyKey}`}>
                    {t("bill.itemQuantity", { n: index + 1 })}
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
                    {t("bill.itemPrice", { n: index + 1 })}
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
                  aria-label={t("bill.removeItemN", { n: index + 1 })}
                  title={t("bill.removeItem")}
                  onClick={() => removeItem(item.key)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="btn btn-secondary" onClick={addItem}>
          {t("bill.addItem")}
        </button>
      </section>
      </div>

      <aside className="bill-side">
      {showGst && (
        <section className="card gst-card">
          <h2>{t("gst.billGst")}</h2>
          <div className="segmented segmented-sm gst-mode" role="group" aria-label={t("gst.billGst")}>
            {([null, "exclusive", "inclusive"] as const).map((mode) => (
              <button key={mode ?? "none"} type="button" aria-pressed={draft.gstMode === mode} onClick={() => set("gstMode", mode)}>
                {mode === null ? t("gst.noGst") : mode === "exclusive" ? t("gst.beforeGst") : t("gst.includingGst")}
              </button>
            ))}
          </div>
          {draft.gstMode && (
            <Field fieldKey="customerGstin" label={t("gst.customerGstin")} error={shown.customerGstin} hint={t("gst.customerGstinHint")}>
              <input
                {...fieldProps("customerGstin", shown.customerGstin)}
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={15}
                className="gstin-input"
                value={draft.customerGstin}
                onChange={(e) => set("customerGstin", e.target.value.toUpperCase())}
              />
            </Field>
          )}
        </section>
      )}
      <section className="card">
        <h2>{t("bill.charges")}</h2>
        <Field
          fieldKey="labour"
          label={t("bill.labourCharge")}
          required
          error={shown.labour}
          hint={allowZeroLabour ? t("bill.labourZeroHint") : undefined}
        >
          <MoneyInput
            {...fieldProps("labour", shown.labour)}
            invalid={Boolean(shown.labour)}
            className="money-short"
            value={draft.labour}
            onChange={(e) => set("labour", e.target.value)}
          />
        </Field>
        {draft.gstMode && (
          <div className="field gst-service">
            <label htmlFor="f-serviceGstRate">{t("gst.serviceRate")}</label>
            <select id="f-serviceGstRate" value={draft.serviceGstRate} onChange={(e) => set("serviceGstRate", e.target.value)}>
              {GST_RATES.map((r) => (
                <option key={r} value={String(r)}>
                  {r}%
                </option>
              ))}
            </select>
          </div>
        )}

        {(["painting", "washing"] as const).map((field) => {
          const service = draft[field];
          const name = field === "painting" ? t("bill.painting") : t("bill.washing");
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
                  <label htmlFor={`f-${field}`}>{field === "painting" ? t("bill.paintingCharge") : t("bill.washingCharge")}</label>
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
            <label htmlFor="f-discount">{t("bill.discount")}</label>
            <div className="segmented segmented-sm" role="group" aria-label={t("bill.discountType")}>
              <button
                type="button"
                aria-pressed={draft.discount.mode === "amount"}
                onClick={() => set("discount", { ...draft.discount, mode: "amount" })}
              >
                {t("bill.discountAmount")}
              </button>
              <button
                type="button"
                aria-pressed={draft.discount.mode === "percent"}
                onClick={() => set("discount", { ...draft.discount, mode: "percent" })}
              >
                {t("bill.discountPercent")}
              </button>
            </div>
          </div>
          {draft.discount.mode === "amount" ? (
            <MoneyInput
              {...fieldProps("discount", shown.discount)}
              invalid={Boolean(shown.discount)}
              className="money-short"
              placeholder={t("bill.optionalZero")}
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
                placeholder={t("bill.optionalZero")}
                value={draft.discount.value}
                onChange={(e) => set("discount", { ...draft.discount, value: e.target.value })}
              />
              <span aria-hidden="true" className="suffix">%</span>
            </div>
          )}
          {draft.discount.mode === "percent" && totals.discount > 0 && (
            <p className="hint">{t("bill.amountOff", { amount: formatINR(totals.discount) })}</p>
          )}
          <FieldError fieldKey="discount" error={shown.discount} />
        </div>
      </section>

      <section className="card totals" aria-label={t("bill.billTotal")}>
        <h2>{t("bill.billTotal")}</h2>
        <dl>
          <div>
            <dt>{tn("bill.itemsSubtotal", filledItems)}</dt>
            <dd>{formatINR(totals.itemsSubtotal)}</dd>
          </div>
          <div>
            <dt>{t("bill.labourCharge")}</dt>
            <dd>{formatINR(totals.labour)}</dd>
          </div>
          {draft.painting.selected && (
            <div>
              <dt>{t("bill.painting")}</dt>
              <dd>{formatINR(totals.painting)}</dd>
            </div>
          )}
          {draft.washing.selected && (
            <div>
              <dt>{t("bill.washing")}</dt>
              <dd>{formatINR(totals.washing)}</dd>
            </div>
          )}
          {totals.discount > 0 && (
            <div className="discount-row">
              <dt>
                {t("bill.discount")}
                {draft.discount.mode === "percent" ? ` (${draft.discount.value.trim()}%)` : ""}
              </dt>
              <dd>−{formatINR(totals.discount)}</dd>
            </div>
          )}
          {totals.gst && (
            <>
              <div>
                <dt>{t("gst.taxable")}</dt>
                <dd>{formatINR(totals.gst.taxable)}</dd>
              </div>
              <div>
                <dt>{t("gst.cgst")}</dt>
                <dd>{formatINR(halves(totals.gst.gst).cgst)}</dd>
              </div>
              <div>
                <dt>{t("gst.sgst")}</dt>
                <dd>{formatINR(halves(totals.gst.gst).sgst)}</dd>
              </div>
            </>
          )}
          <div className="grand">
            <dt>{t("bill.grandTotal")}</dt>
            <dd>{formatINR(totals.grandTotal)}</dd>
          </div>
        </dl>
      </section>
      </aside>
      </div>

      <div className="savebar">
        <div className="savebar-total" aria-hidden="true">
          <span>{t("bill.total")}</span>
          <strong>{formatINR(totals.grandTotal)}</strong>
        </div>
        <div className="savebar-actions">
          {billId && (
            <Link to={`/bills/${billId}`} className="btn btn-outline">
              {t("common.cancel")}
            </Link>
          )}
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? t("common.saving") : billId ? t("bill.saveChanges") : t("bill.saveBill")}
          </button>
        </div>
      </div>

      {guard.dialog}
    </form>
  );
}
