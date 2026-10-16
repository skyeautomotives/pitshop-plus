import { Link } from "react-router";
import { isNativeApp, openExternal, SITE_URL } from "../lib/platform";

/** "Terms & Conditions", opened without leaving the page the person is on. */
export default function TermsLink({ children = "Terms & Conditions" }: { children?: string }) {
  if (isNativeApp)
    return (
      <a
        href={`${SITE_URL}terms`}
        onClick={(e) => {
          e.preventDefault();
          void openExternal(`${SITE_URL}terms`);
        }}
      >
        {children}
      </a>
    );
  return (
    <Link to="/terms" target="_blank" rel="noopener">
      {children}
    </Link>
  );
}
