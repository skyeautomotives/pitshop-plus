import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { barPath, niceMax } from "../../lib/chart";
import { PAGE_SIZE } from "../../lib/admin/api";
import { monthLabel } from "../../lib/admin/format";
import type { AdminShop } from "../../lib/admin/types";

export function Tile({ label, value, sub, to, strong }: { label: string; value: ReactNode; sub?: string; to?: string; strong?: boolean }) {
  const body = (
    <>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </>
  );
  const cls = `tile${to ? " tile-link" : ""}${strong ? " tile-strong" : ""}`;
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function LoadFailed({ what, message, onRetry }: { what: string; message: string; onRetry: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      <span>
        Couldn't load {what}. {message}
      </span>
      <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/** "Showing 26-50 of 112" with previous / next buttons. */
export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  const last = Math.ceil(total / PAGE_SIZE) - 1;
  return (
    <div className="admin-pager">
      <span className="muted">
        Showing {page * PAGE_SIZE + 1}-{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}
      </span>
      <div className="admin-pager-buttons">
        <button type="button" className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)}>
          ← Previous
        </button>
        <button type="button" className="btn btn-outline btn-sm" disabled={page >= last} onClick={() => onPage(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}

export function ShopStatus({ shop }: { shop: Pick<AdminShop, "suspended_at" | "owner_confirmed"> }) {
  if (shop.suspended_at) return <span className="badge admin-badge-suspended">Suspended</span>;
  if (!shop.owner_confirmed) return <span className="badge admin-badge-pending">Email not confirmed</span>;
  return <span className="badge badge-resolved">Active</span>;
}

const HEIGHT = 200;
const M = { top: 12, right: 8, bottom: 26, left: 48 };

/** One bar per month with a hover/tap tooltip. */
export function MonthBars({
  label,
  months,
  value,
  format,
  axis,
  color,
  details,
  minMax = 1,
}: {
  label: string;
  months: string[];
  value: (i: number) => number;
  format: (v: number) => string;
  axis: (v: number) => string;
  color: string;
  details?: (i: number) => ReactNode;
  /** Smallest top of the axis (keeps small counts from filling the chart). */
  minMax?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the card's real width so labels stay readable in narrow cards.
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const values = months.map((_, i) => value(i));
  const max = niceMax(Math.max(...values, minMax));
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const gw = plotW / Math.max(months.length, 1);
  const bw = Math.min(28, gw - 8);
  const ticks = [0, 0.5, 1].map((t) => t * max);
  // When months are packed tight, label every other one (always including the latest).
  const labelEvery = gw < 30 ? 2 : 1;
  const last = months.length - 1;

  return (
    <div className="chart-wrap" ref={wrap}>
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} width="100%" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={M.left - 8} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {axis(t)}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const gx = M.left + i * gw;
          const v = values[i];
          return (
            <g key={m}>
              {hover === i && <rect x={gx + 1} y={M.top} width={gw - 2} height={plotH} rx={4} className="chart-hover" />}
              {v > 0 && <path d={barPath(gx + (gw - bw) / 2, y(v), bw, Math.max(1, (v / max) * plotH))} fill={color} />}
              {(last - i) % labelEvery === 0 && (
                <text x={gx + gw / 2} y={HEIGHT - 8} className="chart-axis" textAnchor="middle">
                  {monthLabel(m, false)}
                </text>
              )}
              <rect
                x={gx}
                y={M.top}
                width={gw}
                height={plotH + M.bottom}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              />
            </g>
          );
        })}
        <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} className="chart-baseline" />
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((M.left + (hover + 0.5) * gw) / width) * 100}%` }} role="status">
          <strong>{monthLabel(months[hover])}</strong>
          <span>
            <i style={{ background: color }} />
            {format(values[hover])}
          </span>
          {details?.(hover)}
        </div>
      )}
    </div>
  );
}
