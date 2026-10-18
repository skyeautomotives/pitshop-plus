// Keeps the device's copy of the workshop in step with the server.
//   push: sends changes made on this device (the outbox), complaints before bills.
//   pull: downloads bills and complaints changed since the last sync.
// Runs when the app starts, when the connection comes back, when the window is
// focused, and every 30 seconds.
import { useEffect, useState } from "react";
import { t } from "../i18n";
import { getMeta, isBillOp, localDb, localUserId, openLocalDb, setMeta, type LocalBill, type LocalComplaint, type OutboxOp } from "./local/db";
import { digitsOnly } from "./local/model";
import { errorMessage, supabase } from "./supabase";
import type { BillItemRow } from "./types";

export type SyncPhase = "idle" | "syncing" | "offline" | "error";

export interface SyncState {
  phase: SyncPhase;
  /** Changes waiting to be sent. */
  pending: number;
  /** Changes the server refused (need attention). */
  failed: number;
  lastSync: string | null;
  /** False until this device has downloaded the workshop's data once. */
  ready: boolean;
  message: string | null;
}

let state: SyncState = { phase: "idle", pending: 0, failed: 0, lastSync: null, ready: false, message: null };
const stateListeners = new Set<(s: SyncState) => void>();
const dataListeners = new Set<() => void>();

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(fn: (s: SyncState) => void): () => void {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

/** Called whenever the device's data changes (after a save or a sync). */
export function onDataChanged(fn: () => void): () => void {
  dataListeners.add(fn);
  return () => dataListeners.delete(fn);
}

export function notifyDataChanged() {
  dataListeners.forEach((fn) => fn());
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  stateListeners.forEach((fn) => fn(state));
}

/** True for "no connection" style failures (as opposed to the server refusing the change). */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const e = err as { message?: string; name?: string; code?: string; status?: number } | null;
  if (!e) return false;
  if (e.name === "TypeError" || e.name === "AbortError" || e.name === "AuthRetryableFetchError") return true;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed out/i.test(e.message ?? "");
}

function isAuthExpired(err: unknown): boolean {
  const e = err as { message?: string; code?: string; status?: number } | null;
  return !!e && (e.code === "PGRST301" || e.status === 401 || /jwt expired|invalid jwt/i.test(e.message ?? ""));
}

// ---------- Lifecycle ----------

let userId: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let running: Promise<void> | null = null;
let again = false;

const onOnline = () => void syncNow();
const onOffline = () => setState({ phase: "offline" });
const onFocus = () => {
  if (document.visibilityState === "visible") void syncNow();
};

/** Opens this login's local data and starts syncing. */
export function startSync(uid: string) {
  if (userId === uid) return;
  stopSync();
  userId = uid;
  openLocalDb(uid);
  setState({ phase: navigator.onLine ? "idle" : "offline", ready: false, message: null });
  void (async () => {
    const lastSync = (await getMeta<string>("lastSync")) ?? null;
    setState({ lastSync, ready: lastSync !== null });
    await refreshCounts();
    void syncNow();
  })();
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onFocus);
  timer = setInterval(() => void syncNow(), 30_000);
}

export function stopSync() {
  userId = null;
  if (timer) clearInterval(timer);
  timer = null;
  window.removeEventListener("online", onOnline);
  window.removeEventListener("offline", onOffline);
  document.removeEventListener("visibilitychange", onFocus);
}

/** Runs a sync now (or right after the one in progress). Resolves when it's done. */
export function syncNow(): Promise<void> {
  if (!userId) return Promise.resolve();
  if (running) {
    // Ask for one more round. If the current run has already passed the point where it
    // checks, start that round as soon as it finishes.
    again = true;
    return running.then(() => (again ? syncNow() : undefined));
  }
  running = (async () => {
    do {
      again = false;
      await runOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function runOnce() {
  const uid = userId;
  if (!navigator.onLine) {
    setState({ phase: "offline" });
    return;
  }
  setState({ phase: "syncing", message: null });
  try {
    await push();
    await pull();
    const now = new Date().toISOString();
    await setMeta("lastSync", now);
    await refreshCounts();
    setState({ phase: state.failed > 0 ? "error" : "idle", lastSync: now, ready: true });
  } catch (err) {
    // Signed out (or switched login) while this round was running: nothing left to update.
    if (userId !== uid) return;
    await refreshCounts();
    if (isNetworkError(err)) setState({ phase: "offline" });
    else setState({ phase: "error", message: errorMessage(err) });
  }
}

export async function refreshCounts() {
  if (!localUserId()) return;
  const ops = await localDb().outbox.toArray();
  setState({ pending: ops.filter((o) => !o.error).length, failed: ops.filter((o) => !!o.error).length });
}

// ---------- Push ----------

async function sendOp(op: OutboxOp) {
  if (op.kind === "bill") {
    const { error } = await supabase.rpc("save_bill", {
      p_bill: op.payload.bill,
      p_items: op.payload.items,
      p_id: null,
      p_complaint_ids: op.payload.complaintIds,
      p_new_id: op.entityId,
    });
    if (error) throw error;
  } else if (op.kind === "bill-payment") {
    const { error } =
      "add" in op.payload
        ? await supabase.rpc("add_bill_payment", { p_bill: op.entityId, p_payment: op.payload.add })
        : await supabase.rpc("remove_bill_payment", { p_bill: op.entityId, p_payment: op.payload.remove });
    if (error) throw error;
  } else if (op.kind === "complaint-create") {
    const { error } = await supabase.from("complaints").insert({ id: op.entityId, ...op.payload });
    // Already there: an earlier attempt reached the server before the connection dropped.
    if (error && error.code !== "23505") throw error;
  } else {
    const { error } = await supabase.from("complaints").update(op.payload).eq("id", op.entityId);
    if (error) throw error;
  }
}

async function push() {
  const db = localDb();
  const ops = (await db.outbox.orderBy("seq").toArray()).filter((o) => !o.error);
  // Bills can point at complaints made offline, so complaints go first; payments need their bill.
  const ordered = [
    ...ops.filter((o) => !isBillOp(o)),
    ...ops.filter((o) => o.kind === "bill"),
    ...ops.filter((o) => o.kind === "bill-payment"),
  ];
  for (const op of ordered) {
    try {
      await sendOp(op);
    } catch (err) {
      if (isAuthExpired(err)) {
        await supabase.auth.refreshSession();
        throw Object.assign(new Error("Signing in again, will retry."), { name: "TypeError" });
      }
      if (isNetworkError(err)) throw err;
      await db.outbox.update(op.seq!, { error: errorMessage(err) });
      continue;
    }
    await db.outbox.delete(op.seq!);
    const stillWaiting = await db.outbox.where("entityId").equals(op.entityId).count();
    if (!stillWaiting) {
      const table = isBillOp(op) ? db.bills : db.complaints;
      await table.update(op.entityId, { pending: 0 });
    }
  }
}

// ---------- Pull ----------

const PAGE = 1000;
/** Re-read a little before the last checkpoint so rows saved by slow transactions aren't missed. */
const OVERLAP_MS = 5 * 60 * 1000;

interface ServerBill extends Omit<LocalBill, "complaint_ids" | "pending" | "bill_items"> {
  bill_items: BillItemRow[];
  bill_complaints: { complaint_id: string }[];
}

async function pullTable<T extends { updated_at: string }>(
  table: "bills" | "complaints",
  select: string,
  store: (rows: T[]) => Promise<void>,
) {
  const key = `checkpoint:${table}`;
  const since = await getMeta<string>(key);
  const from = since ? new Date(new Date(since).getTime() - OVERLAP_MS).toISOString() : null;
  let newest = since ?? null;
  for (let start = 0; ; start += PAGE) {
    let q = supabase.from(table).select(select).order("updated_at").order("id").range(start, start + PAGE - 1);
    if (from) q = q.gte("updated_at", from);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as T[];
    if (rows.length) {
      await store(rows);
      const last = rows[rows.length - 1].updated_at;
      if (!newest || last > newest) newest = last;
    }
    if (rows.length < PAGE) break;
  }
  if (newest) await setMeta(key, newest);
}

async function pull() {
  const db = localDb();
  let changed = false;
  // Never overwrite a record that has changes waiting to be sent from this device.
  const waiting = new Set((await db.outbox.toArray()).map((o) => o.entityId));

  await pullTable<LocalComplaint>("complaints", "*", async (rows) => {
    const keep = rows.filter((r) => !waiting.has(r.id));
    await db.complaints.bulkPut(keep.map((r) => ({ ...r, phone_digits: r.phone_digits ?? digitsOnly(r.phone), pending: 0 })));
    changed ||= keep.length > 0;
  });

  await pullTable<ServerBill>("bills", "*, bill_items(*), bill_complaints(complaint_id)", async (rows) => {
    const keep = rows.filter((r) => !waiting.has(r.id));
    await db.bills.bulkPut(
      keep.map(({ bill_complaints, ...r }) => ({
        ...r,
        complaint_ids: bill_complaints.map((l) => l.complaint_id),
        pending: 0 as const,
      })),
    );
    changed ||= keep.length > 0;
  });

  if (changed) notifyDataChanged();
}

// ---------- For the status indicator and the "Waiting to sync" page ----------

/** Current sync state, updated live. */
export function useSyncState(): SyncState {
  const [s, setS] = useState(state);
  useEffect(() => subscribeSync(setS), []);
  return s;
}

export interface WaitingChange {
  seq: number;
  kind: OutboxOp["kind"];
  entityId: string;
  title: string;
  detail: string;
  error: string | null;
  createdAt: string;
}

/** Changes made on this device that haven't reached the server yet. */
export async function listWaitingChanges(): Promise<WaitingChange[]> {
  const db = localDb();
  const ops = await db.outbox.orderBy("seq").toArray();
  return Promise.all(
    ops.map(async (op) => {
      let title = "";
      let detail = "";
      if (op.kind === "bill") {
        const b = await db.bills.get(op.entityId);
        title = b?.bill_number ? t("syncPage.billN", { n: b.bill_number }) : t("syncPage.newBill");
        detail = [op.payload.bill.customer_name, op.payload.bill.vehicle_reg].filter(Boolean).join(" · ");
      } else if (op.kind === "bill-payment") {
        const b = await db.bills.get(op.entityId);
        const bill = b?.bill_number ? t("syncPage.billLower", { n: b.bill_number }) : t("syncPage.aNewBill");
        title = "add" in op.payload ? t("syncPage.paymentOn", { bill }) : t("syncPage.removedPaymentOn", { bill });
        detail = "add" in op.payload ? `₹${op.payload.add.amount} · ${op.payload.add.method.toUpperCase()}` : "";
      } else {
        const c = await db.complaints.get(op.entityId);
        title =
          op.kind === "complaint-create"
            ? t("syncPage.newComplaint")
            : c?.complaint_number
              ? t("syncPage.complaintN", { n: c.complaint_number })
              : t("syncPage.complaint");
        detail = c ? `${c.customer_name} · ${c.vehicle_reg}` : "";
      }
      return { seq: op.seq!, kind: op.kind, entityId: op.entityId, title, detail, error: op.error ?? null, createdAt: op.createdAt };
    }),
  );
}

/** Sends a change the server refused again (e.g. after fixing a setting). */
export async function retryChange(seq: number) {
  await localDb().outbox.update(seq, { error: null });
  await refreshCounts();
  void syncNow();
}

/**
 * Drops a change made on this device. A record that was only ever on this device (no
 * number yet) is removed straight away; an edit to a synced record is undone by
 * downloading the server's copy again.
 */
export async function discardChange(seq: number) {
  const db = localDb();
  const op = await db.outbox.get(seq);
  if (!op) return;
  await db.outbox.delete(seq);
  if (op.kind === "bill-payment" && "add" in op.payload) {
    const b = await db.bills.get(op.entityId);
    const id = op.payload.add.id;
    if (b) await db.bills.update(op.entityId, { payments: (b.payments ?? []).filter((p) => p.id !== id) });
  }
  const stillWaiting = await db.outbox.where("entityId").equals(op.entityId).count();
  if (!stillWaiting) {
    const table = isBillOp(op) ? "bills" : "complaints";
    const local = isBillOp(op) ? await db.bills.get(op.entityId) : await db.complaints.get(op.entityId);
    const number = local ? ("bill_number" in local ? local.bill_number : local.complaint_number) : null;
    // Re-read everything at the next sync, so whatever the server has comes back.
    await setMeta(`checkpoint:${table}`, null);
    if (local && number === null) {
      // Made on this device and never numbered by the server: remove it. If an earlier
      // upload did reach the server after all, the next sync downloads it again.
      if (op.kind === "bill") await db.bills.delete(op.entityId);
      else if (op.kind === "complaint-create" || op.kind === "complaint-update") await db.complaints.delete(op.entityId);
    } else if (local) {
      // An edit to a synced record: let the next sync overwrite it with the server's copy.
      if (isBillOp(op)) await db.bills.update(op.entityId, { pending: 0 });
      else await db.complaints.update(op.entityId, { pending: 0 });
    }
  }
  await refreshCounts();
  notifyDataChanged();
  void syncNow();
}
