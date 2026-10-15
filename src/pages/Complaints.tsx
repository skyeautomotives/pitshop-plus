import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ComplaintCard } from "../components/cards";
import { COMPLAINT_LIST_LIMIT, listComplaints, searchComplaints } from "../lib/api";
import type { ComplaintWithBills } from "../lib/types";
import { useLoad } from "../lib/useLoad";

type Filter = "all" | "open" | "resolved" | "no-bill";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "no-bill", label: "No bill yet" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

const EMPTY: Record<Filter, string> = {
  all: "No complaints recorded yet.",
  open: "No open complaints. Everything is resolved.",
  resolved: "No resolved complaints yet.",
  "no-bill": "Every complaint has a bill.",
};

function isFilter(v: string | null): v is Filter {
  return v === "all" || v === "open" || v === "resolved" || v === "no-bill";
}

/** All complaints, with search and Open / Resolved / No bill yet filters. */
export default function Complaints() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const statusParam = params.get("show");
  const filter: Filter = isFilter(statusParam) ? statusParam : "open";
  const [input, setInput] = useState(query);

  // Keep search and filter in the URL so Back returns to the same list.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = input.trim();
      if (q === query) return;
      const next = new URLSearchParams(params);
      if (q) next.set("q", q);
      else next.delete("q");
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [input, query, params, setParams]);

  function setFilter(f: Filter) {
    const next = new URLSearchParams(params);
    next.set("show", f);
    setParams(next, { replace: true });
  }

  const state = useLoad(`${query}|${filter}`, async (): Promise<ComplaintWithBills[]> => {
    // Searching looks across all complaints; the filter then narrows the matches.
    const list = query
      ? await searchComplaints(query)
      : await listComplaints(filter === "open" || filter === "resolved" ? filter : undefined);
    if (filter === "open" || filter === "resolved") return list.filter((c) => c.status === filter);
    if (filter === "no-bill") return list.filter((c) => c.bills.length === 0);
    return list;
  });

  const searching = input.trim() !== query;

  return (
    <div>
      <div className="sales-head">
        <h1>Complaints</h1>
        <Link to="/complaints/new" className="btn btn-primary">
          + New complaint
        </Link>
      </div>

      <div className="card search-card">
        <label htmlFor="complaint-search">Search by customer name, phone number or vehicle number</label>
        <input
          id="complaint-search"
          type="search"
          autoComplete="off"
          placeholder="e.g. Ravi, 98765 or KA01AB1234"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </div>

      <div className="filter-bar" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip${filter === f.id ? " chip-active" : ""}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {state.status === "error" ? (
          <div className="alert alert-error" role="alert">
            <span>Couldn't load complaints. {state.message}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={state.retry}>
              Try again
            </button>
          </div>
        ) : state.status === "loading" ? (
          <p className="page-status">Loading complaints…</p>
        ) : (
          <div className={searching ? "stale" : undefined}>
            <p className="results-heading">
              {searching
                ? "Searching…"
                : `${state.data.length} ${state.data.length === 1 ? "complaint" : "complaints"}${query ? ` matching “${query}”` : ""}`}
            </p>
            {state.data.length === 0 && !searching ? (
              <div className="empty empty-list">
                <p>{query ? `No complaints match “${query}” in this list.` : EMPTY[filter]}</p>
                {filter !== "all" && (
                  <button type="button" className="btn btn-outline" onClick={() => setFilter("all")}>
                    Show all complaints
                  </button>
                )}
              </div>
            ) : (
              <ul className="results">
                {state.data.map((c) => (
                  <li key={c.id}>
                    <ComplaintCard complaint={c} />
                  </li>
                ))}
              </ul>
            )}
            {!query && state.data.length >= COMPLAINT_LIST_LIMIT && (
              <p className="hint">Showing the latest {COMPLAINT_LIST_LIMIT}. Search to find older complaints.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
