import { useState } from "react";
import { locale, useT } from "../i18n";
import { barPath, compactINR, niceMax } from "../lib/chart";
import { formatINR } from "../lib/money";
import type { DaySales } from "../lib/sales";

// Two series, categorical slots 1 and 2 of the validated chart palette.
const SERIES = [
  { key: "total", label: "reports.chartInclLabour", color: "#2a78d6" },
  { key: "excludingLabour", label: "reports.chartExclLabour", color: "#eb6834" },
] as const;

const HEIGHT = 240;
const M = { top: 12, right: 8, bottom: 26, left: 52 };

/** Day-by-day grouped bars: total including labour vs excluding labour. */
export default function SalesChart({
  days,
  selected,
  onSelect,
}: {
  days: DaySales[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { t, tn } = useT();
  const width = Math.max(640, days.length * 26 + M.left + M.right);
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const max = niceMax(Math.max(...days.map((d) => d.total)));
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const gw = plotW / days.length;
  const bw = Math.max(3, Math.min(10, (gw - 8) / 2));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const showEvery = gw >= 20 ? 1 : 5;
  const shown = hover !== null ? days[hover] : null;

  return (
    <div>
      <div className="chart-legend" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {t(s.label)}
          </span>
        ))}
      </div>
      <div className="chart-scroll">
        <div className="chart-wrap" style={{ minWidth: width }}>
          <svg
            viewBox={`0 0 ${width} ${HEIGHT}`}
            width="100%"
            role="img"
            aria-label={t("reports.chartAria")}
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="chart-grid" />
                <text x={M.left - 8} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
                  {compactINR(t)}
                </text>
              </g>
            ))}
            {days.map((d, i) => {
              const gx = M.left + i * gw;
              const x0 = gx + (gw - (bw * 2 + 2)) / 2;
              const isSel = d.date === selected;
              return (
                <g key={d.date}>
                  {(isSel || hover === i) && (
                    <rect x={gx + 1} y={M.top} width={gw - 2} height={plotH} rx={4} className={isSel ? "chart-sel" : "chart-hover"} />
                  )}
                  {SERIES.map((s, si) => {
                    const v = d[s.key];
                    if (v <= 0) return null;
                    const h = Math.max(1, (v / max) * plotH);
                    return <path key={s.key} d={barPath(x0 + si * (bw + 2), y(v), bw, h)} fill={s.color} />;
                  })}
                  {(i % showEvery === 0 || isSel) && (
                    <text x={gx + gw / 2} y={HEIGHT - 8} className={`chart-axis${isSel ? " chart-axis-sel" : ""}`} textAnchor="middle">
                      {Number(d.date.slice(8))}
                    </text>
                  )}
                  {/* Hit target: the whole column, bigger than the bars. */}
                  <rect
                    x={gx}
                    y={M.top}
                    width={gw}
                    height={plotH + M.bottom}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHover(i)}
                    onClick={() => onSelect(d.date)}
                  />
                </g>
              );
            })}
            <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} className="chart-baseline" />
          </svg>
          {shown && hover !== null && (
            <div
              className="chart-tip"
              style={{ left: `${((M.left + (hover + 0.5) * gw) / width) * 100}%` }}
              role="status"
            >
              <strong>
                {new Date(`${shown.date}T00:00:00`).toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" })}
              </strong>
              {SERIES.map((s) => (
                <span key={s.key}>
                  <i style={{ background: s.color }} />
                  {t(s.label)}: <b>{formatINR(shown[s.key])}</b>
                </span>
              ))}
              <span className="muted">
                {t("dashboard.labourAmount", { amount: formatINR(shown.labour) })} · {tn("dashboard.billCount", shown.bills)}
              </span>
            </div>
          )}
        </div>
      </div>
      <p className="hint">{t("reports.tapDay")}</p>
    </div>
  );
}
