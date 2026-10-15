import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "./supabase";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; data: T };

/** Runs `load` when `key` changes; ignores results from out-of-date requests. */
export function useLoad<T>(key: string, load: () => Promise<T>): LoadState<T> & { retry: () => void } {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    load()
      .then((data) => {
        if (!cancelled) setState({ status: "ok", data });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
    // `load` is recreated each render; `key` captures what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
