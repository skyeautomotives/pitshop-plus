import { describe, expect, it } from "vitest";
import { todayISO } from "./customer";
import { billMoney, emptyPayment, validatePayment } from "./payments";

describe("billMoney", () => {
  it("is unpaid when nothing was received", () => {
    expect(billMoney(1500, [], [])).toEqual({ advance: 0, paid: 0, balance: 1500, extra: 0, status: "unpaid" });
  });

  it("takes off the advance and payments", () => {
    const m = billMoney(2000, [{ advance_amount: 500 }, { advance_amount: null }, {}], [{ amount: 1000 }, { amount: 250.5 }]);
    expect(m).toEqual({ advance: 500, paid: 1250.5, balance: 249.5, extra: 0, status: "part-paid" });
  });

  it("is paid in full at zero, and notes any extra", () => {
    expect(billMoney(1000, [{ advance_amount: 400 }], [{ amount: 600 }]).status).toBe("paid");
    expect(billMoney(300, [{ advance_amount: 500 }])).toMatchObject({ balance: 0, extra: 200, status: "paid" });
  });
});

describe("payment form", () => {
  it("starts with the balance, cash and today", () => {
    expect(emptyPayment(749.5)).toEqual({ amount: "749.50", method: "cash", paidOn: todayISO(), note: "" });
    expect(emptyPayment(0).amount).toBe("");
  });

  it("accepts a valid payment", () => {
    const r = validatePayment({ amount: "1,000", method: "upi", paidOn: todayISO(), note: "  ref 4512 " }, 1500);
    expect(r).toEqual({ error: null, input: { amount: 1000, method: "upi", paid_on: todayISO(), note: "ref 4512" } });
  });

  it("refuses empty, zero, more than the balance and future dates", () => {
    const d = { method: "cash" as const, paidOn: todayISO(), note: "" };
    expect(validatePayment({ ...d, amount: "" }, 500).error).toMatch(/amount/);
    expect(validatePayment({ ...d, amount: "0" }, 500).error).toMatch(/amount/);
    expect(validatePayment({ ...d, amount: "600" }, 500).error).toMatch(/more than the balance/);
    expect(validatePayment({ ...d, amount: "100", paidOn: "2999-01-01" }, 500).error).toMatch(/future/);
  });
});
