import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { BillNotFound, LoadError } from "../components/states";
import { useShopSettings } from "../lib/shopSettings";
import { useBill } from "../lib/useBill";
import { billMessage, whatsappLink } from "../lib/whatsapp";
import BillPayments from "../components/BillPayments";
import InvoiceDocument, { billParts } from "../components/InvoiceDocument";
import { canPrint, isNativeApp, openExternal } from "../lib/platform";
import { displayNumber } from "../lib/format";
import { errorMessage } from "../lib/supabase";
import { makeBillPdf, type BillPdf } from "../lib/billPdf";
import { savePdf, sendBillPdf, sharePdf } from "../lib/shareBill";

type PdfState =
  | { step: "idle" }
  | { step: "busy" }
  | { step: "saved"; chat: string }
  | { step: "downloaded" }
  | { step: "ready"; pdf: BillPdf; message: string }
  | { step: "failed"; message: string };

export default function BillView() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useShopSettings();
  const state = useBill(id);
  const [justSaved] = useState(() => (location.state as { saved?: boolean } | null)?.saved === true);
  const { t } = useT();
  const [pdfState, setPdfState] = useState<PdfState>({ step: "idle" });

  // Drop the "saved" flag from history so a reload doesn't show the message again.
  useEffect(() => {
    if (justSaved) navigate(location.pathname, { replace: true, state: null });
  }, [justSaved, navigate, location.pathname]);

  if (state.status === "loading") return <p className="page-status">{t("billView.loading")}</p>;
  if (state.status === "not-found") return <BillNotFound />;
  if (state.status === "error") return <LoadError message={state.message} onRetry={state.retry} />;

  const bill = state.bill;
  const { payments, money } = billParts(bill);
  const busy = pdfState.step === "busy";

  async function sendOnWhatsapp() {
    setPdfState({ step: "busy" });
    try {
      const pdf = await makeBillPdf(bill, settings);
      const message = billMessage(bill, settings);
      const result = await sendBillPdf(pdf, message);
      if (result === "saved") setPdfState({ step: "saved", chat: whatsappLink(bill, settings) });
      else if (result === "needs-tap") setPdfState({ step: "ready", pdf, message });
      else setPdfState({ step: "idle" });
    } catch (err) {
      setPdfState({ step: "failed", message: errorMessage(err) });
    }
  }

  async function downloadPdf() {
    setPdfState({ step: "busy" });
    try {
      const saved = await savePdf(await makeBillPdf(bill, settings));
      setPdfState(saved && !isNativeApp ? { step: "downloaded" } : { step: "idle" });
    } catch (err) {
      setPdfState({ step: "failed", message: errorMessage(err) });
    }
  }

  return (
    <div className="bill-page">
      <div className="toolbar no-print">
        <Link to={`/vehicles/${bill.vehicle_reg_key}`} className="back-link">
          {t("billView.historyFor", { reg: bill.vehicle_reg })}
        </Link>
        <div className="toolbar-actions">
          <Link to={`/bills/${bill.id}/edit`} className="btn btn-outline">
            {t("billView.edit")}
          </Link>
          {canPrint && (
            <button type="button" className="btn btn-outline" onClick={() => window.print()}>
              {t("billView.print")}
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={() => void downloadPdf()} disabled={busy}>
            {t("billView.downloadPdf")}
          </button>
          <button type="button" className="btn btn-whatsapp" onClick={() => void sendOnWhatsapp()} disabled={busy}>
            {t("billView.whatsapp")}
          </button>
        </div>
      </div>

      {busy && (
        <p className="alert no-print" role="status">
          {t("billView.preparingPdf")}
        </p>
      )}
      {pdfState.step === "saved" && (
        <div className="alert alert-success no-print" role="status">
          {t("billView.pdfSaved")}{" "}
          <a
            href={pdfState.chat}
            target="_blank"
            rel="noopener noreferrer"
            className="link-button"
            onClick={(e) => {
              if (!isNativeApp) return;
              e.preventDefault();
              void openExternal(pdfState.chat);
            }}
          >
            {t("billView.openChat")}
          </a>
        </div>
      )}
      {pdfState.step === "downloaded" && (
        <div className="alert alert-success no-print" role="status">
          {t("billView.pdfDownloaded")}
        </div>
      )}
      {pdfState.step === "ready" && (
        <div className="alert alert-success no-print" role="status">
          {t("billView.sendReady")}{" "}
          <button
            type="button"
            className="btn btn-whatsapp"
            onClick={() => {
              const { pdf, message } = pdfState;
              void sharePdf(pdf, message).then(
                () => setPdfState({ step: "idle" }),
                (err: unknown) => setPdfState({ step: "failed", message: errorMessage(err) }),
              );
            }}
          >
            {t("billView.sendNow")}
          </button>
        </div>
      )}
      {pdfState.step === "failed" && (
        <div className="alert alert-error no-print" role="alert">
          {t("billView.pdfFailed", { message: pdfState.message })}
        </div>
      )}

      {justSaved && (
        <div className="alert alert-success no-print" role="status">
          {bill.bill_number === null ? t("billView.savedOffline") : t("billView.saved", { number: displayNumber(bill.bill_number) })}{" "}
          <Link to="/bills/new" className="link-button">
            {t("billView.startNew")}
          </Link>
        </div>
      )}
      {!justSaved && bill.pending && (
        <div className="alert first-sync no-print" role="status">
          {t("billView.pendingChanges")}
        </div>
      )}

      <InvoiceDocument bill={bill} settings={settings} />

      <BillPayments billId={bill.id} payments={payments} money={money} />
    </div>
  );
}
