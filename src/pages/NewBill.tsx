import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import BillForm from "../components/BillForm";
import { emptyBill, isBlankItem, type BillDraft } from "../lib/bill";

// Unsaved new bills are kept on this device so a reload, closed tab or dead
// battery doesn't lose what was typed. Saving the bill removes the draft.
const DRAFT_KEY = "workshop-billing:new-bill-draft";

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

function loadDraft(): BillDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
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
    if (looksValid) d.items = d.items.map((i) => ({ ...i, quantity: typeof i.quantity === "string" ? i.quantity : "1" }));
    if (looksValid && (typeof d.discount !== "object" || d.discount === null)) d.discount = emptyBill().discount;
    return looksValid && hasContent(d) ? d : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Details passed in when starting a bill from a complaint or a vehicle's history. */
export type BillPrefill = Partial<Pick<BillDraft, "customerName" | "phone" | "address" | "vehicleReg" | "complaintIds">>;

export default function NewBill() {
  const location = useLocation();
  const navigate = useNavigate();
  const [prefill] = useState(() => (location.state as { prefill?: BillPrefill } | null)?.prefill ?? null);

  const [start, setStart] = useState(() => {
    const draft = loadDraft();
    if (draft) return { draft, restored: true, key: 0 };
    return { draft: { ...emptyBill(), ...prefill }, restored: false, key: 0 };
  });

  // Don't apply the prefill again if the page is reloaded.
  useEffect(() => {
    if (prefill) navigate(location.pathname, { replace: true, state: null });
  }, [prefill, navigate, location.pathname]);

  const saveDraft = useCallback((d: BillDraft) => {
    try {
      if (hasContent(d)) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable: the leave-page warning still protects the bill */
    }
  }, []);

  function startFresh() {
    clearDraft();
    setStart((s) => ({ draft: { ...emptyBill(), ...prefill }, restored: false, key: s.key + 1 }));
  }

  const banner = start.restored ? (
    <div className="alert alert-info">
      <span>We restored a bill you hadn't saved yet.</span>
      <button type="button" className="link-button" onClick={startFresh}>
        {prefill?.complaintIds?.length
          ? "Discard it and start the bill for the selected complaint"
          : prefill
            ? `Discard it and start a bill for ${prefill.vehicleReg}`
            : "Discard it and start a new bill"}
      </button>
    </div>
  ) : null;

  return (
    <BillForm
      key={start.key}
      initial={start.draft}
      title="New bill"
      onChange={saveDraft}
      onSaved={clearDraft}
      banner={banner}
    />
  );
}
