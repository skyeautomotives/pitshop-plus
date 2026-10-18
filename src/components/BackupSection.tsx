import { useEffect, useRef, useState } from "react";
import { countsText } from "../lib/backup";
import { t, useT, type Key } from "../i18n";
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

export function daysAgo(iso: string): number {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(new Date()) - start(new Date(iso))) / DAY);
}

export function lastBackupText(last: string | null): string {
  if (!last) return t("backup.none");
  const days = daysAgo(last);
  const when = days <= 0 ? t("backup.today") : days === 1 ? t("backup.yesterday") : t("backup.daysAgo", { n: days });
  return t("backup.last", { when, date: formatDate(last.slice(0, 10)) });
}

const WHERE: Key = isAndroidApp ? "backup.whereAndroid" : isDesktopApp ? "backup.whereWindows" : "backup.whereWeb";

/** Settings: save a backup file, and restore missing records from one. */
export default function BackupSection() {
  const { settings } = useShopSettings();
  const { tn } = useT();
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
        text: t("backup.saved", { counts: countsText(b.bills.length, b.complaints.length) }),
        offline: b.source === "device",
      });
    } catch (err) {
      setSaved({ kind: "error", text: t("backup.saveFailed", { message: errorMessage(err) }) });
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
      setRestoreError(isNetworkError(err) ? t("backup.needInternet") : errorMessage(err));
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
        isNetworkError(err) ? t("backup.dropped") : t("backup.restoreFailed", { message: errorMessage(err) }),
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
        <h2>{t("backup.saveTitle")}</h2>
        <p>{t("backup.saveBody")}</p>
        <p className="hint">{t(WHERE)}</p>
        {status && <p className="backup-last">{lastBackupText(status.last)}</p>}
        {saved && (
          <div className={`alert ${saved.kind === "ok" ? "alert-success" : "alert-error"}`} role={saved.kind === "ok" ? "status" : "alert"}>
            <span>
              {saved.text}
              {saved.offline && ` ${t("backup.offlineNote")}`}
            </span>
          </div>
        )}
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? t("backup.preparing") : t("backup.saveTitle")}
        </button>
      </section>

      <section className="card">
        <h2>{t("backup.restoreTitle")}</h2>
        <p>{t("backup.restoreBody")}</p>
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          id="backup-file"
          {...(isAndroidApp ? {} : { accept: ".json,application/json" })}
          onChange={(e) => void onChoose(e.target.files?.[0])}
        />
        <label htmlFor="backup-file" className={`btn btn-outline${checking || progress ? " disabled" : ""}`} aria-disabled={checking || !!progress}>
          {checking ? t("backup.checking") : t("backup.choose")}
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
                {t("backup.otherWorkshop", { file: file.workshop, shop: settings?.shop_name ?? "" })}
              </div>
            )}
            {missing === 0 ? (
              <div className="alert alert-success backup-msg" role="status">
                {t("backup.nothingMissing")}
              </div>
            ) : (
              <ul className="backup-list">
                <li>
                  <strong>{t("backup.willAdd", { counts: countsText(check.bills.missing, check.complaints.missing) })}</strong>
                </li>
                <li>{t("backup.alreadyHere", { counts: countsText(check.bills.present, check.complaints.present) })}</li>
                {check.bills.renumbered + check.complaints.renumbered > 0 && (
                  <li>{tn("backup.renumbered", check.bills.renumbered + check.complaints.renumbered)}</li>
                )}
                {check.bills.other + check.complaints.other > 0 && <li>{tn("backup.otherShop", check.bills.other + check.complaints.other)}</li>}
              </ul>
            )}
            {missing > 0 && (
              <button type="button" className="btn btn-primary" onClick={onRestore} disabled={!!progress}>
                {progress ? t("backup.restoring", { done: progress.done, total: progress.total }) : tn("backup.restoreButton", missing)}
              </button>
            )}
          </div>
        )}

        {result && (
          <div className="alert alert-success backup-msg" role="status">
            <span>
              {t("backup.restored", { counts: countsText(result.bills.added, result.complaints.added) })}
              {result.settings && t("backup.filledDetails")}{" "}
              {result.bills.added > 0 && <Link to="/bills">{t("nav.findBills")}</Link>}
            </span>
          </div>
        )}
        {result && result.bills.failed + result.complaints.failed > 0 && (
          <div className="alert alert-error backup-msg" role="alert">
            {tn("backup.damaged", result.bills.failed + result.complaints.failed)}
            {result.error ? ` (${result.error})` : ""}
          </div>
        )}
      </section>
    </div>
  );
}
