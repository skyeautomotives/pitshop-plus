import { Link } from "react-router";
import { useT } from "../i18n";

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useT();
  return (
    <div className="alert alert-error" role="alert">
      <span>{t("billView.loadFailed", { message })}</span>
      <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
        {t("common.tryAgain")}
      </button>
    </div>
  );
}

export function BillNotFound() {
  const { t } = useT();
  return (
    <div className="empty">
      <h1>{t("billView.notFoundTitle")}</h1>
      <p>{t("billView.notFoundBody")}</p>
      <Link to="/bills" className="btn btn-primary">
        {t("nav.findBills")}
      </Link>
    </div>
  );
}
