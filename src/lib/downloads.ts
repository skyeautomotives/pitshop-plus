// Downloads are served from the Pitshop Plus website (copied there from each release),
// together with downloads/latest.json describing the current version.
import { SITE_URL } from "./platform";

const BASE = `${SITE_URL}downloads/`;

export const DOWNLOADS = {
  windows: `${BASE}PitshopPlus-Setup.exe`,
  android: `${BASE}PitshopPlus.apk`,
  manifest: `${BASE}latest.json`,
};

export interface ReleaseInfo {
  /** e.g. "0.2.1" */
  version: string;
  /** ISO date the version was published. */
  published: string;
  /** Sizes in bytes, when known. */
  windowsSize?: number;
  androidSize?: number;
}

/** The current version on the website, or null when it can't be read (e.g. offline). */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(DOWNLOADS.manifest, { cache: "no-store" });
    if (!res.ok) return null;
    const info = (await res.json()) as Partial<ReleaseInfo>;
    return info.version ? (info as ReleaseInfo) : null;
  } catch {
    return null;
  }
}

/** "2.3 MB" */
export function formatSize(bytes: number | undefined): string | null {
  return bytes ? `${(bytes / 1048576).toFixed(1)} MB` : null;
}
