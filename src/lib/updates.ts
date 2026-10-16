// "Update available" for the Windows and Android apps. The website is always up to date.
// Checks the version published on the website when the app starts and every 6 hours.
import { useEffect, useState } from "react";
import { DOWNLOADS, fetchLatestRelease } from "./downloads";
import { isAndroidApp, isDesktopApp, isNativeApp, openExternal } from "./platform";

export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? "0.0.0";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** True when version `a` is newer than `b` ("0.10.0" > "0.9.3"). Tags may start with "v". */
export function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/i, "").split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

export interface UpdateInfo {
  version: string;
}

async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isNativeApp || !navigator.onLine) return null;
  const latest = await fetchLatestRelease();
  return latest && isNewer(latest.version, APP_VERSION) ? { version: latest.version.replace(/^v/i, "") } : null;
}

/** The newer version available for this app, if any. */
export function useUpdateAvailable(): UpdateInfo | null {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    if (!isNativeApp) return;
    let cancelled = false;
    const run = () => void checkForUpdate().then((u) => !cancelled && setUpdate(u));
    run();
    const timer = setInterval(run, CHECK_EVERY_MS);
    window.addEventListener("online", run);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("online", run);
    };
  }, []);
  return update;
}

/** Downloads the new installer (Windows) or APK (Android) through the system browser. */
export function downloadUpdate(): Promise<void> {
  return openExternal(isDesktopApp ? DOWNLOADS.windows : isAndroidApp ? DOWNLOADS.android : DOWNLOADS.windows);
}
