import { t } from "../i18n";
import type { BillPdf } from "./billPdf";
import { isAndroidApp, isDesktopApp } from "./platform";

/**
 * shared: handed to the share sheet (WhatsApp, etc.).
 * saved: the file was saved; the person attaches it themselves.
 * cancelled: they closed the share sheet or save dialog.
 * needs-tap: the browser wants a fresh tap before it opens the share sheet.
 */
export type SendResult = "shared" | "saved" | "cancelled" | "needs-tap";

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const isCancel = (err: unknown) => {
  const e = err as { name?: string; message?: string } | null;
  return e?.name === "AbortError" || /cancel/i.test(e?.message ?? "");
};

/** True where the share sheet can take a file (phones, and most browsers on Windows). */
export function canShareFile(pdf: BillPdf): boolean {
  if (isAndroidApp) return true;
  if (isDesktopApp || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File([pdf.blob], pdf.name, { type: "application/pdf" })] });
  } catch {
    return false;
  }
}

/** Opens the share sheet with the PDF and a short message. */
export async function sharePdf(pdf: BillPdf, message: string): Promise<SendResult> {
  try {
    if (isAndroidApp) {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const { uri } = await Filesystem.writeFile({ path: pdf.name, data: await base64(pdf.blob), directory: Directory.Cache });
      await Share.share({ title: pdf.name, text: message, files: [uri], dialogTitle: t("billView.shareTitle") });
      return "shared";
    }
    const file = new File([pdf.blob], pdf.name, { type: "application/pdf" });
    await navigator.share({ files: [file], text: message, title: pdf.name });
    return "shared";
  } catch (err) {
    if (isCancel(err)) return "cancelled";
    if ((err as { name?: string })?.name === "NotAllowedError") return "needs-tap";
    throw err;
  }
}

/** Saves the PDF: a save dialog in the Windows app, a download on the website. Returns false if cancelled. */
export async function savePdf(pdf: BillPdf): Promise<boolean> {
  if (isDesktopApp) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: pdf.name, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!path) return false;
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    await writeFile(path, new Uint8Array(await pdf.blob.arrayBuffer()));
    return true;
  }
  if (isAndroidApp) return (await sharePdf(pdf, "")) === "shared";
  const url = URL.createObjectURL(pdf.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdf.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/**
 * Sends the bill on WhatsApp. Where the share sheet can take a file, it opens with the PDF.
 * Otherwise the PDF is saved, for the person to attach in the customer's chat.
 */
export async function sendBillPdf(pdf: BillPdf, message: string): Promise<SendResult> {
  if (canShareFile(pdf)) return sharePdf(pdf, message);
  return (await savePdf(pdf)) ? "saved" : "cancelled";
}
