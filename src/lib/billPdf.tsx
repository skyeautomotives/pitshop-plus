import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import InvoiceDocument from "../components/InvoiceDocument";
import JobCardDocument from "../components/JobCardDocument";
import { t, type Lang } from "../i18n";
import { billCode } from "./format";
import { imagesToPdf, type PdfPage } from "./pdf";
import type { BillWithItems, ComplaintRow, ShopSettings } from "./types";

// The bill is drawn at A4 width (794 CSS px) and saved at 2.5x for sharp text.
const WIDTH = 794;
const PAGE_HEIGHT = (WIDTH * 297) / 210;
const MARGIN = 36;
const FOOTER = 30;
const SCALE = 2.5;

export interface BillPdf {
  blob: Blob;
  name: string;
}

export function billPdfName(bill: BillWithItems, shopName?: string | null): string {
  const reg = bill.vehicle_reg.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const number = bill.bill_number === null ? "new" : billCode(bill.bill_number, shopName);
  return `Bill-${number}${reg ? `-${reg}` : ""}.pdf`;
}

/**
 * Where to start each page (CSS px from the top of the bill), so no row or block
 * marked data-keep is cut in two. A block taller than a page is cut where it must be.
 */
export function pageCuts(total: number, blocks: { top: number; bottom: number }[]): [number, number][] {
  const pages: [number, number][] = [];
  let start = 0;
  while (start < total) {
    const room = (start === 0 ? PAGE_HEIGHT : PAGE_HEIGHT - MARGIN) - FOOTER;
    if (start + room >= total) {
      pages.push([start, total]);
      break;
    }
    let end = start + room;
    for (let moved = true; moved; ) {
      moved = false;
      for (const b of blocks) {
        if (b.top > start && b.top < end && b.bottom > end) {
          end = b.top;
          moved = true;
        }
      }
    }
    if (end - start < room / 4) end = start + room;
    pages.push([start, end]);
    start = end;
  }
  return pages;
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error("Couldn't draw the page."))),
      "image/jpeg",
      0.9,
    ),
  );
}

/**
 * Makes the customer's bill as an A4 PDF, followed by the job card of each complaint
 * it addresses. Bills are always in English.
 */
export async function makeBillPdf(bill: BillWithItems, settings: ShopSettings | null, jobCards: ComplaintRow[] = []): Promise<BillPdf> {
  const lang: Lang = "en";
  const title = `${settings?.shop_name || t("doc.workshop", undefined, lang)} · ${t("doc.bill", { number: billCode(bill.bill_number, settings?.shop_name) }, lang)}`;
  const pages = await drawPages(<InvoiceDocument bill={bill} settings={settings} pdf />);
  for (const c of jobCards) {
    const showCar = settings?.vehicle_type === "car" || (c.car_marks ?? []).length > 0;
    pages.push(...(await drawPages(<JobCardDocument complaint={c} settings={settings} showCar={showCar} />)));
  }
  return pdfFile(pages, title, billPdfName(bill, settings?.shop_name));
}

/** Draws a printable document (an A4-wide sheet) and saves it as a PDF, cut into pages. */
export async function documentPdf(doc: ReactElement, title: string, name: string): Promise<BillPdf> {
  return pdfFile(await drawPages(doc), title, name);
}

function pdfFile(pages: PdfPage[], title: string, name: string): BillPdf {
  const bytes = imagesToPdf(pages, title);
  return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), name };
}

/** Draws a printable document (an A4-wide sheet) as A4 page images. */
async function drawPages(doc: ReactElement): Promise<PdfPage[]> {
  const lang: Lang = "en";
  const { default: html2canvas } = await import("html2canvas-pro");

  const host = document.createElement("div");
  host.className = "invoice-pdf-host";
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(doc));
    const sheet = host.firstElementChild as HTMLElement;
    await Promise.all([
      document.fonts.ready,
      ...[...sheet.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((done) => (img.onload = img.onerror = done)))),
    ]);
    const top = sheet.getBoundingClientRect().top;
    const blocks = [...sheet.querySelectorAll("[data-keep]")].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - top, bottom: r.bottom - top };
    });
    const total = sheet.offsetHeight;

    const drawn = await html2canvas(sheet, {
      scale: SCALE,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 1200,
      onclone: (doc) => {
        const copy = doc.querySelector<HTMLElement>(".invoice-pdf-host");
        if (copy) copy.style.left = "0";
      },
    });

    const cuts = pageCuts(total, blocks);
    const pages: PdfPage[] = [];
    for (const [i, [from, to]] of cuts.entries()) {
      const page = document.createElement("canvas");
      page.width = Math.round(WIDTH * SCALE);
      page.height = Math.round(PAGE_HEIGHT * SCALE);
      const ctx = page.getContext("2d");
      if (!ctx) throw new Error("Couldn't draw the page.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, page.width, page.height);
      const y = i === 0 ? 0 : MARGIN;
      const h = Math.min((to - from) * SCALE, drawn.height - from * SCALE);
      ctx.drawImage(drawn, 0, from * SCALE, drawn.width, h, 0, y * SCALE, page.width, h);
      if (cuts.length > 1) {
        ctx.fillStyle = "#6b7280";
        ctx.font = `${11 * SCALE}px Inter, "Noto Sans", "Nirmala UI", sans-serif`;
        ctx.textAlign = "right";
        ctx.fillText(t("doc.page", { n: i + 1, total: cuts.length }, lang), page.width - MARGIN * SCALE, page.height - 16 * SCALE);
      }
      pages.push({ jpeg: await toJpeg(page), width: page.width, height: page.height });
    }

    return pages;
  } finally {
    root.unmount();
    host.remove();
  }
}
