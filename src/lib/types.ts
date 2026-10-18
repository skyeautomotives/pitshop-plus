import type { VehicleType } from "./vehicleType";
// Row shapes as returned by Supabase. Amounts are rupees (numeric(12,2)).

export interface BillRow {
  id: string;
  /** Null for a bill saved offline that hasn't synced yet (the server numbers it). */
  bill_number: number | null;
  customer_name: string;
  address: string | null;
  phone: string;
  vehicle_reg: string;
  date_received: string;
  expected_pickup: string | null;
  /** Date the vehicle was handed back (defaults to the bill date). */
  delivered_on: string;
  labour_charge: number;
  painting_charge: number | null;
  washing_charge: number | null;
  items_subtotal: number;
  /** Rupees taken off; grand_total is after it. */
  discount: number;
  /** Set when the discount was given as a percentage (for display). */
  discount_percent: number | null;
  grand_total: number;
  /** Payments received after billing (0020); missing on bills saved before it. */
  payments?: BillPayment[];
  created_at: string;
  updated_at: string;
  /** True while a change made on this device is waiting to be sent. */
  pending?: boolean;
}

export interface BillItemRow {
  id: string;
  bill_id: string;
  position: number;
  description: string;
  /** How many (default 1). */
  quantity: number;
  /** Price for one. */
  price: number;
  /** quantity x price. */
  line_total: number;
}

export type ComplaintStatus = "open" | "resolved";

export interface ComplaintRow {
  id: string;
  /** Null for a complaint recorded offline that hasn't synced yet. */
  complaint_number: number | null;
  customer_name: string;
  address: string | null;
  phone: string;
  vehicle_reg: string;
  vehicle_reg_key: string;
  description: string;
  reported_on: string;
  attended_by: string | null;
  /** The staff login that recorded the complaint (null for older complaints). */
  attended_by_user: string | null;
  notes: string | null;
  status: ComplaintStatus;
  /** Vehicle intake (0019). Optional: complaints saved before it have none. */
  vehicle_name?: string | null;
  /** Km driven, from the odometer. */
  odometer_km?: number | null;
  /** Helmets left with the vehicle (0-2). */
  helmets?: number | null;
  /** Papers left with the vehicle. */
  documents?: IntakeDocument[];
  /** Anything else left with the vehicle, as typed. */
  other_documents?: string[];
  /** Advance payment received, rupees. */
  advance_amount?: number | null;
  advance_method?: PaymentMethod | null;
  /** Ticked job card items (ids from lib/jobCard). */
  jobs?: string[];
  created_at: string;
  updated_at: string;
  /** True while a change made on this device is waiting to be sent. */
  pending?: boolean;
}

export type IntakeDocument = "rc" | "pollution" | "licence" | "insurance";

/** Money the customer paid on a bill after billing (0020). */
export interface BillPayment {
  id: string;
  /** Rupees. */
  amount: number;
  method: PaymentMethod;
  paid_on: string;
  note: string | null;
  recorded_by?: string | null;
  recorded_by_name?: string | null;
  created_at: string;
}
export type PaymentMethod = "cash" | "upi" | "card" | "bank" | "other";

/** A complaint as shown next to a bill. */
export type ComplaintSummary = Pick<
  ComplaintRow,
  "id" | "complaint_number" | "description" | "status" | "attended_by" | "reported_on" | "advance_amount"
> & {
  /** Ticked jobs and the written text, to show the complaint in another language (bills, WhatsApp). */
  jobs?: string[];
  note?: string;
  /** Shown on the bill. */
  vehicle_name?: string | null;
  odometer_km?: number | null;
};

/** A bill as shown next to a complaint. */
export type BillSummary = Pick<BillRow, "id" | "bill_number" | "date_received" | "grand_total">;

/** A bill with the complaints it addresses (from search and vehicle history). */
export interface BillWithComplaints extends BillRow {
  vehicle_reg_key: string;
  complaints: ComplaintSummary[];
}

/** A complaint with the bills that address it. */
export interface ComplaintWithBills extends ComplaintRow {
  bills: BillSummary[];
}

export interface BillWithItems extends BillRow {
  vehicle_reg_key: string;
  bill_items: BillItemRow[];
  complaints: ComplaintSummary[];
}

export type StaffRole = "owner" | "staff";

export interface StaffMember {
  user_id: string;
  /** Contact email, or the internal sign-in address for logins created with a username. */
  email: string;
  /** What they type to sign in. */
  username: string;
  full_name: string;
  role: StaffRole;
  created_at: string;
}

export interface ShopSettings {
  shop_name: string;
  address: string | null;
  phone: string | null;
  allow_zero_labour: boolean;
  /** Bike or car workshop; null until the owner chooses. */
  vehicle_type: VehicleType | null;
}
