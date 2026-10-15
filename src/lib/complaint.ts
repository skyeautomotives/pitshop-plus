import { emptyCustomer, ISO_DATE, todayISO, validateCustomer, type CustomerFields, type FieldErrors } from "./customer";
import type { ComplaintRow, ComplaintStatus } from "./types";

/**
 * The complaint form's state, exactly as typed. Who attended the customer is
 * not part of it: the database records the signed-in staff member.
 */
export interface ComplaintDraft extends CustomerFields {
  description: string;
  reportedOn: string;
  notes: string;
  status: ComplaintStatus;
}

export function emptyComplaint(customer: Partial<CustomerFields> = {}): ComplaintDraft {
  return {
    ...emptyCustomer(),
    ...customer,
    description: "",
    reportedOn: todayISO(),
    notes: "",
    status: "open",
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
    },
  };
}

export function complaintToDraft(c: ComplaintRow): ComplaintDraft {
  return {
    customerName: c.customer_name,
    phone: c.phone,
    address: c.address ?? "",
    vehicleReg: c.vehicle_reg,
    description: c.description,
    reportedOn: c.reported_on,
    notes: c.notes ?? "",
    status: c.status,
  };
}
