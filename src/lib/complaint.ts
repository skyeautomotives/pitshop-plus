import { cleanMarks, type CarMark } from "./carMarks";
import { emptyCustomer, ISO_DATE, todayISO, validateCustomer, type CustomerFields, type FieldErrors } from "./customer";
import { t, type Lang } from "../i18n";
import { paiseToInput, parseAmount, rupeesToPaise } from "./money";
import type { ComplaintRow, ComplaintStatus, IntakeDocument, PaymentMethod } from "./types";

/** Papers a customer may leave with the vehicle, in the order shown on the form. */
export const INTAKE_DOCUMENTS: { id: IntakeDocument; readonly label: string }[] = [
  { id: "rc", get label() { return t("documents.rc"); } },
  { id: "pollution", get label() { return t("documents.pollution"); } },
  { id: "licence", get label() { return t("documents.licence"); } },
  { id: "insurance", get label() { return t("documents.insurance"); } },
];

export const PAYMENT_METHODS: { id: PaymentMethod; readonly label: string }[] = (["cash", "upi", "card", "bank", "other"] as const).map(
  (id) => ({ id, get label() { return t(`payment.${id}`); } }),
);

export const MAX_OTHER_DOCUMENTS = 10;

/**
 * The complaint form's state, exactly as typed. Who attended the customer is
 * not part of it: the database records the signed-in staff member.
 */
export interface ComplaintDraft extends CustomerFields {
  /** Ticked job card items. */
  jobs: string[];
  /** Other problems or comments (optional when jobs are ticked). */
  description: string;
  reportedOn: string;
  notes: string;
  status: ComplaintStatus;
  vehicleName: string;
  /** Km driven, as typed. */
  odometerKm: string;
  helmets: 0 | 1 | 2;
  /** Items left in the car that are ticked (cars). */
  belongings: string[];
  /** Other items left in the car, typed with commas between them. */
  otherBelongings: string;
  /** Scratches, dents and broken parts marked on the car diagram. */
  carMarks: CarMark[];
  documents: IntakeDocument[];
  /** "Other" ticked: show the boxes for other items. */
  otherDocumentsOn: boolean;
  otherDocuments: string[];
  /** Advance payment received, as typed (rupees). */
  advance: string;
  advanceMethod: PaymentMethod;
}

export function emptyComplaint(customer: Partial<CustomerFields> = {}): ComplaintDraft {
  return {
    ...emptyCustomer(),
    ...customer,
    jobs: [],
    description: "",
    reportedOn: todayISO(),
    notes: "",
    status: "open",
    vehicleName: "",
    odometerKm: "",
    helmets: 0,
    belongings: [],
    otherBelongings: "",
    carMarks: [],
    documents: [],
    otherDocumentsOn: false,
    otherDocuments: [""],
    advance: "",
    advanceMethod: "cash",
  };
}

export interface ComplaintPayload {
  jobs: string[];
  customer_name: string;
  address: string | null;
  phone: string;
  vehicle_reg: string;
  description: string;
  reported_on: string;
  notes: string | null;
  status: ComplaintStatus;
  vehicle_name: string | null;
  odometer_km: number | null;
  /** Null for car workshops, which don't take helmets. */
  helmets: number | null;
  belongings: string[];
  car_marks: CarMark[];
  documents: IntakeDocument[];
  other_documents: string[];
  /** Rupees, e.g. 500 or 499.5. */
  advance_amount: number | null;
  advance_method: PaymentMethod | null;
}

export function validateComplaint(d: ComplaintDraft, opts: { car?: boolean } = {}): { errors: FieldErrors; payload: ComplaintPayload | null } {
  const errors: FieldErrors = {};
  const customer = validateCustomer(d, errors);

  const description = d.description.trim();
  if (!description && d.jobs.length === 0) errors.description = t("complaint.describeOrTick");
  else if (description.length > 1000) errors.description = t("complaint.tooLong1000");

  if (!ISO_DATE.test(d.reportedOn)) errors.reportedOn = t("complaint.reportedDate");
  else if (d.reportedOn > todayISO()) errors.reportedOn = t("complaint.reportedFuture");

  const notes = d.notes.trim();
  if (notes.length > 1000) errors.notes = t("complaint.notesTooLong");

  const vehicleName = d.vehicleName.trim();
  if (vehicleName.length > 100) errors.vehicleName = t("complaint.tooLong100");

  const km = d.odometerKm.replace(/[,\s]/g, "");
  let odometerKm: number | null = null;
  if (km !== "") {
    if (!/^\d{1,7}$/.test(km)) errors.odometerKm = t("complaint.kmInvalid");
    else odometerKm = Number(km);
  }

  const otherDocuments = d.otherDocumentsOn ? d.otherDocuments.map((x) => x.trim()).filter(Boolean) : [];
  if (d.otherDocumentsOn) {
    if (otherDocuments.length === 0) errors.otherDocuments = t("complaint.otherMissing");
    else if (otherDocuments.some((x) => x.length > 60)) errors.otherDocuments = t("complaint.otherTooLong");
    else if (otherDocuments.length > MAX_OTHER_DOCUMENTS) errors.otherDocuments = t("complaint.otherTooMany", { n: MAX_OTHER_DOCUMENTS });
  }

  const belongings = [
    ...BELONGINGS.map((x) => x.id).filter((id) => d.belongings.includes(id)),
    ...d.otherBelongings.split(",").map((x) => x.trim()).filter(Boolean),
  ];
  if (belongings.length > MAX_BELONGINGS || belongings.some((x) => x.length > 60)) errors.otherBelongings = t("complaint.itemsInvalid");

  let advanceAmount: number | null = null;
  if (d.advance.trim() !== "") {
    const a = parseAmount(d.advance);
    if (!a.ok) errors.advance = a.reason === "too-large" ? t("complaint.advanceTooLarge") : t("complaint.advanceInvalid");
    else if (a.paise === 0) errors.advance = t("complaint.advanceZero");
    else advanceAmount = a.paise / 100;
  }

  if (Object.keys(errors).length > 0) return { errors, payload: null };
  return {
    errors,
    payload: {
      ...customer,
      address: customer.address || null,
      jobs: [...new Set(d.jobs)],
      description,
      reported_on: d.reportedOn,
      notes: notes || null,
      status: d.status,
      vehicle_name: vehicleName || null,
      odometer_km: odometerKm,
      helmets: opts.car ? null : d.helmets,
      belongings,
      car_marks: cleanMarks(d.carMarks),
      documents: INTAKE_DOCUMENTS.map((x) => x.id).filter((id) => d.documents.includes(id)),
      other_documents: otherDocuments,
      advance_amount: advanceAmount,
      advance_method: advanceAmount === null ? null : d.advanceMethod,
    },
  };
}

export function complaintToDraft(c: ComplaintRow): ComplaintDraft {
  const others = c.other_documents ?? [];
  const helmets = c.helmets ?? 0;
  return {
    customerName: c.customer_name,
    phone: c.phone,
    address: c.address ?? "",
    vehicleReg: c.vehicle_reg,
    jobs: c.jobs ?? [],
    description: c.description,
    reportedOn: c.reported_on,
    notes: c.notes ?? "",
    status: c.status,
    vehicleName: c.vehicle_name ?? "",
    odometerKm: c.odometer_km === null || c.odometer_km === undefined ? "" : String(c.odometer_km),
    helmets: helmets === 1 || helmets === 2 ? helmets : 0,
    belongings: (c.belongings ?? []).filter(isBelonging),
    otherBelongings: (c.belongings ?? []).filter((x) => !isBelonging(x)).join(", "),
    carMarks: cleanMarks(c.car_marks),
    documents: c.documents ?? [],
    otherDocumentsOn: others.length > 0,
    otherDocuments: others.length > 0 ? [...others] : [""],
    advance: c.advance_amount ? paiseToInput(rupeesToPaise(c.advance_amount)) : "",
    advanceMethod: c.advance_method ?? "cash",
  };
}

/** Items car workshops can tick as left in the car. */
export const BELONGINGS = [
  { id: "cooling_glass", get label() { return t("complaint.coolingGlass"); } },
  { id: "umbrella", get label() { return t("complaint.umbrella"); } },
];
const MAX_BELONGINGS = 10;
const isBelonging = (x: string) => BELONGINGS.some((b) => b.id === x);

/** "Cooling glass, Umbrella, Phone charger" for display; empty when nothing was left. */
export function belongingsText(c: Pick<ComplaintRow, "belongings">, lang?: Lang): string {
  const label = (x: string) => (x === "cooling_glass" ? t("complaint.coolingGlass", undefined, lang) : x === "umbrella" ? t("complaint.umbrella", undefined, lang) : x);
  return (c.belongings ?? []).map(label).join(", ");
}

/** "RC book, Pollution certificate, Spare key" for display; empty when nothing was left. */
export function documentsText(c: Pick<ComplaintRow, "documents" | "other_documents">, lang?: Lang): string {
  const short: Record<IntakeDocument, string> = {
    rc: t("documents.rcShort", undefined, lang),
    pollution: t("documents.pollution", undefined, lang),
    licence: t("documents.licence", undefined, lang),
    insurance: t("documents.insurance", undefined, lang),
  };
  return [...(c.documents ?? []).map((d) => short[d] ?? d), ...(c.other_documents ?? [])].join(", ");
}

export function paymentMethodLabel(m: PaymentMethod | null | undefined, lang?: Lang): string {
  return m && PAYMENT_METHODS.some((x) => x.id === m) ? t(`payment.${m}`, undefined, lang) : "";
}
