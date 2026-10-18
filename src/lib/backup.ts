// Backup files the workshop owner keeps (on their computer, phone or Google Drive),
// and restoring them. A restore only adds what is missing; see 0017_backup_restore.sql.
import { formatDate } from "./format";
import { t, tn } from "../i18n";
import { localDb, localUserId } from "./local/db";
import { isAndroidApp, isDesktopApp } from "./platform";
import { supabase } from "./supabase";
import { isNetworkError, notifyDataChanged, syncNow } from "./sync";
import type { BillItemRow, BillRow, ComplaintRow, ShopSettings } from "./types";

export const BACKUP_FORMAT = "pitstop-plus-backup";

export interface BackupBill extends Omit<BillRow, "pending"> {
  created_by: string | null;
  bill_items: BillItemRow[];
  complaint_ids: string[];
}

export type BackupComplaint = Omit<ComplaintRow, "pending"> & { created_by?: string | null };

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  made_at: string;
  /** "server": read from the online account. "device": this device's copy (made offline). */
  source: "server" | "device";
  workshop: string;
  settings: Pick<ShopSettings, "shop_name" | "address" | "phone"> | null;
  bills: BackupBill[];
  complaints: BackupComplaint[];
}

const PAGE = 1000;

async function readAll<T>(table: "bills" | "complaints", select: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase.from(table).select(select).order(order).order("id").range(start, start + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

const strip = <T extends object>(row: T, keys: string[]) => {
  const copy = { ...row } as Record<string, unknown>;
  for (const k of keys) delete copy[k];
  return copy as T;
};

async function fromServer(): Promise<Pick<BackupFile, "bills" | "complaints">> {
  type Row = BackupBill & { bill_complaints: { complaint_id: string }[] };
  const [bills, complaints] = await Promise.all([
    readAll<Row>("bills", "*, bill_items(*), bill_complaints(complaint_id)", "bill_number"),
    readAll<BackupComplaint>("complaints", "*", "complaint_number"),
  ]);
  return {
    bills: bills.map(({ bill_complaints, ...b }) => ({
      ...strip(b, ["shop_id", "phone_digits", "vehicle_reg_key"]),
      bill_items: [...b.bill_items].sort((x, y) => x.position - y.position),
      complaint_ids: bill_complaints.map((l) => l.complaint_id),
    })),
    complaints: complaints.map((c) => strip(c, ["shop_id", "phone_digits"])),
  };
}

async function fromDevice(): Promise<Pick<BackupFile, "bills" | "complaints">> {
  const db = localDb();
  const [bills, complaints] = await Promise.all([db.bills.toArray(), db.complaints.toArray()]);
  return {
    bills: bills.map((b) => strip(b, ["pending", "phone_digits", "vehicle_reg_key", "shop_id"]) as BackupBill),
    complaints: complaints.map((c) => strip(c, ["pending", "phone_digits", "shop_id"]) as BackupComplaint),
  };
}

/** Collects the workshop's records. Uses this device's copy when there is no connection. */
export async function makeBackup(settings: ShopSettings | null): Promise<BackupFile> {
  let source: BackupFile["source"] = "server";
  let data: Pick<BackupFile, "bills" | "complaints">;
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new TypeError("offline");
    data = await fromServer();
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    source = "device";
    data = await fromDevice();
  }
  return {
    format: BACKUP_FORMAT,
    version: 1,
    made_at: new Date().toISOString(),
    source,
    workshop: settings?.shop_name ?? "",
    settings: settings ? { shop_name: settings.shop_name, address: settings.address, phone: settings.phone } : null,
    ...data,
  };
}

export function backupFileName(b: BackupFile): string {
  const name = b.workshop.replace(/[^A-Za-z0-9 ]+/g, "").trim().replace(/\s+/g, " ").slice(0, 40);
  return `Pitshop Plus backup${name ? ` - ${name}` : ""} - ${b.made_at.slice(0, 10)}.json`;
}

/**
 * Hands the file to the person: a save dialog on Windows, the share sheet on Android
 * (Google Drive, Files, WhatsApp, email), a download on the website.
 * Returns false if they cancelled.
 */
export async function saveBackupFile(b: BackupFile): Promise<boolean> {
  const name = backupFileName(b);
  const text = JSON.stringify(b, null, 1);
  if (isDesktopApp) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: name, filters: [{ name: "Pitshop Plus backup", extensions: ["json"] }] });
    if (!path) return false;
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, text);
    return true;
  }
  if (isAndroidApp) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: name, files: [uri], dialogTitle: t("backup.shareTitle") });
    } catch (err) {
      if (/cancel/i.test((err as Error)?.message ?? "")) return false;
      throw err;
    }
    return true;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

const lastKey = () => `pitstop:last-backup:${localUserId() ?? ""}`;

/** Remembers that a backup was saved (on the server for all devices, and on this device). */
export async function recordBackup(): Promise<void> {
  try {
    localStorage.setItem(lastKey(), new Date().toISOString());
  } catch {
    /* storage unavailable */
  }
  await supabase.rpc("record_backup").then(
    () => undefined,
    () => undefined,
  );
}

export interface BackupStatus {
  last: string | null;
  shopCreatedAt: string | null;
  bills: number;
}

export async function backupStatus(): Promise<BackupStatus> {
  let local: string | null = null;
  try {
    local = localStorage.getItem(lastKey());
  } catch {
    /* storage unavailable */
  }
  const { data, error } = await supabase.rpc("backup_status");
  const row = error ? null : ((data as { last_backup_at: string | null; shop_created_at: string; bills: number }[] | null) ?? [])[0];
  const server = row?.last_backup_at ?? null;
  return {
    last: !server ? local : !local ? server : server > local ? server : local,
    shopCreatedAt: row?.shop_created_at ?? null,
    bills: Number(row?.bills ?? 0),
  };
}

// ---------- Restore ----------

/** Reads and checks a chosen file. Throws a plain-language error if it isn't a backup. */
export async function readBackupFile(file: File): Promise<BackupFile> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(t("backup.notBackup"));
  }
  const b = data as Partial<BackupFile> | null;
  if (!b || b.format !== BACKUP_FORMAT || !Array.isArray(b.bills) || !Array.isArray(b.complaints)) {
    throw new Error(t("backup.notBackup"));
  }
  if (typeof b.version !== "number" || b.version > 1) {
    throw new Error(t("backup.newerVersion"));
  }
  return b as BackupFile;
}

export interface CheckCounts {
  total: number;
  missing: number;
  present: number;
  other: number;
  renumbered: number;
}
export interface RestoreCheck {
  bills: CheckCounts;
  complaints: CheckCounts;
}

/** What restoring would add, without changing anything. */
export async function checkBackup(b: BackupFile): Promise<RestoreCheck> {
  const { data, error } = await supabase.rpc("restore_backup_check", {
    p_bills: b.bills.map((x) => ({ id: x.id, number: x.bill_number })),
    p_complaints: b.complaints.map((x) => ({ id: x.id, number: x.complaint_number })),
  });
  if (error) throw error;
  return data as RestoreCheck;
}

export interface RestoreCounts {
  added: number;
  present: number;
  other: number;
  renumbered: number;
  failed: number;
}
export interface RestoreResult {
  bills: RestoreCounts;
  complaints: RestoreCounts;
  links: number;
  settings: boolean;
  error: string | null;
}

const zero = (): RestoreCounts => ({ added: 0, present: 0, other: 0, renumbered: 0, failed: 0 });
const add = (a: RestoreCounts, b: RestoreCounts) => {
  for (const k of Object.keys(a) as (keyof RestoreCounts)[]) a[k] += b[k];
};

/** Adds the missing records, in parts so big backups don't time out. */
export async function restoreBackup(b: BackupFile, onProgress?: (done: number, total: number) => void): Promise<RestoreResult> {
  const result: RestoreResult = { bills: zero(), complaints: zero(), links: 0, settings: false, error: null };
  const parts: { bills: BackupBill[]; complaints: BackupComplaint[] }[] = [];
  for (let i = 0; i < b.complaints.length; i += 500) parts.push({ bills: [], complaints: b.complaints.slice(i, i + 500) });
  for (let i = 0; i < b.bills.length; i += 200) parts.push({ bills: b.bills.slice(i, i + 200), complaints: [] });
  if (!parts.length) parts.push({ bills: [], complaints: [] });
  const total = b.bills.length + b.complaints.length;
  let done = 0;
  for (const [n, part] of parts.entries()) {
    const { data, error } = await supabase.rpc("restore_backup", {
      p_bills: part.bills,
      p_complaints: part.complaints,
      p_settings: n === 0 ? b.settings : null,
    });
    if (error) throw error;
    const r = data as RestoreResult;
    add(result.bills, r.bills);
    add(result.complaints, r.complaints);
    result.links += r.links;
    result.settings ||= r.settings;
    result.error ??= r.error;
    done += part.bills.length + part.complaints.length;
    onProgress?.(done, total);
  }
  // Bring the restored records onto this device (and the others, on their next sync).
  void syncNow().then(notifyDataChanged, () => undefined);
  return result;
}

/** "3 bills and 1 complaint" in the app's language. */
export function countsText(bills: number, complaints: number): string {
  return t("backup.billsAndComplaints", { bills: tn("dashboard.billCount", bills), complaints: tn("lists.complaintCount", complaints) });
}

export function describeBackup(b: BackupFile): string {
  return t("backup.describe", {
    workshop: b.workshop || t("doc.workshop"),
    date: formatDate(b.made_at.slice(0, 10)),
    counts: countsText(b.bills.length, b.complaints.length),
  });
}
