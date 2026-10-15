import { Link } from "react-router";
import { useSyncState } from "../lib/sync";

function ago(iso: string | null): string {
  if (!iso) return "not yet";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString("en-IN");
}

/** Online / offline / waiting-to-sync indicator. Links to the list of waiting changes. */
export default function SyncStatus({ compact = false }: { compact?: boolean }) {
  const s = useSyncState();
  let tone: "ok" | "busy" | "offline" | "problem";
  let label: string;
  if (s.failed > 0) {
    tone = "problem";
    label = `${s.failed} ${s.failed === 1 ? "change needs" : "changes need"} attention`;
  } else if (s.phase === "offline") {
    tone = "offline";
    label = s.pending > 0 ? `Offline · ${s.pending} waiting` : "Offline";
  } else if (s.phase === "syncing" || s.pending > 0) {
    tone = "busy";
    label = !s.ready ? "Downloading your data…" : s.pending > 0 ? `Syncing ${s.pending}…` : "Syncing…";
  } else if (s.phase === "error") {
    tone = "problem";
    label = "Sync problem";
  } else {
    tone = "ok";
    label = "All changes saved";
  }
  const title = `Last synced ${ago(s.lastSync)}${s.message ? `. ${s.message}` : ""}`;
  return (
    <Link to="/sync" className={`sync-status sync-${tone}${compact ? " sync-compact" : ""}`} title={title}>
      <span className="sync-dot" aria-hidden="true" />
      <span className="sync-label">{label}</span>
    </Link>
  );
}
