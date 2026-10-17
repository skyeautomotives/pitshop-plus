import { emptyCustomer, ISO_DATE, todayISO, validateCustomer, type CustomerFields, type FieldErrors } from "./customer";
import { paiseToInput, parseAmount, rupeesToPaise } from "./money";
import type { ComplaintRow, ComplaintStatus, IntakeDocument, PaymentMethod } from "./types";

/** Papers a customer may leave with the vehicle, in the order shown on the form. */
export const INTAKE_DOCUMENTS: { id: IntakeDocument; label: string }[] = [
  { id: "rc", label: "Registration certificate (RC book)" },
  { id: "pollution", label: "Pollution certificate" },
  { id: "licence", label: "Driving licence" },
  { id: "insurance", label: "Insurance" },
];

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card" },
  { id: "bank", label: "Bank transfer" },
  { id: "other", label: "Other" },
];

export const MAX_OTHER_DOCUMENTS = 10;

/**
 * The complaint form's state, exactly as typed. Who attended the customer is
 * not part of it: the database records the signed-in staff member.
 */
export interface ComplaintDraft extends CustomerFields {
  description: string;
  reportedOn: string;
  notes: string;
  status: ComplaintStatus;
  vehicleName: string;
  /** Km driven, as typed. */
  odometerKm: string;
  helmets: 0 | 1 | 2;
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
    description: "",
    reportedOn: todayISO(),
    notes: "",
    status: "open",
    vehicleName: "",
    odometerKm: "",
    helmets: 0,
    documents: [],
    otherDocumentsOn: false,
    otherDocuments: [""],
    advance: "",
    advanceMethod: "cash",
  };
}

export interface ComplaintPayload {
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
  helmets: number;
  documents: IntakeDocument[];
  other_documents: string[];
  /** Rupees, e.g. 500 or 499.5. */
  advance_amount: number | null;
  advance_method: PaymentMethod | null;
}

export function validateComplaint(d: ComplaintDraft): { errors: FieldErrors; payload: ComplaintPayload | null } {
  const errors: FieldErrors = {};
  const customer = validateCustomer(d, errors);

  const description = d.description.trim();
  if (!description) errors.description = "Describe the customer's complaint.";
  else if (description.length > 1000) errors.description = "Too long (1000 characters max).";

  if (!ISO_DATE.test(d.reportedOn)) errors.reportedOn = "Choose the date the complaint was reported.";
  else if (d.reportedOn > todayISO()) errors.reportedOn = "The reported date can't be in the future.";

  const notes = d.notes.trim();
  if (notes.length > 1000) errors.notes = "Notes are too long (1000 characters max).";

  const vehicleName = d.vehicleName.trim();
  if (vehicleName.length > 100) errors.vehicleName = "Too long (100 characters max).";

  const km = d.odometerKm.replace(/[,\s]/g, "");
  let odometerKm: number | null = null;
  if (km !== "") {
    if (!/^\d{1,7}$/.test(km)) errors.odometerKm = "Enter the km as a whole number, e.g. 12500.";
    else odometerKm = Number(km);
  }

  const otherDocuments = d.otherDocumentsOn ? d.otherDocuments.map((x) => x.trim()).filter(Boolean) : [];
  if (d.otherDocumentsOn) {
    if (otherDocuments.length === 0) errors.otherDocuments = "Type what was left, or untick Other.";
    else if (otherDocuments.some((x) => x.length > 60)) errors.otherDocuments = "Keep each item under 60 characters.";
    else if (otherDocuments.length > MAX_OTHER_DOCUMENTS) errors.otherDocuments = `Up to ${MAX_OTHER_DOCUMENTS} items.`;
  }

  let advanceAmount: number | null = null;
  if (d.advance.trim() !== "") {
    const a = parseAmount(d.advance);
    if (!a.ok) errors.advance = a.reason === "too-large" ? "That amount is too large." : "Enter the amount in rupees, e.g. 500.";
    else if (a.paise === 0) errors.advance = "Leave it empty if no advance was paid.";
    else advanceAmount = a.paise / 100;
  }

  if (Object.keys(errors).length > 0) return { errors, payload: null };
  return {
    errors,
    payload: {
      ...customer,
      address: customer.address || null,
      description,
      reported_on: d.reportedOn,
      notes: notes || null,
      status: d.status,
      vehicle_name: vehicleName || null,
      odometer_km: odometerKm,
      helmets: d.helmets,
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
    description: c.description,
    reportedOn: c.reported_on,
    notes: c.notes ?? "",
    status: c.status,
    vehicleName: c.vehicle_name ?? "",
    odometerKm: c.odometer_km === null || c.odometer_km === undefined ? "" : String(c.odometer_km),
    helmets: helmets === 1 || helmets === 2 ? helmets : 0,
    documents: c.documents ?? [],
    otherDocumentsOn: others.length > 0,
    otherDocuments: others.length > 0 ? [...others] : [""],
    advance: c.advance_amount ? paiseToInput(rupeesToPaise(c.advance_amount)) : "",
    advanceMethod: c.advance_method ?? "cash",
  };
}

/** "RC book, Pollution certificate, Spare key" for display; empty when nothing was left. */
export function documentsText(c: Pick<ComplaintRow, "documents" | "other_documents">): string {
  const short: Record<IntakeDocument, string> = {
    rc: "RC book",
    pollution: "Pollution certificate",
    licence: "Driving licence",
    insurance: "Insurance",
  };
  return [...(c.documents ?? []).map((d) => short[d] ?? d), ...(c.other_documents ?? [])].join(", ");
}

export function paymentMethodLabel(m: PaymentMethod | null | undefined): string {
  return PAYMENT_METHODS.find((x) => x.id === m)?.label ?? "";
}
