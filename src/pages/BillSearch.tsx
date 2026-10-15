import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { BillCard, ComplaintCard } from "../components/cards";
import { searchBills, searchComplaints } from "../lib/api";
import { errorMessage } from "../lib/supabase";
import type { BillWithComplaints, ComplaintWithBills } from "../lib/types";

const RESULT_LIMIT = 100;

type Results =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; bills: BillWithComplaints[]; complaints: ComplaintWithBills[] };

function countLabel(n: number, one: string, many: string) {
  return `${n}${n === RESULT_LIMIT ? "+" : ""} ${n === 1 ? one : many}`;
}

export default function BillSearch() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [input, setInput] = useState(query);
  const [results, setResults] = useState<Results>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);

  // Keep the query in the URL (so Back returns to the same results), after a short pause in typing.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = input.trim();
      if (q !== query) setParams(q ? { q } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [input, query, setParams]);

  useEffect(() => {
    const requestId = ++latest.current;
    setResults((r) => (r.status === "ok" ? r : { status: "loading" }));
    Promise.all([searchBills(query), searchComplaints(query)])
      .then(([bills, complaints]) => {
        if (requestId === latest.current) setResults({ status: "ok", bills, complaints });
      })
      .catch((err) => {
        if (requestId === latest.current) setResults({ status: "error", message: errorMessage(err) });
      });
  }, [query, attempt]);

  const searching = input.trim() !== query || (results.status === "loading" && query !== "");

  // Distinct vehicles in the results, for quick access to their full history.
  const vehicles =
    results.status === "ok" && query
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
      <h1>Find bills</h1>
      <div className="card search-card">
        <label htmlFor="bill-search">Search by customer name, phone number or vehicle number</label>
        <input
          id="bill-search"
          type="search"
          autoFocus
          autoComplete="off"
          placeholder="e.g. Ravi, 98765 or KA01AB1234"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </div>

      <div aria-live="polite">
        {results.status === "error" ? (
          <div className="alert alert-error" role="alert">
            <span>Couldn't search. {results.message}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </button>
          </div>
        ) : results.status === "loading" ? (
          <p className="page-status">Loading…</p>
        ) : (
          <div className={searching ? "stale" : undefined}>
            {searching && <p className="results-heading">Searching…</p>}

            {vehicles.length > 0 && (
              <section className="vehicle-links">
                <h2>Vehicle history</h2>
                <div className="chips">
                  {vehicles.map((v) => (
                    <Link key={v.key} to={`/vehicles/${v.key}`} className="chip">
                      <span className="reg">{v.reg}</span> <span className="muted">{v.name}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="result-section">
              <h2>{query ? `Bills · ${countLabel(results.bills.length, "found", "found")}` : "Recent bills"}</h2>
              {results.bills.length === 0 ? (
                <div className="empty empty-list">
                  {query ? (
                    <p>No bills match “{query}”. Check the spelling, or try the phone or vehicle number instead.</p>
                  ) : (
                    <>
                      <p>No bills yet.</p>
                      <Link to="/bills/new" className="btn btn-primary">
                        Create the first bill
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
                {query ? `Complaints · ${countLabel(results.complaints.length, "found", "found")}` : "Recent complaints"}
              </h2>
              {results.complaints.length === 0 ? (
                <div className="empty empty-list">
                  <p>{query ? `No complaints match “${query}”.` : "No complaints recorded yet."}</p>
                  <Link to="/complaints/new" className="btn btn-outline">
                    Record a complaint
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
          </div>
        )}
      </div>
    </div>
  );
}
