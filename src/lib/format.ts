import { locale, t, type Lang } from "../i18n";
/** yyyy-mm-dd as "14 Oct 2026". */
export function formatDate(iso: string | null | undefined, lang?: Lang): string {
  if (!iso) return "-";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale(lang), { day: "2-digit", month: "short", year: "numeric" });
}

/** "#57", or "(waiting to sync)" for a bill or complaint saved offline that the server hasn't numbered yet. */
export function displayNumber(n: number | null | undefined, lang?: Lang): string {
  return n === null || n === undefined ? t("common.waitingToSync", undefined, lang) : `#${n}`;
}

const SKIP_WORDS = new Set(["AND", "THE", "OF", "N"]);

/**
 * A short code from the workshop name, put before bill numbers on bills:
 * "Sharma Motors" is SM, "Ravi Motors & Sons" is RMS, "Skyline" is SKY.
 * Empty if the name has no English letters.
 */
export function shopCode(name: string | null | undefined): string {
  const words = (name ?? "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w && !SKIP_WORDS.has(w));
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3);
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join("");
}

/** The bill number as printed on the customer's bill, e.g. SM-0012. */
export function billCode(n: number | null | undefined, shopName: string | null | undefined): string {
  if (n === null || n === undefined) return displayNumber(n, "en");
  const code = shopCode(shopName);
  const num = String(n).padStart(4, "0");
  return code ? `${code}-${num}` : num;
}

/** For sorting by number: records not numbered yet count as the newest. */
export function seqNumber(n: number | null | undefined): number {
  return n === null || n === undefined ? Number.MAX_SAFE_INTEGER : n;
}
