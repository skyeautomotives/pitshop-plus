import { useState } from "react";
import { Link } from "react-router";
import { useLoad } from "../lib/useLoad";
import { discardChange, listWaitingChanges, retryChange, syncNow, useSyncState } from "../lib/sync";

/** Changes made on this device that haven't reached the server, and any the server refused. */
export default function SyncPage() {
  const s = useSyncState();
  const [busy, setBusy] = useState(false);
  const list = useLoad(`waiting|${s.pending}|${s.failed}|${s.phase}`, listWaitingChanges);

  const statusText =
    s.phase === "offline"
      ? "You're offline. Bills and complaints you save are kept on this device and sent when you're back online."
      : s.phase === "syncing"
        ? "Syncing with the server…"
        : s.failed > 0
          ? "The server couldn't accept some changes. Open each one to fix it, then try again."
          : "Everything on this device is saved to the server.";

  async function runSync() {
    setBusy(true);
    await syncNow();
    setBusy(false);
  }

  return (
    <div>
      <h1>Sync</h1>
      <section className="card">
        <div className="card-head">
          <h2>Status</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void runSync()} disabled={busy || s.phase === "offline"}>
            {busy ? "Syncing…" : "Sync now"}
          </button>
        </div>
        <p>{statusText}</p>
        <p className="muted">
          Last synced: {s.lastSync ? new Date(s.lastSync).toLocaleString("en-IN") : "not yet"}
        </p>
      </section>

      <h2 className="results-heading">Waiting to sync</h2>
      {list.status === "ok" && list.data.length === 0 && (
        <div className="empty empty-list">
          <p>Nothing waiting. All your changes are on the server.</p>
        </div>
      )}
      {list.status === "ok" &&
        list.data.map((c) => (
          <div key={c.seq} className={`card sync-item${c.error ? " sync-item-problem" : ""}`}>
            <div className="sync-item-main">
              <strong>{c.title}</strong>
              {c.detail && <span className="muted"> · {c.detail}</span>}
              <p className="muted sync-item-when">Saved on this device {new Date(c.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
              {c.error ? (
                <p className="sync-item-error">The server didn't accept this: {c.error}</p>
              ) : (
                <p className="muted">Waiting for a connection.</p>
              )}
            </div>
            <div className="sync-item-actions">
              <Link
                to={c.kind === "bill" || c.kind === "bill-payment" ? `/bills/${c.entityId}${c.error ? "/edit" : ""}` : `/complaints/${c.entityId}${c.error ? "/edit" : ""}`}
                className="btn btn-outline btn-sm"
              >
                {c.error ? "Fix" : "Open"}
              </Link>
              {c.error && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void retryChange(c.seq)}>
                  Try again
                </button>
              )}
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (window.confirm("Discard this change? It will not be sent to the server.")) void discardChange(c.seq);
                }}
              >
                Discard
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
