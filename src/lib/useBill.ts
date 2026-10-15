import { useCallback, useEffect, useState } from "react";
import { getBill } from "./api";
import { errorMessage } from "./supabase";
import type { BillWithItems } from "./types";

export type BillState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not-found" }
  | { status: "ok"; bill: BillWithItems };

/** Loads one bill with its items. */
export function useBill(id: string | undefined): BillState & { retry: () => void } {
  const [state, setState] = useState<BillState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    if (!id) {
      setState({ status: "not-found" });
      return;
    }
    getBill(id)
      .then((bill) => {
        if (!cancelled) setState(bill ? { status: "ok", bill } : { status: "not-found" });
      })
      .catch((err) => {
        // An id that isn't a valid uuid can't match any bill.
        const e = err as { code?: string };
        if (!cancelled) setState(e.code === "22P02" ? { status: "not-found" } : { status: "error", message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
