import { useEffect, useState } from "react";
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
        <strong>{status.last ? `Your last backup was ${age} days ago.` : "You haven't saved a backup yet."}</strong> Keep a copy of
        your records in your Google Drive so they are never lost. <Link to="/settings/backup">Save a backup</Link>
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
        Hide for today
      </button>
    </div>
  );
}
