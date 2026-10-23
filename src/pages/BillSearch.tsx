import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { Link, useSearchParams } from "react-router";
import { BillCard, ComplaintCard } from "../components/cards";
import { searchBills, searchComplaints, unpaidBills } from "../lib/api";
import { formatINR, rupeesToPaise } from "../lib/money";
import { errorMessage } from "../lib/supabase";
import type { BillWithComplaints, ComplaintWithBills } from "../lib/types";

const RESULT_LIMIT = 100;

type Results =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; bills: BillWithComplaints[]; complaints: ComplaintWithBills[]; due: number };

const countLabel = (n: number) => `${n}${n === RESULT_LIMIT ? "+" : ""}`;

export default function BillSearch() {
  const { t, tn } = useT();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const unpaid = params.get("show") === "unpaid";
  const urlParams = (q: string, onlyUnpaid: boolean) => ({ ...(q ? { q } : {}), ...(onlyUnpaid ? { show: "unpaid" } : {}) });
  const [input, setInput] = useState(query);
  const [results, setResults] = useState<Results>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);

  // Keep the query in the URL (so Back returns to the same results), after a short pause in typing.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = input.trim();
      if (q !== query) setParams(urlParams(q, unpaid), { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [input, query, unpaid, setParams]);

  useEffect(() => {
    const requestId = ++latest.current;
    setResults((r) => (r.status === "ok" ? r : { status: "loading" }));
    const load = unpaid
      ? unpaidBills(query).then(({ bills, due }) => ({ bills, complaints: [] as ComplaintWithBills[], due }))
      : Promise.all([searchBills(query), searchComplaints(query)]).then(([bills, complaints]) => ({ bills, complaints, due: 0 }));
    load
      .then((r) => {
        if (requestId === latest.current) setResults({ status: "ok", ...r });
      })
      .catch((err) => {
        if (requestId === latest.current) setResults({ status: "error", message: errorMessage(err) });
      });
  }, [query, unpaid, attempt]);

  const searching = input.trim() !== query || (results.status === "loading" && query !== "");

  // Distinct vehicles in the results, for quick access to their full history.
  const vehicles =
    results.status === "ok" && query && !unpaid
      ? [
          ...new Map(
            [...results.bills, ...results.complaints].map((r) => [
              r.vehicle_reg_key,
              { key: r.vehicle_reg_key, reg: r.vehicle_reg, name: r.customer_name },
            ]),
          ).values(),
        ].slice(0, 12)
      : [];

  return (
    <div>
      <h1>{t("nav.findBills")}</h1>
      <div className="card search-card">
        <label htmlFor="bill-search">{t("lists.searchLabel")}</label>
        <input
          id="bill-search"
          type="search"
          autoFocus
          autoComplete="off"
          placeholder={t("lists.searchPlaceholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="segmented segmented-sm bill-filter" role="group" aria-label={t("lists.show")}>
          <button type="button" aria-pressed={!unpaid} onClick={() => setParams(urlParams(query, false), { replace: true })}>
            {t("lists.filterAllBills")}
          </button>
          <button type="button" aria-pressed={unpaid} onClick={() => setParams(urlParams(query, true), { replace: true })}>
            {t("lists.filterUnpaid")}
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {results.status === "error" ? (
          <div className="alert alert-error" role="alert">
            <span>{t("lists.searchFailed", { message: results.message })}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setAttempt((a) => a + 1)}>
              {t("common.tryAgain")}
            </button>
          </div>
        ) : results.status === "loading" ? (
          <p className="page-status">{t("common.loading")}</p>
        ) : (
          <div className={searching ? "stale" : undefined}>
            {searching && <p className="results-heading">{t("lists.searching")}</p>}

            {vehicles.length > 0 && (
              <section className="vehicle-links">
                <h2>{t("lists.vehicleHistory")}</h2>
                <div className="chips">
                  {vehicles.map((v) => (
                    <Link key={v.key} to={`/vehicles/${v.key}`} className="chip">
                      <span className="reg">{v.reg}</span> <span className="muted">{v.name}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {unpaid ? (
              <section className="result-section">
                <h2>{tn("lists.toCollect", results.bills.length, { amount: formatINR(rupeesToPaise(results.due)) })}</h2>
                <p className="hint">{t("lists.unpaidHint")}</p>
                {results.bills.length === 0 ? (
                  <div className="empty empty-list">
                    <p>{query ? t("lists.noBillsMatch", { query }) : t("lists.noneUnpaid")}</p>
                  </div>
                ) : (
                  <ul className="results">
                    {results.bills.map((b) => (
                      <li key={b.id}>
                        <BillCard bill={b} showDue />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : (
            <>
            <section className="result-section">
              <h2>{query ? t("lists.billsFound", { count: countLabel(results.bills.length) }) : t("lists.recentBills")}</h2>
              {results.bills.length === 0 ? (
                <div className="empty empty-list">
                  {query ? (
                    <p>{t("lists.noBillsMatch", { query })}</p>
                  ) : (
                    <>
                      <p>{t("lists.noBillsYet")}</p>
                      <Link to="/bills/new" className="btn btn-primary">
                        {t("lists.createFirstBill")}
                      </Link>
                    </>
                  )}
                </div>
              ) : (
                <ul className="results">
                  {results.bills.map((b) => (
                    <li key={b.id}>
                      <BillCard bill={b} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="result-section">
              <h2>
                {query ? t("lists.complaintsFound", { count: countLabel(results.complaints.length) }) : t("lists.recentComplaints")}
              </h2>
              {results.complaints.length === 0 ? (
                <div className="empty empty-list">
                  <p>{query ? t("lists.noComplaintsMatch", { query }) : t("lists.emptyAll")}</p>
                  <Link to="/complaints/new" className="btn btn-outline">
                    {t("lists.recordComplaint")}
                  </Link>
                </div>
              ) : (
                <ul className="results">
                  {results.complaints.map((c) => (
                    <li key={c.id}>
                      <ComplaintCard complaint={c} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
