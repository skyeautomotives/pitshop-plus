import { useEffect } from "react";

const DEFAULT_TITLE = "Pitstop Plus | Workshop billing by Skye Automotives";

/** Sets the browser tab title while the page is shown, e.g. "Sign in | Pitstop Plus". */
export function usePageTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${page} | Pitstop Plus` : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [page]);
}
