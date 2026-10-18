import { t } from "../i18n";
// Customer and vehicle details shared by bills and complaints.

export interface CustomerFields {
  customerName: string;
  phone: string;
  address: string;
  vehicleReg: string;
}

export function emptyCustomer(): CustomerFields {
  return { customerName: "", phone: "", address: "", vehicleReg: "" };
}

export function normalizeVehicleReg(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

/** The key used to match bills and complaints for the same vehicle: "ka-01 ab 1234" -> "KA01AB1234". */
export function vehicleKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Vehicle keys need at least 4 letters/digits to be worth looking up. */
export function isLookupKey(key: string): boolean {
  return key.length >= 4;
}

export type FieldErrors = Record<string, string>;

/** Validates customer/vehicle fields into `errors`; returns the cleaned values. */
export function validateCustomer(d: CustomerFields, errors: FieldErrors) {
  const name = d.customerName.trim();
  if (!name) errors.customerName = t("customer.nameMissing");
  else if (name.length > 100) errors.customerName = t("customer.nameTooLong");

  if (d.address.trim().length > 300) errors.address = t("customer.addressTooLong");

  const phoneDigits = d.phone.replace(/\D/g, "");
  if (!d.phone.trim()) errors.phone = t("customer.phoneMissing");
  else if (!/^[+\d\s()-]+$/.test(d.phone.trim()) || phoneDigits.length < 10 || phoneDigits.length > 13)
    errors.phone = t("customer.phoneInvalid");

  const reg = normalizeVehicleReg(d.vehicleReg);
  const regChars = reg.replace(/[^A-Z0-9]/g, "");
  if (!reg) errors.vehicleReg = t("customer.regMissing");
  else if (!/^[A-Z0-9 -]+$/.test(reg) || regChars.length < 4 || reg.length > 20)
    errors.vehicleReg = t("customer.regInvalid");

  return {
    customer_name: name,
    address: d.address.trim(),
    phone: d.phone.trim(),
    vehicle_reg: reg,
  };
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in the browser's time zone, as yyyy-mm-dd. */
export function todayISO(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
