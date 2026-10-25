import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { BillNotFound, LoadError } from "../components/states";
import { useShopSettings } from "../lib/shopSettings";
import { useBill } from "../lib/useBill";
import { billMessage, whatsappLink, whatsappNumber } from "../lib/whatsapp";
import BillPayments from "../components/BillPayments";
import InvoiceDocument, { billParts } from "../components/InvoiceDocument";
import { canPrint, isDesktopApp, isNativeApp, openExternal } from "../lib/platform";
import { displayNumber } from "../lib/format";
import { errorMessage } from "../lib/supabase";
import { makeBillPdf, type BillPdf } from "../lib/billPdf";
import { isPhoneBrowser, openWhatsAppChat, savePdf, sendBillPdf, sharePdf } from "../lib/shareBill";

type PdfState =
  | { step: "idle" }
  | { step: "busy" }
  | { step: "saved"; chat: string }
  | { step: "downloaded" }
  | { step: "ready"; pdf: BillPdf; message: string }
  | { step: "attach"; pdf: BillPdf; phone: string; app: string }
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

  // Android app: after the customer's chat was opened, send the PDF there as soon as the person comes back.
  const wentAway = useRef(false);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") wentAway.current = true;
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);
  useEffect(() => {
    if (pdfState.step !== "attach") return;
    const { pdf, phone, app } = pdfState;
    let away = wentAway.current || document.visibilityState === "hidden";
    // Already back (the app may pause before this runs).
    if (away && document.visibilityState === "visible") return sendAttached(pdf, phone, app);
    const onChange = () => {
      if (document.visibilityState === "hidden") away = true;
      else if (away) sendAttached(pdf, phone, app);
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [pdfState]);

  function sendAttached(pdf: BillPdf, phone: string, app: string) {
    setPdfState({ step: "idle" });
    sendBillPdf(pdf, "", phone, app).catch((err: unknown) => setPdfState({ step: "failed", message: errorMessage(err) }));
  }

  if (state.status === "loading") return <p className="page-status">{t("billView.loading")}</p>;
  if (state.status === "not-found") return <BillNotFound />;
  if (state.status === "error") return <LoadError message={state.message} onRetry={state.retry} />;

  const bill = state.bill;
  const { payments, money } = billParts(bill);
  const busy = pdfState.step === "busy";

  async function sendOnWhatsapp() {
    const chat = whatsappLink(bill, settings);
    // On a computer's browser, open the customer's chat now, while the click still counts (or it is blocked).
    const tab = !isNativeApp && !isPhoneBrowser() ? window.open("about:blank", "_blank") : null;
    setPdfState({ step: "busy" });
    try {
      const pdf = await makeBillPdf(bill, settings);
      const message = billMessage(bill, settings);
      const phone = whatsappNumber(bill.phone);
      // Android app: open the right chat first (WhatsApp can't attach a file to an unsaved number's chat).
      wentAway.current = false;
      const app = phone ? await openWhatsAppChat(phone, message) : null;
      if (phone && app) {
        setPdfState({ step: "attach", pdf, phone, app });
        return;
      }
      const result = await sendBillPdf(pdf, message, phone);
      if (result === "saved") {
        if (tab) tab.location.href = chat;
        else if (isDesktopApp) await openExternal(chat);
        setPdfState({ step: "saved", chat });
        return;
      }
      tab?.close();
      if (result === "needs-tap") setPdfState({ step: "ready", pdf, message });
      else setPdfState({ step: "idle" });
    } catch (err) {
      tab?.close();
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
        <Link to={bill.vehicle_reg_key ? `/vehicles/${bill.vehicle_reg_key}` : "/bills"} className="back-link">
          {bill.vehicle_reg_key ? t("billView.historyFor", { reg: bill.vehicle_reg }) : t("history.back")}
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
      {pdfState.step === "attach" && (
        <div className="alert alert-success no-print" role="status">
          {t("billView.chatOpened", { name: bill.customer_name })}{" "}
          <button
            type="button"
            className="btn btn-whatsapp"
            onClick={() => sendAttached(pdfState.pdf, pdfState.phone, pdfState.app)}
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

      <BillPayments
        billId={bill.id}
        payments={payments}
        money={money}
        credit={{ dueOn: bill.credit_due_on ?? null, note: bill.credit_note ?? null, remindedOn: bill.credit_reminded_on ?? null }}
      />
    </div>
  );
}
