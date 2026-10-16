// The device's copy of the workshop's data, for offline use (IndexedDB via Dexie).
// One database per signed-in login, so two people sharing a PC never see each other's queue.
import Dexie, { type Table } from "dexie";
import type { SaveBillPayload } from "../bill";
import type { ComplaintPayload } from "../complaint";
import type { BillItemRow, BillPayment, BillRow, ComplaintRow } from "../types";

/** A bill as stored on the device: the row, its items and the complaints it addresses. */
export interface LocalBill extends Omit<BillRow, "pending"> {
  vehicle_reg_key: string;
  phone_digits: string;
  created_by: string | null;
  bill_items: BillItemRow[];
  complaint_ids: string[];
  /** 1 while a change made on this device hasn't reached the server yet. */
  pending: 0 | 1;
}

export interface LocalComplaint extends Omit<ComplaintRow, "pending"> {
  phone_digits: string;
  pending: 0 | 1;
}

interface OpBase {
  seq?: number;
  entityId: string;
  createdAt: string;
  /** Set when the server refused the change (not for network problems). */
  error?: string | null;
}

/** A change waiting to be sent to the server. */
export type OutboxOp =
  | (OpBase & { kind: "bill"; payload: SaveBillPayload })
  | (OpBase & { kind: "complaint-create"; payload: ComplaintPayload })
  | (OpBase & { kind: "complaint-update"; payload: Partial<ComplaintPayload> })
  /** entityId is the bill's id. */
  | (OpBase & { kind: "bill-payment"; payload: { add: BillPayment } | { remove: string } });

/** Changes to bills (the bill itself or its payments), as opposed to complaints. */
export const isBillOp = (op: Pick<OutboxOp, "kind">) => op.kind === "bill" || op.kind === "bill-payment";

export interface MetaRow {
  key: string;
  value: unknown;
}

export class PitstopDB extends Dexie {
  bills!: Table<LocalBill, string>;
  complaints!: Table<LocalComplaint, string>;
  outbox!: Table<OutboxOp, number>;
  meta!: Table<MetaRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      bills: "id, vehicle_reg_key, date_received, updated_at, pending",
      complaints: "id, vehicle_reg_key, reported_on, status, phone_digits, updated_at, pending",
      outbox: "++seq, kind, entityId",
      meta: "key",
    });
  }
}

const dbName = (userId: string) => `pitstop-${userId}`;

let current: { userId: string; db: PitstopDB } | null = null;

/** Opens (or switches to) the database of the signed-in login. */
export function openLocalDb(userId: string): PitstopDB {
  if (current?.userId === userId) return current.db;
  current?.db.close();
  current = { userId, db: new PitstopDB(dbName(userId)) };
  return current.db;
}

/** The open database. Only signed-in pages call this. */
export function localDb(): PitstopDB {
  if (!current) throw new Error("Please sign in again.");
  return current.db;
}

export function localUserId(): string | null {
  return current?.userId ?? null;
}

/** Closes and deletes the signed-in login's data from this device. */
export async function deleteLocalDb(): Promise<void> {
  if (!current) return;
  const { db } = current;
  current = null;
  db.close();
  await Dexie.delete(db.name);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await localDb().meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await localDb().meta.put({ key, value });
}
