import { registerPlugin } from "@capacitor/core";
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

interface WhatsAppSharePlugin {
  sendFile(options: { path: string; phone: string; text: string }): Promise<{ app: string }>;
}
const WhatsAppShare = registerPlugin<WhatsAppSharePlugin>("WhatsAppShare");

/** The website opened on a phone or tablet (not the apps). */
export const isPhoneBrowser = () => !isAndroidApp && !isDesktopApp && /Android|iPhone|iPad/i.test(navigator.userAgent);

/**
 * Sends the bill to the customer on WhatsApp.
 * Android app: WhatsApp opens in the customer's chat with the PDF attached.
 * Website on a phone: the share sheet (a browser can't pick the chat).
 * Computers: the PDF is saved ("saved"), and the caller opens the customer's chat to attach it.
 * `phone` is the customer's number with country code, or null if it can't be used.
 */
export async function sendBillPdf(pdf: BillPdf, message: string, phone: string | null): Promise<SendResult> {
  if (isAndroidApp && phone) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { uri } = await Filesystem.writeFile({ path: pdf.name, data: await base64(pdf.blob), directory: Directory.Cache });
      await WhatsAppShare.sendFile({ path: uri, phone, text: message });
      return "shared";
    } catch {
      // WhatsApp missing or it refused: let the person pick from the share sheet.
    }
  }
  if (isAndroidApp || (isPhoneBrowser() && canShareFile(pdf))) return sharePdf(pdf, message);
  return (await savePdf(pdf)) ? "saved" : "cancelled";
}
