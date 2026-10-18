import { locale, t } from "../i18n";
/** yyyy-mm-dd as "14 Oct 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale(), { day: "2-digit", month: "short", year: "numeric" });
}

/** "#57", or "(waiting to sync)" for a bill or complaint saved offline that the server hasn't numbered yet. */
export function displayNumber(n: number | null | undefined): string {
  return n === null || n === undefined ? t("common.waitingToSync") : `#${n}`;
}

/** For sorting by number: records not numbered yet count as the newest. */
export function seqNumber(n: number | null | undefined): number {
  return n === null || n === undefined ? Number.MAX_SAFE_INTEGER : n;
}
