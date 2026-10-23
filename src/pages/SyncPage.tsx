import { useState } from "react";
import { locale, useLang, useT } from "../i18n";
import { Link } from "react-router";
import { useLoad } from "../lib/useLoad";
import { discardChange, listWaitingChanges, retryChange, syncNow, useSyncState } from "../lib/sync";

/** Changes made on this device that haven't reached the server, and any the server refused. */
export default function SyncPage() {
  const s = useSyncState();
  const [busy, setBusy] = useState(false);
  const [lang] = useLang();
  const list = useLoad(`waiting|${s.pending}|${s.failed}|${s.phase}|${lang}`, listWaitingChanges);
  const { t } = useT();

  const statusText =
    s.phase === "offline"
      ? t("syncPage.offline")
      : s.phase === "syncing"
        ? t("syncPage.syncing")
        : s.failed > 0
          ? t("syncPage.refused")
          : t("syncPage.allSaved");

  async function runSync() {
    setBusy(true);
    await syncNow();
    setBusy(false);
  }

  return (
    <div>
      <h1>{t("syncPage.title")}</h1>
      <section className="card">
        <div className="card-head">
          <h2>{t("syncPage.status")}</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void runSync()} disabled={busy || s.phase === "offline"}>
            {busy ? t("sync.syncing") : t("syncPage.syncNow")}
          </button>
        </div>
        <p>{statusText}</p>
        <p className="muted">
          {t("syncPage.lastSynced", { when: s.lastSync ? new Date(s.lastSync).toLocaleString(locale()) : t("sync.notYet") })}
        </p>
      </section>

      <h2 className="results-heading">{t("syncPage.waiting")}</h2>
      {list.status === "ok" && list.data.length === 0 && (
        <div className="empty empty-list">
          <p>{t("syncPage.nothingWaiting")}</p>
        </div>
      )}
      {list.status === "ok" &&
        list.data.map((c) => (
          <div key={c.seq} className={`card sync-item${c.error ? " sync-item-problem" : ""}`}>
            <div className="sync-item-main">
              <strong>{c.title}</strong>
              {c.detail && <span className="muted"> · {c.detail}</span>}
              <p className="muted sync-item-when">
                {t("syncPage.savedOn", { when: new Date(c.createdAt).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }) })}
              </p>
              {c.error ? (
                <p className="sync-item-error">{t("syncPage.notAccepted", { message: c.error })}</p>
              ) : (
                <p className="muted">{t("syncPage.waitingConnection")}</p>
              )}
            </div>
            <div className="sync-item-actions">
              <Link
                to={c.kind === "bill" || c.kind === "bill-payment" || c.kind === "bill-credit" ? `/bills/${c.entityId}${c.error ? "/edit" : ""}` : `/complaints/${c.entityId}${c.error ? "/edit" : ""}`}
                className="btn btn-outline btn-sm"
              >
                {c.error ? t("syncPage.fix") : t("syncPage.open")}
              </Link>
              {c.error && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void retryChange(c.seq)}>
                  {t("common.tryAgain")}
                </button>
              )}
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (window.confirm(t("syncPage.discardConfirm"))) void discardChange(c.seq);
                }}
              >
                {t("syncPage.discard")}
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
