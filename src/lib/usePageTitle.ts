import { useEffect } from "react";

const DEFAULT_TITLE = "Pitshop Plus | Workshop billing by Skye Automotives";

/** Sets the browser tab title while the page is shown, e.g. "Sign in | Pitshop Plus". */
export function usePageTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${page} | Pitshop Plus` : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [page]);
}
