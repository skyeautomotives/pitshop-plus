import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "./supabase";
import { onDataChanged } from "./sync";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; data: T };

/**
 * Runs `load` when `key` changes; ignores results from out-of-date requests.
 * Also reloads quietly (without showing "loading") when the device's data changes,
 * e.g. after a sync brings in bills made on another device.
 */
export function useLoad<T>(key: string, load: () => Promise<T>): LoadState<T> & { retry: () => void } {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [quiet, setQuiet] = useState(0);

  useEffect(() => onDataChanged(() => setQuiet((n) => n + 1)), []);

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

  useEffect(() => {
    if (quiet === 0) return;
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setState({ status: "ok", data });
      })
      .catch(() => {
        /* keep showing what we had */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiet]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
