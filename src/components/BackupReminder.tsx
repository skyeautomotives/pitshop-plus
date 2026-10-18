import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { Link, useLocation } from "react-router";
import { backupStatus, type BackupStatus } from "../lib/backup";
import { BACKUP_SAVED_EVENT, daysAgo } from "./BackupSection";

const REMIND_AFTER_DAYS = 7;
const dismissKey = () => `pitstop:backup-reminder:${new Date().toISOString().slice(0, 10)}`;

/** For workshop owners: a nudge to save a backup when the last one is over a week old. */
export default function BackupReminder() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return !!localStorage.getItem(dismissKey());
    } catch {
      return false;
    }
  });
  const { pathname } = useLocation();
  const { t } = useT();

  useEffect(() => {
    const load = () => void backupStatus().then(setStatus, () => undefined);
    load();
    window.addEventListener(BACKUP_SAVED_EVENT, load);
    return () => window.removeEventListener(BACKUP_SAVED_EVENT, load);
  }, []);

  if (!status || hidden || status.bills === 0 || pathname.startsWith("/settings/backup")) return null;
  const age = status.last ? daysAgo(status.last) : status.shopCreatedAt ? daysAgo(status.shopCreatedAt) : 0;
  if (age < REMIND_AFTER_DAYS) return null;

  return (
    <div className="alert sub-reminder backup-reminder no-print" role="status">
      <span>
        <strong>{status.last ? t("backup.reminderDays", { n: age }) : t("backup.reminderNever")}</strong> {t("backup.reminderBody")}{" "}
        <Link to="/settings/backup">{t("backup.reminderLink")}</Link>
      </span>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          try {
            localStorage.setItem(dismissKey(), "1");
          } catch {
            /* storage unavailable */
          }
          setHidden(true);
        }}
      >
        {t("backup.hideToday")}
      </button>
    </div>
  );
}
