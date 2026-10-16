import { useState } from "react";
import { isAndroidApp } from "../lib/platform";
import { downloadUpdate, useUpdateAvailable } from "../lib/updates";

/** In the Windows and Android apps: shown when a newer version is on the website. */
export default function UpdateBanner() {
  const update = useUpdateAvailable();
  const [started, setStarted] = useState(false);
  if (!update) return null;
  return (
    <div className="alert update-banner no-print" role="status">
      <span>
        <strong>Pitstop Plus {update.version} is available.</strong>{" "}
        {started
          ? isAndroidApp
            ? "When the download finishes, open it and tap Install. Your data is kept."
            : "When the download finishes, run it to update. Your data is kept."
          : "Update to get the latest improvements. Your data is kept."}
      </span>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => {
          setStarted(true);
          void downloadUpdate();
        }}
      >
        {started ? "Download again" : "Update now"}
      </button>
    </div>
  );
}
