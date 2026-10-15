import { useEffect, useRef } from "react";
import { useBlocker } from "react-router";
import ConfirmDialog from "../components/ConfirmDialog";

/**
 * Warns before leaving a form with unsaved changes: in-app navigation shows a
 * confirmation dialog, closing or reloading the tab shows the browser prompt.
 * Call `allowLeave()` right before navigating away after a successful save.
 */
export function useUnsavedGuard(dirty: boolean, message: string) {
  const leaving = useRef(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const dialog =
    blocker.state === "blocked" ? (
      <ConfirmDialog
        title="Leave without saving?"
        message={message}
        cancelLabel="Stay and finish"
        confirmLabel="Leave"
        onCancel={() => blocker.reset()}
        onConfirm={() => blocker.proceed()}
      />
    ) : null;

  return {
    dialog,
    allowLeave: () => {
      leaving.current = true;
    },
  };
}
