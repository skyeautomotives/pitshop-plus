import { Link } from "react-router";
import { isNativeApp, openExternal, SITE_URL } from "../lib/platform";

/** The Terms or Privacy page, opened without leaving the page the person is on. */
export default function TermsLink({ children = "Terms & Conditions", page = "terms" }: { children?: string; page?: "terms" | "privacy" }) {
  if (isNativeApp)
    return (
      <a
        href={`${SITE_URL}${page}`}
        onClick={(e) => {
          e.preventDefault();
          void openExternal(`${SITE_URL}${page}`);
        }}
      >
        {children}
      </a>
    );
  return (
    <Link to={`/${page}`} target="_blank" rel="noopener">
      {children}
    </Link>
  );
}
