// Backup files: what goes in them, offline backups from the device copy, and checking a chosen file.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const server = {
  down: false,
  bills: [] as Record<string, unknown>[],
  complaints: [] as Record<string, unknown>[],
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
};
const netErr = { name: "TypeError", message: "TypeError: Failed to fetch" };

vi.mock("./supabase", () => {
  const query = (table: "bills" | "complaints") => {
    const q = {
      select: () => q,
      order: () => q,
      range: async (from: number, to: number) =>
        server.down ? { data: null, error: netErr } : { data: server[table].slice(from, to + 1), error: null },
    };
    return q;
  };
  return {
    supabase: {
      from: query,
      rpc: async (fn: string, args: Record<string, unknown> = {}) => {
        server.rpc.push({ fn, args });
        if (server.down) return { data: null, error: netErr };
        if (fn === "restore_backup")
          return {
            data: {
              bills: { added: (args.p_bills as unknown[]).length, present: 0, other: 0, renumbered: 0, failed: 0 },
              complaints: { added: (args.p_complaints as unknown[]).length, present: 0, other: 0, renumbered: 0, failed: 0 },
              links: 0,
              settings: false,
              error: null,
            },
            error: null,
          };
        return { data: null, error: null };
      },
    },
    errorMessage: (e: { message?: string }) => e?.message ?? "error",
  };
});
vi.mock("./sync", async (orig) => ({ ...(await orig<typeof import("./sync")>()), syncNow: async () => undefined }));

const { makeBackup, readBackupFile, backupFileName, restoreBackup, BACKUP_FORMAT } = await import("./backup");
const { openLocalDb } = await import("./local/db");

const settings = { shop_name: "Ravi Motors & Sons", address: "MG Road", phone: "9876543210", allow_zero_labour: false, vehicle_type: null, gst_enabled: false, gstin: null, gst_inclusive: false };
const bill = (id: string, n: number | null) => ({
  id,
  bill_number: n,
  shop_id: "s1",
  phone_digits: "9876543210",
  vehicle_reg_key: "KL39W0890",
  customer_name: "Ravi",
  bill_items: [
    { id: `${id}-2`, bill_id: id, position: 1, description: "Filter", quantity: 1, price: 200, line_total: 200 },
    { id: `${id}-1`, bill_id: id, position: 0, description: "Oil", quantity: 2, price: 300, line_total: 600 },
  ],
  bill_complaints: [{ complaint_id: "c1" }],
});

beforeEach(() => {
  server.down = false;
  server.bills = [bill("b1", 1), bill("b2", 2)];
  server.complaints = [{ id: "c1", complaint_number: 1, shop_id: "s1", phone_digits: "9876543210", customer_name: "Ravi" }];
  server.rpc = [];
});

describe("making a backup", () => {
  it("includes every bill with its items in order and its complaint links", async () => {
    const b = await makeBackup(settings);
    expect(b.format).toBe(BACKUP_FORMAT);
    expect(b.source).toBe("server");
    expect(b.bills).toHaveLength(2);
    expect(b.bills[0].bill_items.map((i) => i.description)).toEqual(["Oil", "Filter"]);
    expect(b.bills[0].complaint_ids).toEqual(["c1"]);
    expect(b.bills[0]).not.toHaveProperty("shop_id");
    expect(b.bills[0]).not.toHaveProperty("bill_complaints");
    expect(b.complaints[0]).not.toHaveProperty("shop_id");
    expect(b.settings).toEqual({ shop_name: "Ravi Motors & Sons", address: "MG Road", phone: "9876543210" });
  });

  it("reads past the first page of a big workshop", async () => {
    server.bills = Array.from({ length: 2345 }, (_, i) => bill(`b${i}`, i + 1));
    expect((await makeBackup(settings)).bills).toHaveLength(2345);
  });

  it("uses this device's copy when offline", async () => {
    const db = openLocalDb("u-backup");
    await db.bills.put({ ...bill("local1", null), complaint_ids: [], pending: 1 } as never);
    server.down = true;
    const b = await makeBackup(settings);
    expect(b.source).toBe("device");
    expect(b.bills.map((x) => x.id)).toEqual(["local1"]);
    expect(b.bills[0]).not.toHaveProperty("pending");
  });

  it("names the file after the workshop and date", async () => {
    const b = await makeBackup(settings);
    expect(backupFileName({ ...b, made_at: "2026-10-16T09:00:00.000Z" })).toBe("Pitshop Plus backup - Ravi Motors Sons - 2026-10-16.json");
  });
});

describe("restoring", () => {
  const file = (content: string) => new File([content], "backup.json", { type: "application/json" });

  it("accepts a backup file", async () => {
    const b = await makeBackup(settings);
    const back = await readBackupFile(file(JSON.stringify(b)));
    expect(back.bills).toHaveLength(2);
  });

  it("refuses files that aren't backups", async () => {
    await expect(readBackupFile(file("not json"))).rejects.toThrow("isn't a Pitshop Plus backup");
    await expect(readBackupFile(file(JSON.stringify({ bills: [] })))).rejects.toThrow("isn't a Pitshop Plus backup");
    await expect(readBackupFile(file(JSON.stringify({ format: BACKUP_FORMAT, version: 2, bills: [], complaints: [] })))).rejects.toThrow("newer version");
  });

  it("sends complaints before bills, in parts, and adds up the results", async () => {
    const b = await makeBackup(settings);
    b.bills = Array.from({ length: 450 }, (_, i) => ({ ...b.bills[0], id: `b${i}` }));
    const progress: number[] = [];
    const r = await restoreBackup(b, (done) => progress.push(done));
    const calls = server.rpc.filter((c) => c.fn === "restore_backup");
    expect(calls.map((c) => [(c.args.p_complaints as unknown[]).length, (c.args.p_bills as unknown[]).length])).toEqual([
      [1, 0],
      [0, 200],
      [0, 200],
      [0, 50],
    ]);
    expect(calls[0].args.p_settings).toEqual(b.settings);
    expect(calls[1].args.p_settings).toBeNull();
    expect(r.bills.added).toBe(450);
    expect(r.complaints.added).toBe(1);
    expect(progress.at(-1)).toBe(451);
  });
});
