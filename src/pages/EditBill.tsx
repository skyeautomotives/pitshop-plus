import { useMemo } from "react";
import { t } from "../i18n";
import { useParams } from "react-router";
import BillForm from "../components/BillForm";
import { BillNotFound, LoadError } from "../components/states";
import { billToDraft } from "../lib/bill";
import { useBill } from "../lib/useBill";
import { displayNumber } from "../lib/format";

export default function EditBill() {
  const { id } = useParams();
  const state = useBill(id);
  const initial = useMemo(() => (state.status === "ok" ? billToDraft(state.bill) : null), [state]);

  if (state.status === "loading") return <p className="page-status">{t("billView.loading")}</p>;
  if (state.status === "not-found") return <BillNotFound />;
  if (state.status === "error") return <LoadError message={state.message} onRetry={state.retry} />;
  if (!initial) return null;

  return <BillForm initial={initial} billId={state.bill.id} title={t("billView.editTitle", { number: displayNumber(state.bill.bill_number) })} />;
}
