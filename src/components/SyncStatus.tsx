import { Link } from "react-router";
import { locale, t, tn, useT } from "../i18n";
import { useSyncState } from "../lib/sync";

function ago(iso: string | null): string {
  if (!iso) return t("sync.notYet");
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t("sync.justNow");
  if (mins < 60) return t("sync.minAgo", { n: mins });
  const hours = Math.round(mins / 60);
  return hours < 24 ? t("sync.hoursAgo", { n: hours }) : new Date(iso).toLocaleDateString(locale());
}

/** Online / offline / waiting-to-sync indicator. Links to the list of waiting changes. */
export default function SyncStatus({ compact = false }: { compact?: boolean }) {
  const s = useSyncState();
  useT();
  let tone: "ok" | "busy" | "offline" | "problem";
  let label: string;
  if (s.failed > 0) {
    tone = "problem";
    label = tn("sync.attention", s.failed);
  } else if (s.phase === "offline") {
    tone = "offline";
    label = s.pending > 0 ? t("sync.offlineWaiting", { n: s.pending }) : t("sync.offline");
  } else if (s.phase === "syncing" || s.pending > 0) {
    tone = "busy";
    label = !s.ready ? t("sync.downloading") : s.pending > 0 ? t("sync.syncingCount", { n: s.pending }) : t("sync.syncing");
  } else if (s.phase === "error") {
    tone = "problem";
    label = t("sync.problem");
  } else {
    tone = "ok";
    label = t("sync.allSaved");
  }
  const title = `${t("sync.lastSynced", { when: ago(s.lastSync) })}${s.message ? `. ${s.message}` : ""}`;
  return (
    <Link to="/sync" className={`sync-status sync-${tone}${compact ? " sync-compact" : ""}`} title={title}>
      <span className="sync-dot" aria-hidden="true" />
      <span className="sync-label">{label}</span>
    </Link>
  );
}
