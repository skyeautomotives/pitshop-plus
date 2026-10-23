import { describe, expect, it } from "vitest";
import { addDays, creditBills, creditDueText, creditTotals, creditReminderLink, creditReminderMessage, creditReminders, creditStatus, daysUntil, validateCredit } from "./credit";
import type { BillWithComplaints } from "./types";

const TODAY = "2026-10-23";

function bill(overrides: Partial<BillWithComplaints> = {}): BillWithComplaints {
  return {
    id: "b1",
    bill_number: 12,
    customer_name: "Ravi",
    address: null,
    phone: "98765 43210",
    vehicle_reg: "KL 07 AB 1234",
    vehicle_reg_key: "KL07AB1234",
    date_received: "2026-10-10",
    expected_pickup: null,
    delivered_on: "2026-10-10",
    labour_charge: 500,
    painting_charge: null,
    washing_charge: null,
    items_subtotal: 1500,
    discount: 0,
    discount_percent: null,
    grand_total: 2000,
    created_at: "",
    updated_at: "",
    complaints: [],
    payments: [{ id: "p1", amount: 500, method: "cash", paid_on: "2026-10-10", note: null, created_at: "" }],
    credit_due_on: "2026-10-20",
    ...overrides,
  } as BillWithComplaints;
}

describe("dates", () => {
  it("adds days and counts days left", () => {
    expect(addDays("2026-10-23", 7)).toBe("2026-10-30");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(daysUntil("2026-10-30", TODAY)).toBe(7);
    expect(daysUntil("2026-10-20", TODAY)).toBe(-3);
  });

  it("says how the credit stands", () => {
    expect(creditStatus("2026-10-20", TODAY)).toBe("overdue");
    expect(creditStatus(TODAY, TODAY)).toBe("today");
    expect(creditStatus("2026-10-30", TODAY)).toBe("soon");
    expect(creditStatus("2026-11-30", TODAY)).toBe("later");
    expect(creditDueText("2026-10-20", TODAY)).toBe("Overdue by 3 days");
    expect(creditDueText("2026-10-22", TODAY)).toBe("Overdue by 1 day");
    expect(creditDueText(TODAY, TODAY)).toBe("Due today");
    expect(creditDueText("2026-10-28", TODAY)).toBe("Due in 5 days");
  });

  it("checks the form", () => {
    expect(validateCredit("2026-11-01", "Salary day")).toBeNull();
    expect(validateCredit("", "")).toMatch(/date/);
    expect(validateCredit("2026-11-01", "x".repeat(201))).toMatch(/200/);
  });
});

describe("creditReminders", () => {
  it("lists overdue and soon-due credit with a balance, most overdue first", () => {
    const list = creditReminders(
      [
        bill({ id: "soon", credit_due_on: "2026-10-28" }),
        bill({ id: "late", credit_due_on: "2026-10-20" }),
        bill({ id: "later", credit_due_on: "2026-12-01" }),
        bill({ id: "none", credit_due_on: null }),
        bill({ id: "paid", payments: [{ id: "p", amount: 2000, method: "upi", paid_on: TODAY, note: null, created_at: "" }] }),
      ],
      TODAY,
    );
    expect(list.map((r) => r.bill.id)).toEqual(["late", "soon"]);
    expect(list[0]).toMatchObject({ balance: 1500, status: "overdue" });
  });
});

describe("reminder message", () => {
  const r = creditReminders([bill()], TODAY)[0];
  const shop = { shop_name: "Ravi Motors", phone: "0484 123456", address: null, allow_zero_labour: false } as never;

  it("names the balance, bill, vehicle and due date, in English", () => {
    const m = creditReminderMessage(r, shop, TODAY);
    expect(m).toContain("Hello Ravi,");
    expect(m).toContain("Ravi Motors");
    expect(m).toContain("₹1,500.00");
    expect(m).toContain("KL 07 AB 1234");
    expect(m).toContain("This was due on 20 Oct 2026.");
    expect(m).toContain("Contact: 0484 123456");
  });

  it("opens the customer's chat", () => {
    expect(creditReminderLink(r, shop, TODAY)).toMatch(/^https:\/\/wa\.me\/919876543210\?text=Hello%20Ravi/);
  });
});

describe("creditTotals and creditBills", () => {
  const paid = [{ id: "p", amount: 2000, method: "upi" as const, paid_on: TODAY, note: null, created_at: "" }];
  const bills = [
    bill({ id: "late", credit_due_on: "2026-10-20" }),
    bill({ id: "today", credit_due_on: TODAY }),
    bill({ id: "soon", credit_due_on: "2026-10-28" }),
    bill({ id: "later", credit_due_on: "2026-12-01" }),
    bill({ id: "nodate", credit_due_on: null }),
    bill({ id: "paid", credit_due_on: "2026-10-20", payments: paid }),
  ];

  it("adds up credit by when it is due, and unpaid bills without a date", () => {
    expect(creditTotals(bills, TODAY)).toEqual({
      total: 6000,
      overdue: { amount: 1500, bills: 1 },
      soon: { amount: 3000, bills: 2 },
      later: { amount: 1500, bills: 1 },
      noDate: { amount: 1500, bills: 1 },
    });
  });

  it("lists every bill on credit with a balance, earliest due first", () => {
    expect(creditBills(bills, TODAY).map((r) => r.bill.id)).toEqual(["late", "today", "soon", "later"]);
  });
});
