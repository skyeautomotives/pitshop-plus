import { ISO_DATE, todayISO, validateCustomer, type CustomerFields } from "./customer";
import { t } from "../i18n";
import { paiseToDecimal, paiseToInput, parseAmount, rupeesToPaise, type ParsedAmount } from "./money";
import { cleanGstin, computeGst, DEFAULT_GST_RATE, GST_RATES, HSN_PATTERN, isGstin, type GstMode, type GstResult } from "./gst";
import type { BillWithItems } from "./types";

export { normalizeVehicleReg, todayISO } from "./customer";

export interface ItemDraft {
  key: string;
  description: string;
  /** How many; decimals allowed (e.g. 1.5 litres). */
  quantity: string;
  /** Price for one. */
  price: string;
  /** GST %, used on GST bills. */
  gstRate: string;
  /** Optional HSN code (GST bills). */
  hsn: string;
}

export interface OptionalService {
  selected: boolean;
  amount: string;
}

/** Optional discount, typed either as a rupee amount or as a % of the bill. */
export interface DiscountDraft {
  mode: "amount" | "percent";
  value: string;
}

/** The bill form's state, exactly as typed. */
export interface BillDraft extends CustomerFields {
  dateReceived: string;
  expectedPickup: string;
  /** Date the vehicle is handed back; defaults to the bill date. */
  deliveredOn: string;
  items: ItemDraft[];
  labour: string;
  painting: OptionalService;
  washing: OptionalService;
  discount: DiscountDraft;
  /** Complaints (for the same vehicle) this bill addresses. Optional. */
  complaintIds: string[];
  /** Null: no GST on this bill. Otherwise how the prices were typed. */
  gstMode: GstMode | null;
  customerGstin: string;
  /** GST % on labour, painting and washing. */
  serviceGstRate: string;
  /** A direct sale: no complaint step and no labour charge. */
  directSale?: boolean;
}

let keySeq = 0;
export function newItem(description = "", price = "", quantity = "1", gstRate = String(DEFAULT_GST_RATE), hsn = ""): ItemDraft {
  keySeq += 1;
  return { key: `i${Date.now().toString(36)}${keySeq}`, description, quantity, price, gstRate, hsn };
}

/** A GST rate as typed, or the default when it isn't one of the allowed rates. */
export function gstRate(raw: string): number {
  const n = Number(raw);
  return (GST_RATES as readonly number[]).includes(n) ? n : DEFAULT_GST_RATE;
}

export function emptyBill(): BillDraft {
  return {
    complaintIds: [],
    customerName: "",
    address: "",
    phone: "",
    vehicleReg: "",
    dateReceived: todayISO(),
    expectedPickup: "",
    deliveredOn: todayISO(),
    items: [newItem()],
    labour: "",
    painting: { selected: false, amount: "" },
    washing: { selected: false, amount: "" },
    discount: { mode: "amount", value: "" },
    gstMode: null,
    customerGstin: "",
    serviceGstRate: String(DEFAULT_GST_RATE),
  };
}

export function isBlankItem(item: ItemDraft): boolean {
  return item.description.trim() === "" && item.price.trim() === "";
}

export interface Totals {
  itemsSubtotal: number;
  labour: number;
  painting: number;
  washing: number;
  /** Before discount. */
  gross: number;
  discount: number;
  /** Set on GST bills. */
  gst: GstResult | null;
  grandTotal: number;
}

function paiseOrZero(raw: string): number {
  const p = parseAmount(raw);
  return p.ok ? p.paise : 0;
}

/** Discount in paise for a bill worth `gross` paise (0 when blank or not valid yet). */
export function discountPaise(discount: DiscountDraft, gross: number): number {
  const p = parseAmount(discount.value);
  if (!p.ok) return 0;
  // A percentage is typed like an amount: "10" -> 1000 "paise" = 10.00%.
  if (discount.mode === "percent") return p.paise > 10000 ? 0 : Math.round((gross * p.paise) / 10000);
  return p.paise;
}

/** Quantity in hundredths ("1.5" -> 150), or null if not a valid quantity above 0. */
export function parseQuantity(raw: string): number | null {
  const p = parseAmount(raw.trim() === "" ? "1" : raw);
  if (!p.ok || p.paise === 0 || p.paise > 9999_00) return null;
  return p.paise;
}

/** Line amount in paise: quantity x unit price, rounded to the paisa (same as the database). */
export function lineTotal(item: ItemDraft): number {
  const qty = parseQuantity(item.quantity) ?? 100;
  return Math.round((paiseOrZero(item.price) * qty) / 100);
}

/** Live totals in paise. Amounts that aren't valid yet count as 0. */
export function computeTotals(d: BillDraft): Totals {
  const itemsSubtotal = d.items.reduce((sum, item) => sum + lineTotal(item), 0);
  const labour = d.directSale ? 0 : paiseOrZero(d.labour);
  const painting = d.painting.selected ? paiseOrZero(d.painting.amount) : 0;
  const washing = d.washing.selected ? paiseOrZero(d.washing.amount) : 0;
  const gross = itemsSubtotal + labour + painting + washing;
  const discount = Math.min(discountPaise(d.discount, gross), gross);
  // Blank rows aren't saved, so they take no part in sharing out the discount.
  const gst = d.gstMode
    ? computeGst(
        d.items.filter((i) => !isBlankItem(i)).map((i) => ({ amount: lineTotal(i), rate: gstRate(i.gstRate) })),
        labour + painting + washing,
        gstRate(d.serviceGstRate),
        discount,
        d.gstMode,
      )
    : null;
  return { itemsSubtotal, labour, painting, washing, gross, discount, gst, grandTotal: gst ? gst.total : gross - discount };
}

/** What save_bill() expects. Amounts are decimal strings. */
export interface SaveBillPayload {
  bill: {
    customer_name: string;
    address: string;
    phone: string;
    vehicle_reg: string;
    date_received: string;
    expected_pickup: string | null;
    delivered_on: string;
    labour_charge: string;
    painting_charge: string | null;
    washing_charge: string | null;
    discount: string;
    discount_percent: string | null;
    /** GST (missing in changes queued by older versions). */
    gst_mode?: GstMode | null;
    customer_gstin?: string | null;
    service_gst_rate?: string | null;
    /** The workshop's GSTIN, for the copy kept on this device (the server uses its own). */
    gstin?: string | null;
    /** A direct sale may have no labour charge (missing in changes queued by older versions). */
    direct_sale?: boolean;
  };
  items: { description: string; quantity: string; price: string; gst_rate?: string | null; hsn?: string | null }[];
  complaintIds: string[];
}

/**
 * Error messages keyed by field. Item fields use `item-<key>-description` /
 * `item-<key>-price`. The form renders each field with id `f-<errorKey>`.
 */
export type BillErrors = Record<string, string>;

function amountMessage(p: ParsedAmount, label: string): string | null {
  if (p.ok) return null;
  if (p.reason === "empty") return t("validation.amountEmpty", { label });
  if (p.reason === "too-large") return t("validation.amountTooLarge", { label });
  return t("validation.amountNotNumber", { label });
}

/** Checks every field. Returns the payload only when there are no errors. */
export function validateBill(
  d: BillDraft,
  opts: { allowZeroLabour: boolean; gstin?: string | null },
): { errors: BillErrors; payload: SaveBillPayload | null } {
  const errors: BillErrors = {};
  const customer = validateCustomer(d, errors);

  if (!ISO_DATE.test(d.dateReceived)) errors.dateReceived = t("validation.dateReceived");
  if (!ISO_DATE.test(d.deliveredOn)) errors.deliveredOn = t("validation.deliveredOn");
  else if (ISO_DATE.test(d.dateReceived) && d.deliveredOn < d.dateReceived) errors.deliveredOn = t("validation.deliveryBeforeReceived");

  if (d.expectedPickup && !ISO_DATE.test(d.expectedPickup)) errors.expectedPickup = t("validation.pickupInvalid");
  else if (d.expectedPickup && ISO_DATE.test(d.dateReceived) && d.expectedPickup < d.dateReceived)
    errors.expectedPickup = t("validation.pickupBeforeReceived");

  const items: SaveBillPayload["items"] = [];
  for (const item of d.items) {
    if (isBlankItem(item)) continue;
    const description = item.description.trim();
    if (!description) errors[`item-${item.key}-description`] = t("validation.describeItem");
    else if (description.length > 200) errors[`item-${item.key}-description`] = t("validation.tooLong200");
    const qty = parseQuantity(item.quantity);
    if (qty === null) errors[`item-${item.key}-quantity`] = t("validation.quantity");
    const price = parseAmount(item.price);
    const priceError = amountMessage(price, t("validation.labelPrice"));
    if (priceError) errors[`item-${item.key}-price`] = priceError;
    const hsn = item.hsn.trim();
    if (d.gstMode && hsn && !HSN_PATTERN.test(hsn)) errors[`item-${item.key}-hsn`] = t("gst.hsnInvalid");
    if (description && price.ok && qty !== null)
      items.push({
        description,
        quantity: (qty / 100).toFixed(2),
        price: paiseToDecimal(price.paise),
        ...(d.gstMode ? { gst_rate: String(gstRate(item.gstRate)), hsn: hsn || null } : {}),
      });
  }
  if (d.gstMode && d.customerGstin.trim() && !isGstin(d.customerGstin)) errors.customerGstin = t("gst.gstinInvalid");

  // A direct sale has no labour charge.
  const sale = !!d.directSale;
  const labour = parseAmount(sale ? "0" : d.labour);
  const labourError = amountMessage(labour, t("validation.labelLabour"));
  if (labourError) errors.labour = labourError;
  else if (labour.ok && labour.paise === 0 && !opts.allowZeroLabour && !sale) errors.labour = t("validation.labourAboveZero");

  // Optional services: only checked when ticked, and then need an amount above ₹0.
  const optional = (service: OptionalService, field: "painting" | "washing"): string | null => {
    if (!service.selected) return null;
    const label = field === "painting" ? t("validation.labelPainting") : t("validation.labelWashing");
    const name = field === "painting" ? t("bill.painting") : t("bill.washing");
    const p = parseAmount(service.amount);
    const msg = p.ok ? (p.paise === 0 ? t("validation.amountAboveZero", { label }) : null) : amountMessage(p, label);
    if (msg) errors[field] = t("validation.orUntick", { message: msg, name });
    return p.ok ? paiseToDecimal(p.paise) : null;
  };
  const painting = optional(d.painting, "painting");
  const washing = optional(d.washing, "washing");

  // Discount: optional; checked against the bill total before discount.
  const totals = computeTotals(d);
  let discount = 0;
  let discountPercent: string | null = null;
  if (d.discount.value.trim()) {
    const p = parseAmount(d.discount.value);
    if (d.discount.mode === "percent") {
      if (!p.ok || p.paise === 0 || p.paise > 10000) errors.discount = t("validation.percent");
      else {
        discount = Math.round((totals.gross * p.paise) / 10000);
        discountPercent = (p.paise / 100).toFixed(2);
      }
    } else if (!p.ok) errors.discount = amountMessage(p, t("validation.labelDiscount")) ?? t("validation.discountMissing");
    else discount = p.paise;
    if (!errors.discount && discount > totals.gross) errors.discount = t("validation.discountTooBig");
  }

  if (Object.keys(errors).length > 0 || !labour.ok) return { errors, payload: null };

  return {
    errors,
    payload: {
      bill: {
        ...customer,
        date_received: d.dateReceived,
        expected_pickup: d.expectedPickup || null,
        delivered_on: d.deliveredOn,
        labour_charge: paiseToDecimal(labour.paise),
        painting_charge: painting,
        washing_charge: washing,
        discount: paiseToDecimal(discount),
        discount_percent: discount > 0 ? discountPercent : null,
        gst_mode: d.gstMode,
        customer_gstin: d.gstMode && d.customerGstin.trim() ? cleanGstin(d.customerGstin) : null,
        service_gst_rate: d.gstMode ? String(gstRate(d.serviceGstRate)) : null,
        gstin: d.gstMode ? (opts.gstin ?? null) : null,
        direct_sale: sale,
      },
      items,
      complaintIds: [...new Set(d.complaintIds)],
    },
  };
}

/** Turns a saved bill back into form state for editing. */
export function billToDraft(bill: BillWithItems): BillDraft {
  const items = [...bill.bill_items]
    .sort((a, b) => a.position - b.position)
    .map((i) =>
      newItem(
        i.description,
        paiseToInput(rupeesToPaise(i.price)),
        String(Number(i.quantity ?? 1)),
        String(i.gst_rate ?? DEFAULT_GST_RATE),
        i.hsn ?? "",
      ),
    );
  return {
    customerName: bill.customer_name,
    address: bill.address ?? "",
    phone: bill.phone,
    vehicleReg: bill.vehicle_reg,
    dateReceived: bill.date_received,
    expectedPickup: bill.expected_pickup ?? "",
    deliveredOn: bill.delivered_on,
    items: items.length > 0 ? items : [newItem()],
    labour: paiseToInput(rupeesToPaise(bill.labour_charge)),
    painting: {
      selected: bill.painting_charge !== null,
      amount: bill.painting_charge !== null ? paiseToInput(rupeesToPaise(bill.painting_charge)) : "",
    },
    washing: {
      selected: bill.washing_charge !== null,
      amount: bill.washing_charge !== null ? paiseToInput(rupeesToPaise(bill.washing_charge)) : "",
    },
    discount:
      bill.discount_percent !== null
        ? { mode: "percent", value: String(Number(bill.discount_percent)) }
        : { mode: "amount", value: Number(bill.discount) > 0 ? paiseToInput(rupeesToPaise(bill.discount)) : "" },
    complaintIds: (bill.complaints ?? []).map((c) => c.id),
    gstMode: bill.gst_mode ?? null,
    customerGstin: bill.customer_gstin ?? "",
    serviceGstRate: String(bill.service_gst_rate ?? DEFAULT_GST_RATE),
    directSale: bill.direct_sale ?? false,
  };
}
