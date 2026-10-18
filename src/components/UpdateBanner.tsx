import { useState } from "react";
import { useT } from "../i18n";
import { isAndroidApp } from "../lib/platform";
import { downloadUpdate, useUpdateAvailable } from "../lib/updates";

/** In the Windows and Android apps: shown when a newer version is on the website. */
export default function UpdateBanner() {
  const update = useUpdateAvailable();
  const [started, setStarted] = useState(false);
  const { t } = useT();
  if (!update) return null;
  return (
    <div className="alert update-banner no-print" role="status">
      <span>
        <strong>{t("update.available", { version: update.version })}</strong>{" "}
        {started ? (isAndroidApp ? t("update.afterDownloadAndroid") : t("update.afterDownloadWindows")) : t("update.prompt")}
      </span>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => {
          setStarted(true);
          void downloadUpdate();
        }}
      >
        {started ? t("update.downloadAgain") : t("update.updateNow")}
      </button>
    </div>
  );
}
