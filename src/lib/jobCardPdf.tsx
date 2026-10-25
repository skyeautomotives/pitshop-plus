import JobCardDocument from "../components/JobCardDocument";
import { t } from "../i18n";
import { documentPdf, type BillPdf } from "./billPdf";
import type { ComplaintRow, ShopSettings } from "./types";

/** The job card as an A4 PDF, in English like bills. */
export function makeJobCardPdf(c: ComplaintRow, settings: ShopSettings | null, showCar: boolean): Promise<BillPdf> {
  const number = c.complaint_number === null ? "new" : String(c.complaint_number);
  const reg = c.vehicle_reg.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const title = `${settings?.shop_name || t("doc.workshop", undefined, "en")} · ${t("doc.jobCard", undefined, "en")} ${number}`;
  return documentPdf(<JobCardDocument complaint={c} settings={settings} showCar={showCar} />, title, `JobCard-${number}${reg ? `-${reg}` : ""}.pdf`);
}
