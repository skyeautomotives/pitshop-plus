import { useState } from "react";
import { locale, useT } from "../i18n";
import { barPath, compactINR, niceMax } from "../lib/chart";
import { formatINR } from "../lib/money";
import type { DaySales } from "../lib/sales";

const COLOR = "#2a78d6"; // categorical slot 1
const W = 560;
const H = 150;
const M = { top: 10, right: 4, bottom: 22, left: 44 };

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(locale(), { day: "numeric", month: "short" });

/** Small single-series bar chart: total sales per day. */
export default function MiniSalesChart({ days, today }: { days: DaySales[]; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { t, tn } = useT();
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const max = niceMax(Math.max(...days.map((d) => d.total)));
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const gw = plotW / days.length;
  const bw = Math.min(22, gw - 6);
  const shown = hover !== null ? days[hover] : null;

  return (
    <div className="chart-wrap mini-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={t("reports.miniAria", { n: days.length })}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t * max)} y2={y(t * max)} className="chart-grid" />
            <text x={M.left - 6} y={y(t * max)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {compactINR(t * max)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const gx = M.left + i * gw;
          const h = d.total > 0 ? Math.max(2, (d.total / max) * plotH) : 0;
          const isToday = d.date === today;
          const label = i === 0 || i === days.length - 1 || i === Math.floor(days.length / 2);
          return (
            <g key={d.date}>
              {hover === i && <rect x={gx + 1} y={M.top} width={gw - 2} height={plotH} rx={4} className="chart-hover" />}
              {h > 0 && (
                <path d={barPath(gx + (gw - bw) / 2, y(d.total), bw, h)} fill={COLOR} opacity={isToday || hover === i ? 1 : 0.8} />
              )}
              {label && (
                <text x={gx + gw / 2} y={H - 6} className={`chart-axis${isToday ? " chart-axis-sel" : ""}`} textAnchor="middle">
                  {isToday ? t("reports.today") : shortDate(d.date)}
                </text>
              )}
              <rect x={gx} y={M.top} width={gw} height={plotH + M.bottom} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
        <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} className="chart-baseline" />
      </svg>
      {shown && hover !== null && (
        <div className="chart-tip" style={{ left: `${((M.left + (hover + 0.5) * gw) / W) * 100}%` }} role="status">
          <strong>{shown.date === today ? t("reports.today") : shortDate(shown.date)}</strong>
          <span>
            {t("reports.total")}: <b>{formatINR(shown.total)}</b>
          </span>
          <span className="muted">{tn("dashboard.billCount", shown.bills)}</span>
        </div>
      )}
    </div>
  );
}
