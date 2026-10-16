// Offline mode: saving without a connection, sending later, retries and refusals.
// Uses an in-memory IndexedDB and a fake Supabase server.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveBillPayload } from "./bill";
import type { ComplaintPayload } from "./complaint";

// ---------- A fake server ----------

type Row = Record<string, unknown>;
const server = {
  bills: [] as Row[],
  complaints: [] as Row[],
  nextBill: 1,
  nextComplaint: 1,
  /** Throw a network error on every request while true. */
  down: false,
  /** Refuse save_bill with this message (once). */
  refuseBill: null as string | null,
  calls: [] as string[],
};

const netErr = () => ({ data: null, error: { name: "TypeError", message: "TypeError: Failed to fetch" } });
const stamp = () => new Date(Date.now() + server.calls.length).toISOString();

function serverSaveBill(args: { p_bill: Record<string, string | null>; p_items: { description: string; quantity: string; price: string }[]; p_complaint_ids: string[]; p_new_id: string }) {
  const { p_bill: b, p_items: items, p_complaint_ids: links, p_new_id: id } = args;
  const sub = items.reduce((s, i) => s + Math.round(Number(i.price) * 100 * Number(i.quantity || "1")), 0) / 100;
  const total = sub + Number(b.labour_charge) - Number(b.discount || 0);
  let row = server.bills.find((r) => r.id === id);
  if (!row) {
    row = { id, bill_number: server.nextBill++, created_at: stamp() };
    server.bills.push(row);
  }
  Object.assign(row, {
    customer_name: b.customer_name,
    address: b.address || null,
    phone: b.phone,
    phone_digits: String(b.phone).replace(/\D/g, ""),
    vehicle_reg: String(b.vehicle_reg).toUpperCase(),
    vehicle_reg_key: String(b.vehicle_reg).toUpperCase().replace(/[^A-Z0-9]/g, ""),
    date_received: b.date_received,
    expected_pickup: b.expected_pickup,
    delivered_on: b.delivered_on,
    labour_charge: Number(b.labour_charge),
    painting_charge: null,
    washing_charge: null,
    items_subtotal: sub,
    discount: Number(b.discount || 0),
    discount_percent: null,
    grand_total: total,
    created_by: "u1",
    updated_at: stamp(),
    bill_items: items.map((i, n) => ({ id: `${id}-${n}`, bill_id: id, position: n, description: i.description, quantity: Number(i.quantity || 1), price: Number(i.price), line_total: Number(i.price) })),
    bill_complaints: links.map((complaint_id) => ({ complaint_id })),
  });
  for (const cid of links) {
    const c = server.complaints.find((r) => r.id === cid);
    if (!c) throw { code: "22023", message: "A selected complaint is for a different vehicle. Check the vehicle number." };
    Object.assign(c, { status: "resolved", updated_at: stamp() });
  }
  return id;
}

function query(table: "bills" | "complaints") {
  let since: string | null = null;
  let eqId: string | null = null;
  const run = () => {
    if (server.down) return netErr();
    let rows = server[table].filter((r) => !since || String(r.updated_at) >= since);
    if (eqId) rows = rows.filter((r) => r.id === eqId);
    rows = [...rows].sort((a, b) => (String(a.updated_at) < String(b.updated_at) ? -1 : 1));
    return { data: rows.map((r) => ({ ...r })), error: null };
  };
  const q = {
    select: () => q,
    order: () => q,
    range: () => q,
    gte: (_c: string, v: string) => ((since = v), q),
    eq: (_c: string, v: string) => ((eqId = v), q),
    maybeSingle: async () => {
      const r = run();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (resolve: (v: unknown) => void) => resolve(run()),
  };
  return q;
}

const fakeSupabase = {
  rpc: async (fn: string, args: never) => {
    server.calls.push(fn);
    if (server.down) return netErr();
    if (fn !== "save_bill") return { data: null, error: null };
    if (server.refuseBill) {
      const message = server.refuseBill;
      server.refuseBill = null;
      return { data: null, error: { code: "22023", message } };
    }
    try {
      return { data: serverSaveBill(args), error: null };
    } catch (e) {
      return { data: null, error: e };
    }
  },
  from: (table: "bills" | "complaints") => ({
    ...query(table),
    insert: async (row: Row) => {
      server.calls.push(`insert:${table}`);
      if (server.down) return netErr();
      if (server[table].some((r) => r.id === row.id)) return { data: null, error: { code: "23505", message: "duplicate key" } };
      const n = server.nextComplaint++;
      server[table].push({
        ...row,
        complaint_number: n,
        phone_digits: String(row.phone).replace(/\D/g, ""),
        vehicle_reg_key: String(row.vehicle_reg).toUpperCase().replace(/[^A-Z0-9]/g, ""),
        attended_by: "Owner",
        attended_by_user: "u1",
        created_at: stamp(),
        updated_at: stamp(),
      });
      return { data: null, error: null };
    },
    update: (patch: Row) => ({
      eq: async (_c: string, id: string) => {
        server.calls.push(`update:${table}`);
        if (server.down) return netErr();
        const r = server[table].find((x) => x.id === id);
        if (r) Object.assign(r, patch, { updated_at: stamp() });
        return { data: null, error: null };
      },
    }),
  }),
  auth: { refreshSession: async () => ({}) },
};

vi.mock("./supabase", () => ({
  supabase: fakeSupabase,
  errorMessage: (e: { message?: string }) => e?.message ?? "error",
}));

// Browser bits the sync engine touches.
const online = { value: true };
vi.stubGlobal("navigator", {
  get onLine() {
    return online.value;
  },
});
vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {}, confirm: () => true });
vi.stubGlobal("document", { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" });
vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });

const api = await import("./api");
const sync = await import("./sync");
const { localDb, deleteLocalDb } = await import("./local/db");

// ---------- Helpers ----------

function bill(overrides: Partial<SaveBillPayload["bill"]> = {}, complaintIds: string[] = []): SaveBillPayload {
  return {
    bill: {
      customer_name: "Ravi Kumar",
      address: "",
      phone: "98765 43210",
      vehicle_reg: "KL 39 W 0890",
      date_received: "2026-10-16",
      expected_pickup: null,
      delivered_on: "2026-10-16",
      labour_charge: "500.00",
      painting_charge: null,
      washing_charge: null,
      discount: "0",
      discount_percent: null,
      ...overrides,
    },
    items: [{ description: "Engine oil", quantity: "2", price: "300.00" }],
    complaintIds,
  };
}

const complaint: ComplaintPayload = {
  customer_name: "Ravi Kumar",
  address: null,
  phone: "98765 43210",
  vehicle_reg: "KL 39 W 0890",
  description: "Brake noise",
  reported_on: "2026-10-16",
  notes: null,
  status: "open",
  vehicle_name: "Honda Activa",
  odometer_km: 12500,
  helmets: 1,
  documents: ["rc"],
  other_documents: [],
  advance_amount: 500,
  advance_method: "upi",
};

let n = 0;
beforeEach(async () => {
  Object.assign(server, { bills: [], complaints: [], nextBill: 1, nextComplaint: 1, down: false, refuseBill: null, calls: [] });
  online.value = true;
  sync.startSync(`user-${++n}`);
  await sync.syncNow();
});

afterEach(async () => {
  sync.stopSync();
  await deleteLocalDb();
});

const goOffline = () => {
  online.value = false;
  server.down = true;
};
const goOnline = () => {
  online.value = true;
  server.down = false;
};

// ---------- Tests ----------

describe("offline mode", () => {
  it("saves a bill offline with the right totals and no number yet", async () => {
    goOffline();
    const id = await api.saveBill(bill());
    const b = await api.getBill(id);
    expect(b?.bill_number).toBeNull();
    expect(b?.pending).toBe(true);
    expect(b?.grand_total).toBe(1100); // 2 x 300 + 500
    expect(await localDb().outbox.count()).toBe(1);
    expect(server.bills).toHaveLength(0);
  });

  it("finds offline bills by name, phone and vehicle number", async () => {
    goOffline();
    await api.saveBill(bill());
    expect(await api.searchBills("ravi")).toHaveLength(1);
    expect(await api.searchBills("43210")).toHaveLength(1);
    expect(await api.searchBills("kl39w")).toHaveLength(1);
    expect(await api.searchBills("suresh")).toHaveLength(0);
  });

  it("sends offline bills when back online, and they get a number", async () => {
    goOffline();
    const id = await api.saveBill(bill());
    goOnline();
    await sync.syncNow();
    expect(server.bills).toHaveLength(1);
    expect(server.bills[0].id).toBe(id);
    const b = await api.getBill(id);
    expect(b?.bill_number).toBe(1);
    expect(b?.pending).toBe(false);
    expect(await localDb().outbox.count()).toBe(0);
  });

  it("editing an offline bill again sends only the latest version", async () => {
    goOffline();
    const id = await api.saveBill(bill());
    await api.saveBill(bill({ labour_charge: "800.00" }), id);
    expect(await localDb().outbox.count()).toBe(1);
    goOnline();
    await sync.syncNow();
    expect(server.bills).toHaveLength(1);
    expect(server.bills[0].grand_total).toBe(1400);
  });

  it("never duplicates a bill when an upload is retried", async () => {
    goOffline();
    const id = await api.saveBill(bill());
    goOnline();
    await sync.syncNow();
    // Pretend the reply was lost: the same change is sent again.
    await localDb().outbox.add({ kind: "bill", entityId: id, payload: bill(), createdAt: new Date().toISOString() });
    await sync.syncNow();
    expect(server.bills).toHaveLength(1);
    expect(server.bills[0].bill_number).toBe(1);
  });

  it("keeps the change when the connection drops during sync", async () => {
    goOffline();
    await api.saveBill(bill());
    online.value = true; // the phone thinks it's online, but requests fail
    await sync.syncNow();
    expect(await localDb().outbox.count()).toBe(1);
    expect(sync.getSyncState().phase).toBe("offline");
    server.down = false;
    await sync.syncNow();
    expect(server.bills).toHaveLength(1);
  });

  it("a complaint and a bill that fixes it, both made offline, sync in the right order", async () => {
    goOffline();
    const cid = await api.createComplaint(complaint);
    const bid = await api.saveBill(bill({}, [cid]));
    expect((await api.getComplaint(cid))?.status).toBe("resolved");
    expect((await api.getBill(bid))?.complaints.map((c) => c.id)).toEqual([cid]);
    goOnline();
    await sync.syncNow();
    expect(server.complaints).toHaveLength(1);
    expect(server.bills).toHaveLength(1);
    expect(server.complaints[0].status).toBe("resolved");
    expect(await localDb().outbox.count()).toBe(0);
    expect((await api.getComplaint(cid))?.complaint_number).toBe(1);
  });

  it("a complaint uploaded twice is not duplicated", async () => {
    goOffline();
    const cid = await api.createComplaint(complaint);
    goOnline();
    await sync.syncNow();
    await localDb().outbox.add({ kind: "complaint-create", entityId: cid, payload: complaint, createdAt: new Date().toISOString() });
    await sync.syncNow();
    expect(server.complaints).toHaveLength(1);
    expect(await localDb().outbox.count()).toBe(0);
  });

  it("offline edits to a complaint are merged into one change", async () => {
    goOffline();
    const cid = await api.createComplaint(complaint);
    await api.updateComplaint(cid, { ...complaint, description: "Brake noise and pulling left" });
    await api.setComplaintStatus(cid, "resolved");
    expect(await localDb().outbox.count()).toBe(1);
    goOnline();
    await sync.syncNow();
    expect(server.complaints[0].description).toBe("Brake noise and pulling left");
    expect(server.complaints[0].status).toBe("resolved");
  });

  it("a change the server refuses is kept and flagged, others still go through", async () => {
    goOffline();
    await api.saveBill(bill({ customer_name: "First" }));
    await api.saveBill(bill({ customer_name: "Second" }));
    goOnline();
    server.refuseBill = "A valid labour charge is required.";
    await sync.syncNow();
    const waiting = await sync.listWaitingChanges();
    expect(waiting).toHaveLength(1);
    expect(waiting[0].error).toBe("A valid labour charge is required.");
    expect(server.bills).toHaveLength(1);
    expect(sync.getSyncState().failed).toBe(1);
    await sync.retryChange(waiting[0].seq);
    await sync.syncNow();
    expect(server.bills).toHaveLength(2);
    expect(sync.getSyncState().failed).toBe(0);
  });

  it("a sync does not overwrite changes still waiting on this device", async () => {
    const id = await api.saveBill(bill()); // online
    goOffline();
    await api.saveBill(bill({ customer_name: "Ravi K (edited offline)" }), id);
    // Someone else changes it on the server meanwhile.
    Object.assign(server.bills[0], { customer_name: "Changed elsewhere", updated_at: new Date(Date.now() + 1e6).toISOString() });
    online.value = true; // reads work, but sends fail
    await sync.syncNow();
    expect((await api.getBill(id))?.customer_name).toBe("Ravi K (edited offline)");
  });

  it("online saves go straight to the server and come back numbered", async () => {
    const id = await api.saveBill(bill());
    expect(server.bills).toHaveLength(1);
    expect((await api.getBill(id))?.bill_number).toBe(1);
    expect(await localDb().outbox.count()).toBe(0);
  });

  it("online, a server refusal is shown on the form instead of being queued", async () => {
    server.refuseBill = "The discount can't be more than the bill total.";
    await expect(api.saveBill(bill())).rejects.toMatchObject({ message: "The discount can't be more than the bill total." });
    expect(await localDb().outbox.count()).toBe(0);
  });

  it("discarding a change made only on this device removes it", async () => {
    goOffline();
    const id = await api.saveBill(bill());
    goOnline();
    server.refuseBill = "No.";
    await sync.syncNow();
    const [w] = await sync.listWaitingChanges();
    await sync.discardChange(w.seq);
    expect(await api.getBill(id)).toBeNull();
    expect(await localDb().outbox.count()).toBe(0);
  });

  it("discarding while still offline removes a bill made only on this device", async () => {
    goOffline();
    const id = await api.saveBill(bill());
    const [w] = await sync.listWaitingChanges();
    await sync.discardChange(w.seq);
    expect(await api.getBill(id)).toBeNull();
    goOnline();
    await sync.syncNow();
    expect(server.bills).toHaveLength(0);
    expect(await api.getBill(id)).toBeNull();
  });

  it("discarding an offline edit to a synced bill brings back the server's version", async () => {
    const id = await api.saveBill(bill()); // online, numbered 1
    goOffline();
    await api.saveBill(bill({ customer_name: "Typo name" }), id);
    const [w] = await sync.listWaitingChanges();
    await sync.discardChange(w.seq);
    goOnline();
    await sync.syncNow();
    const b = await api.getBill(id);
    expect(b?.customer_name).toBe("Ravi Kumar");
    expect(b?.bill_number).toBe(1);
  });

  it("sales reports include bills saved offline", async () => {
    goOffline();
    await api.saveBill(bill());
    const rows = await api.salesForRange("2026-10-01", "2026-10-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].grand_total).toBe(1100);
  });
});
