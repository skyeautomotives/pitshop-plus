import { useCallback, useEffect, useState } from "react";
import { t, useT } from "../i18n";
import { useLocation, useNavigate } from "react-router";
import BillForm from "../components/BillForm";
import { emptyBill, isBlankItem, type BillDraft } from "../lib/bill";

// Unsaved new bills are kept on this device so a reload, closed tab or dead
// battery doesn't lose what was typed. Saving the bill removes the draft.
const DRAFT_KEYS = { bill: "workshop-billing:new-bill-draft", sale: "workshop-billing:direct-sale-draft" };
type Mode = keyof typeof DRAFT_KEYS;

function hasContent(d: BillDraft): boolean {
  return Boolean(
    d.customerName.trim() ||
      d.phone.trim() ||
      d.address.trim() ||
      d.vehicleReg.trim() ||
      d.expectedPickup ||
      d.labour.trim() ||
      d.painting.selected ||
      d.washing.selected ||
      d.complaintIds?.length ||
      d.items.some((i) => !isBlankItem(i)),
  );
}

function loadDraft(mode: Mode): BillDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEYS[mode]);
    if (!raw) return null;
    const d = JSON.parse(raw) as BillDraft;
    const looksValid =
      typeof d.customerName === "string" &&
      Array.isArray(d.items) &&
      d.items.every((i) => typeof i.key === "string" && typeof i.description === "string" && typeof i.price === "string") &&
      typeof d.painting?.selected === "boolean" &&
      typeof d.washing?.selected === "boolean";
    // Drafts saved by older versions lack newer fields.
    if (looksValid && !Array.isArray(d.complaintIds)) d.complaintIds = [];
    if (looksValid && typeof d.deliveredOn !== "string") d.deliveredOn = emptyBill().deliveredOn;
    if (looksValid)
      d.items = d.items.map((i) => ({
        ...i,
        quantity: typeof i.quantity === "string" ? i.quantity : "1",
        gstRate: typeof i.gstRate === "string" ? i.gstRate : "18",
        hsn: typeof i.hsn === "string" ? i.hsn : "",
      }));
    if (looksValid && d.gstMode !== "exclusive" && d.gstMode !== "inclusive") d.gstMode = null;
    if (looksValid && typeof d.customerGstin !== "string") d.customerGstin = "";
    if (looksValid && typeof d.serviceGstRate !== "string") d.serviceGstRate = "18";
    if (looksValid && (typeof d.discount !== "object" || d.discount === null)) d.discount = emptyBill().discount;
    return looksValid && hasContent(d) ? d : null;
  } catch {
    return null;
  }
}

function clearDraft(mode: Mode) {
  try {
    localStorage.removeItem(DRAFT_KEYS[mode]);
  } catch {
    /* storage unavailable */
  }
}

/** Details passed in when starting a bill from a complaint or a vehicle's history. */
export type BillPrefill = Partial<Pick<BillDraft, "customerName" | "phone" | "address" | "vehicleReg" | "complaintIds">>;

/** New bill, or a direct sale (/bills/new?type=sale): the same bill without the complaint step. */
export default function NewBill() {
  const location = useLocation();
  const mode: Mode = new URLSearchParams(location.search).get("type") === "sale" ? "sale" : "bill";
  return <NewBillForm key={mode} mode={mode} />;
}

function NewBillForm({ mode }: { mode: Mode }) {
  useT();
  const location = useLocation();
  const navigate = useNavigate();
  const [prefill] = useState(() => (location.state as { prefill?: BillPrefill } | null)?.prefill ?? null);
  const fresh = (): BillDraft => (mode === "sale" ? { ...emptyBill(), ...prefill, complaintIds: [] } : { ...emptyBill(), ...prefill });

  const [start, setStart] = useState(() => {
    const draft = loadDraft(mode);
    if (draft) return { draft: mode === "sale" ? { ...draft, complaintIds: [] } : draft, restored: true, key: 0 };
    return { draft: fresh(), restored: false, key: 0 };
  });

  // Don't apply the prefill again if the page is reloaded.
  useEffect(() => {
    if (prefill) navigate(location.pathname + location.search, { replace: true, state: null });
  }, [prefill, navigate, location.pathname, location.search]);

  const saveDraft = useCallback((d: BillDraft) => {
    try {
      if (hasContent(d)) localStorage.setItem(DRAFT_KEYS[mode], JSON.stringify(d));
      else localStorage.removeItem(DRAFT_KEYS[mode]);
    } catch {
      /* storage unavailable: the leave-page warning still protects the bill */
    }
  }, [mode]);

  function startFresh() {
    clearDraft(mode);
    setStart((s) => ({ draft: fresh(), restored: false, key: s.key + 1 }));
  }

  const banner = start.restored ? (
    <div className="alert alert-info">
      <span>{t("billView.restored")}</span>
      <button type="button" className="link-button" onClick={startFresh}>
        {prefill?.complaintIds?.length
          ? t("billView.discardForComplaint")
          : prefill
            ? t("billView.discardForVehicle", { reg: prefill.vehicleReg ?? "" })
            : t("billView.discardNew")}
      </button>
    </div>
  ) : null;

  return (
    <BillForm
      key={start.key}
      initial={start.draft}
      title={mode === "sale" ? t("nav.directSale") : t("nav.newBill")}
      directSale={mode === "sale"}
      onChange={saveDraft}
      onSaved={() => clearDraft(mode)}
      banner={banner}
    />
  );
}
