import { useEffect, useState } from "react";
import { useT, type Key } from "../i18n";
import { Link, useSearchParams } from "react-router";
import { ComplaintCard } from "../components/cards";
import { COMPLAINT_LIST_LIMIT, listComplaints, searchComplaints } from "../lib/api";
import type { ComplaintWithBills } from "../lib/types";
import { useLoad } from "../lib/useLoad";

type Filter = "all" | "open" | "resolved" | "no-bill";

const FILTERS: { id: Filter; label: Key }[] = [
  { id: "open", label: "lists.filterOpen" },
  { id: "no-bill", label: "lists.filterNoBill" },
  { id: "resolved", label: "lists.filterResolved" },
  { id: "all", label: "lists.filterAll" },
];

const EMPTY: Record<Filter, Key> = {
  all: "lists.emptyAll",
  open: "lists.emptyOpen",
  resolved: "lists.emptyResolved",
  "no-bill": "lists.emptyNoBill",
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
  const { t, tn } = useT();

  return (
    <div>
      <div className="sales-head">
        <h1>{t("nav.complaints")}</h1>
        <Link to="/complaints/new" className="btn btn-primary">
          {t("lists.newComplaintButton")}
        </Link>
      </div>

      <div className="card search-card">
        <label htmlFor="complaint-search">{t("lists.searchLabel")}</label>
        <input
          id="complaint-search"
          type="search"
          autoComplete="off"
          placeholder={t("lists.searchPlaceholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </div>

      <div className="filter-bar" role="group" aria-label={t("lists.show")}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip${filter === f.id ? " chip-active" : ""}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {t(f.label)}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {state.status === "error" ? (
          <div className="alert alert-error" role="alert">
            <span>{t("lists.complaintsLoadFailed", { message: state.message })}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={state.retry}>
              {t("common.tryAgain")}
            </button>
          </div>
        ) : state.status === "loading" ? (
          <p className="page-status">{t("lists.loadingComplaints")}</p>
        ) : (
          <div className={searching ? "stale" : undefined}>
            <p className="results-heading">
              {searching
                ? t("lists.searching")
                : query
                  ? tn("lists.complaintCountMatching", state.data.length, { query })
                  : tn("lists.complaintCount", state.data.length)}
            </p>
            {state.data.length === 0 && !searching ? (
              <div className="empty empty-list">
                <p>{query ? t("lists.noComplaintsMatchList", { query }) : t(EMPTY[filter])}</p>
                {filter !== "all" && (
                  <button type="button" className="btn btn-outline" onClick={() => setFilter("all")}>
                    {t("lists.showAllComplaints")}
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
              <p className="hint">{t("lists.showingLatest", { n: COMPLAINT_LIST_LIMIT })}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
