import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  backupStatus,
  checkBackup,
  describeBackup,
  makeBackup,
  readBackupFile,
  recordBackup,
  restoreBackup,
  saveBackupFile,
  type BackupFile,
  type BackupStatus,
  type RestoreCheck,
  type RestoreResult,
} from "../lib/backup";
import { formatDate } from "../lib/format";
import { isAndroidApp, isDesktopApp } from "../lib/platform";
import { useShopSettings } from "../lib/shopSettings";
import { errorMessage } from "../lib/supabase";
import { isNetworkError } from "../lib/sync";

export const BACKUP_SAVED_EVENT = "pitstop:backup-saved";
const DAY = 86_400_000;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function daysAgo(iso: string): number {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(new Date()) - start(new Date(iso))) / DAY);
}

export function lastBackupText(last: string | null): string {
  if (!last) return "No backup saved yet.";
  const days = daysAgo(last);
  const when = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return `Last backup: ${when} (${formatDate(last.slice(0, 10))}).`;
}

const WHERE = isAndroidApp
  ? "After you tap Save a backup, choose Drive to keep the file in your Google Drive."
  : isDesktopApp
    ? "Choose where to save the file. If you have Google Drive on this computer, save it in your Google Drive folder so a copy is also kept online."
    : "The file is downloaded to this computer. Upload it to your Google Drive (drive.google.com) so a copy is also kept online.";

/** Settings: save a backup file, and restore missing records from one. */
export default function BackupSection() {
  const { settings } = useShopSettings();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ kind: "ok" | "error"; text: string; offline?: boolean } | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<BackupFile | null>(null);
  const [check, setCheck] = useState<RestoreCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  useEffect(() => {
    void backupStatus().then(setStatus, () => undefined);
  }, []);

  async function onSave() {
    setSaving(true);
    setSaved(null);
    try {
      const b = await makeBackup(settings);
      if (!(await saveBackupFile(b))) return;
      await recordBackup();
      window.dispatchEvent(new Event(BACKUP_SAVED_EVENT));
      setStatus((s) => ({ shopCreatedAt: null, bills: 0, ...s, last: new Date().toISOString() }));
      setSaved({
        kind: "ok",
        text: `Backup saved: ${count(b.bills.length, "bill", "bills")} and ${count(b.complaints.length, "complaint", "complaints")}.`,
        offline: b.source === "device",
      });
    } catch (err) {
      setSaved({ kind: "error", text: `Couldn't save the backup. ${errorMessage(err)}` });
    } finally {
      setSaving(false);
    }
  }

  async function onChoose(f: File | undefined) {
    setFile(null);
    setCheck(null);
    setResult(null);
    setRestoreError(null);
    if (!f) return;
    setChecking(true);
    try {
      const b = await readBackupFile(f);
      setFile(b);
      setCheck(await checkBackup(b));
    } catch (err) {
      setRestoreError(isNetworkError(err) ? "Connect to the internet to restore a backup." : errorMessage(err));
    } finally {
      setChecking(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onRestore() {
    if (!file) return;
    setRestoreError(null);
    setProgress({ done: 0, total: file.bills.length + file.complaints.length });
    try {
      setResult(await restoreBackup(file, (done, total) => setProgress({ done, total })));
      setCheck(null);
    } catch (err) {
      setRestoreError(
        isNetworkError(err)
          ? "The connection dropped. Choose the file again to restore the rest; nothing will be added twice."
          : `Couldn't restore. ${errorMessage(err)}`,
      );
    } finally {
      setProgress(null);
    }
  }

  const missing = check ? check.bills.missing + check.complaints.missing : 0;
  const otherWorkshop =
    file && settings && file.workshop.trim() && file.workshop.trim().toLowerCase() !== settings.shop_name.trim().toLowerCase();

  return (
    <div className="backup">
      <section className="card">
        <h2>Save a backup</h2>
        <p>
          Saves all your bills, complaints and shop details in one file. Keep it somewhere safe outside Pitshop Plus,
          such as your Google Drive, and save a new one at least once a week.
        </p>
        <p className="hint">{WHERE}</p>
        {status && <p className="backup-last">{lastBackupText(status.last)}</p>}
        {saved && (
          <div className={`alert ${saved.kind === "ok" ? "alert-success" : "alert-error"}`} role={saved.kind === "ok" ? "status" : "alert"}>
            <span>
              {saved.text}
              {saved.offline && (
                <>
                  {" "}
                  You're offline, so it was made from the copy on this device. Changes made on other devices since they
                  last synced aren't in it.
                </>
              )}
            </span>
          </div>
        )}
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "Preparing backup…" : "Save a backup"}
        </button>
      </section>

      <section className="card">
        <h2>Restore from a backup</h2>
        <p>
          Brings back bills and complaints from a backup file that are missing here. Nothing already here is changed or
          deleted, so it is safe to restore the same file more than once.
        </p>
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          id="backup-file"
          {...(isAndroidApp ? {} : { accept: ".json,application/json" })}
          onChange={(e) => void onChoose(e.target.files?.[0])}
        />
        <label htmlFor="backup-file" className={`btn btn-outline${checking || progress ? " disabled" : ""}`} aria-disabled={checking || !!progress}>
          {checking ? "Checking the file…" : "Choose backup file"}
        </label>

        {restoreError && (
          <div className="alert alert-error backup-msg" role="alert">
            {restoreError}
          </div>
        )}

        {file && check && (
          <div className="backup-check">
            <p>
              <strong>{describeBackup(file)}</strong>
            </p>
            {otherWorkshop && (
              <div className="alert sub-reminder backup-msg" role="status">
                This backup is from “{file.workshop}”, not “{settings?.shop_name}”. Make sure it's the right file.
              </div>
            )}
            {missing === 0 ? (
              <div className="alert alert-success backup-msg" role="status">
                Everything in this backup is already here. Nothing needs restoring.
              </div>
            ) : (
              <ul className="backup-list">
                <li>
                  Missing here, will be added:{" "}
                  <strong>
                    {count(check.bills.missing, "bill", "bills")} and {count(check.complaints.missing, "complaint", "complaints")}
                  </strong>
                </li>
                <li>
                  Already here, won't be changed: {count(check.bills.present, "bill", "bills")} and{" "}
                  {count(check.complaints.present, "complaint", "complaints")}
                </li>
                {check.bills.renumbered + check.complaints.renumbered > 0 && (
                  <li>
                    {count(check.bills.renumbered + check.complaints.renumbered, "record has a number", "records have numbers")} now
                    used by newer records, so they will get new numbers.
                  </li>
                )}
                {check.bills.other + check.complaints.other > 0 && (
                  <li>
                    {count(check.bills.other + check.complaints.other, "record belongs", "records belong")} to another workshop
                    and will be skipped.
                  </li>
                )}
              </ul>
            )}
            {missing > 0 && (
              <button type="button" className="btn btn-primary" onClick={onRestore} disabled={!!progress}>
                {progress
                  ? `Restoring… ${progress.done} of ${progress.total}`
                  : `Restore ${count(missing, "missing record", "missing records")}`}
              </button>
            )}
          </div>
        )}

        {result && (
          <div className="alert alert-success backup-msg" role="status">
            <span>
              Restored {count(result.bills.added, "bill", "bills")} and {count(result.complaints.added, "complaint", "complaints")}.
              {result.settings && " Blank shop details were filled in from the backup."}{" "}
              {result.bills.added > 0 && <Link to="/bills">Find bills</Link>}
            </span>
          </div>
        )}
        {result && result.bills.failed + result.complaints.failed > 0 && (
          <div className="alert alert-error backup-msg" role="alert">
            {count(result.bills.failed + result.complaints.failed, "record in the file was", "records in the file were")} damaged
            and couldn't be restored{result.error ? ` (${result.error})` : ""}.
          </div>
        )}
      </section>
    </div>
  );
}
