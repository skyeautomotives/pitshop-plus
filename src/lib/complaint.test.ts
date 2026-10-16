import { describe, expect, it } from "vitest";
import { advanceAndBalance, complaintToDraft, documentsText, emptyComplaint, validateComplaint, type ComplaintDraft } from "./complaint";
import { vehicleKey } from "./customer";
import { buildHistory, filterHistory, historyCounts } from "./history";
import type { BillWithComplaints, ComplaintWithBills } from "./types";

function filled(overrides: Partial<ComplaintDraft> = {}): ComplaintDraft {
  return {
    ...emptyComplaint(),
    customerName: "Thomas",
    phone: "97440 60485",
    vehicleReg: "kl 39 w 0890",
    description: "Brake noise when stopping",
    reportedOn: "2026-10-14",
    ...overrides,
  };
}

describe("validateComplaint", () => {
  it("builds the payload; notes are optional and who attended is left to the database", () => {
    const { errors, payload } = validateComplaint(filled({ notes: "" }));
    expect(errors).toEqual({});
    expect(payload).toEqual({
      customer_name: "Thomas",
      address: null,
      phone: "97440 60485",
      vehicle_reg: "KL 39 W 0890",
      description: "Brake noise when stopping",
      reported_on: "2026-10-14",
      notes: null,
      status: "open",
      vehicle_name: null,
      odometer_km: null,
      helmets: 0,
      documents: [],
      other_documents: [],
      advance_amount: null,
      advance_method: null,
    });
  });

  it("saves vehicle intake details and the advance", () => {
    const { errors, payload } = validateComplaint(
      filled({
        vehicleName: "  Honda Activa 6G ",
        odometerKm: "12,500",
        helmets: 2,
        documents: ["licence", "rc"],
        otherDocumentsOn: true,
        otherDocuments: [" Spare key ", "", "Insurance copy"],
        advance: "1,000.50",
        advanceMethod: "upi",
      }),
    );
    expect(errors).toEqual({});
    expect(payload).toMatchObject({
      vehicle_name: "Honda Activa 6G",
      odometer_km: 12500,
      helmets: 2,
      documents: ["rc", "licence"],
      other_documents: ["Spare key", "Insurance copy"],
      advance_amount: 1000.5,
      advance_method: "upi",
    });
  });

  it("ignores other items when Other is not ticked", () => {
    const { payload } = validateComplaint(filled({ otherDocumentsOn: false, otherDocuments: ["Spare key"] }));
    expect(payload?.other_documents).toEqual([]);
  });

  it("checks km, other items and the advance", () => {
    const r = validateComplaint(filled({ odometerKm: "12.5k", otherDocumentsOn: true, otherDocuments: [" "], advance: "abc" }));
    expect(Object.keys(r.errors).sort()).toEqual(["advance", "odometerKm", "otherDocuments"]);
    expect(validateComplaint(filled({ advance: "0" })).errors.advance).toMatch(/empty/);
  });

  it("works out the advance and balance on a bill", () => {
    expect(advanceAndBalance(1500, [{ advance_amount: 500 }, { advance_amount: null }, {}])).toEqual({ advance: 500, balance: 1000 });
    expect(advanceAndBalance(300, [{ advance_amount: 500 }])).toEqual({ advance: 500, balance: 0 });
  });

  it("lists documents received", () => {
    expect(documentsText({ documents: ["rc", "pollution"], other_documents: ["Spare key"] })).toBe("RC book, Pollution certificate, Spare key");
    expect(documentsText({})).toBe("");
  });

  it("starts with any customer details passed in", () => {
    expect(emptyComplaint({ vehicleReg: "KL39W0890" }).vehicleReg).toBe("KL39W0890");
  });

  it("requires customer, vehicle and a description", () => {
    const r = validateComplaint(emptyComplaint());
    expect(Object.keys(r.errors).sort()).toEqual(["customerName", "description", "phone", "vehicleReg"]);
    expect(r.payload).toBeNull();
  });

  it("rejects a reported date in the future", () => {
    expect(validateComplaint(filled({ reportedOn: "2999-01-01" })).errors.reportedOn).toMatch(/future/);
  });

  it("round-trips a saved complaint", () => {
    const d = filled({
      notes: "Customer waiting",
      vehicleName: "Maruti Swift",
      odometerKm: "45210",
      helmets: 1,
      documents: ["pollution"],
      otherDocumentsOn: true,
      otherDocuments: ["Spare key"],
      advance: "750",
      advanceMethod: "cash",
    });
    const saved = { ...validateComplaint(d).payload!, attended_by: "Ravi", attended_by_user: null, id: "c1", complaint_number: 1, vehicle_reg_key: "KL39W0890", created_at: "", updated_at: "" };
    expect(complaintToDraft(saved)).toEqual({ ...d, vehicleReg: "KL 39 W 0890", address: "" });
  });
});

describe("vehicleKey", () => {
  it("ignores spaces, dashes and case", () => {
    expect(vehicleKey("kl-39 w 0890")).toBe("KL39W0890");
  });
});

const complaint = (n: number, date: string, billCount: number): ComplaintWithBills => ({
  id: `c${n}`,
  complaint_number: n,
  customer_name: "Thomas",
  address: null,
  phone: "9744060485",
  vehicle_reg: "KL39W0890",
  vehicle_reg_key: "KL39W0890",
  description: `Complaint ${n}`,
  reported_on: date,
  attended_by: null,
  attended_by_user: null,
  notes: null,
  status: billCount ? "resolved" : "open",
  created_at: "",
  updated_at: "",
  bills: Array.from({ length: billCount }, (_, i) => ({ id: `b${i}`, bill_number: i, date_received: date, grand_total: 1 })),
});

const bill = (n: number, date: string, complaintIds: string[]): BillWithComplaints => ({
  id: `b${n}`,
  bill_number: n,
  customer_name: "Thomas",
  address: null,
  phone: "9744060485",
  vehicle_reg: "KL39W0890",
  vehicle_reg_key: "KL39W0890",
  date_received: date,
  expected_pickup: null,
  delivered_on: "2026-10-15",
  discount: 0,
  discount_percent: null,
  labour_charge: 100,
  painting_charge: null,
  washing_charge: null,
  items_subtotal: 0,
  grand_total: 100,
  created_at: "",
  updated_at: "",
  complaints: complaintIds.map((id) => ({ id, complaint_number: 0, description: "", status: "open", attended_by: null, reported_on: date })),
});

describe("vehicle history", () => {
  const complaints = [complaint(1, "2026-10-01", 1), complaint(2, "2026-10-14", 0)];
  const bills = [bill(1, "2026-10-01", ["c1"]), bill(2, "2026-10-10", [])];

  it("orders newest first, with a bill before a same-day complaint", () => {
    expect(buildHistory(complaints, bills).map((e) => `${e.kind}${e.kind === "bill" ? e.bill.bill_number : e.complaint.complaint_number}`))
      .toEqual(["complaint2", "bill2", "bill1", "complaint1"]);
  });

  it("filters to unlinked complaints and bills", () => {
    const all = buildHistory(complaints, bills);
    expect(filterHistory(all, "complaints-without-bill").map((e) => e.date)).toEqual(["2026-10-14"]);
    expect(filterHistory(all, "bills-without-complaint").map((e) => e.date)).toEqual(["2026-10-10"]);
  });

  it("counts open and unlinked records", () => {
    expect(historyCounts(complaints, bills)).toEqual({
      complaints: 2,
      openComplaints: 1,
      complaintsWithoutBill: 1,
      bills: 2,
      billsWithoutComplaint: 1,
    });
  });
});
