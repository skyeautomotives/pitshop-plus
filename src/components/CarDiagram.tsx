import { useRef, type PointerEvent } from "react";
import { t, type Lang } from "../i18n";
import { DIAGRAM_H, DIAGRAM_W, MAX_MARKS, VIEW_BOXES, viewAt, type CarMark, type CarView, type MarkKind } from "../lib/carMarks";

const BODY = { fill: "#eef1f6", stroke: "#4b5565", strokeWidth: 2, strokeLinejoin: "round" as const };
const GLASS = { fill: "#cfdcef", stroke: "#4b5565", strokeWidth: 1.5 };
const TYRE = { fill: "#3b4250" };

// Side profile, front on the left, 310 long and 90 high (ground at 90).
function Profile() {
  return (
    <g>
      <path {...BODY} d="M10,64 Q6,46 30,42 L84,37 Q104,12 142,8 L208,8 Q238,10 262,35 L294,41 Q308,46 306,64 L304,74 L12,74 Z" />
      <path {...GLASS} d="M104,35 Q118,16 144,14 L170,14 L170,35 Z" />
      <path {...GLASS} d="M176,14 L206,14 Q230,17 248,35 L176,35 Z" />
      <path d="M173,38 L173,72 M110,40 L110,72 M236,40 L236,72" stroke="#4b5565" strokeWidth={1.2} fill="none" />
      <circle {...TYRE} cx={64} cy={74} r={16} />
      <circle {...TYRE} cx={250} cy={74} r={16} />
      <circle cx={64} cy={74} r={6} fill="#c3c9d4" />
      <circle cx={250} cy={74} r={6} fill="#c3c9d4" />
    </g>
  );
}

function CarDrawing() {
  return (
    <g>
      {/* Front */}
      <g>
        <path {...BODY} d="M126,72 Q124,50 140,44 L150,22 Q180,15 210,22 L220,44 Q236,50 234,72 L234,88 L126,88 Z" />
        <path {...GLASS} d="M154,27 Q180,22 206,27 L214,43 L146,43 Z" />
        <ellipse cx={142} cy={58} rx={9} ry={5} fill="#fff7d6" stroke="#4b5565" strokeWidth={1.2} />
        <ellipse cx={218} cy={58} rx={9} ry={5} fill="#fff7d6" stroke="#4b5565" strokeWidth={1.2} />
        <rect x={160} y={54} width={40} height={14} rx={3} fill="#d5dae3" stroke="#4b5565" strokeWidth={1.2} />
        <rect {...TYRE} x={128} y={86} width={16} height={12} rx={3} />
        <rect {...TYRE} x={216} y={86} width={16} height={12} rx={3} />
      </g>
      {/* Top, front up */}
      <g>
        <path
          {...BODY}
          d="M150,128 Q180,120 210,128 Q228,134 230,160 L232,400 Q230,428 210,433 Q180,438 150,433 Q130,428 128,400 L130,160 Q132,134 150,128 Z"
        />
        <path {...GLASS} d="M142,200 Q180,188 218,200 L212,232 Q180,226 148,232 Z" />
        <rect x={148} y={236} width={64} height={108} rx={10} fill="#e2e7ef" stroke="#4b5565" strokeWidth={1.2} />
        <path {...GLASS} d="M148,350 Q180,356 212,350 L216,378 Q180,386 144,378 Z" />
        <path d="M150,140 Q180,134 210,140" stroke="#4b5565" strokeWidth={1} fill="none" />
        <ellipse cx={125} cy={206} rx={6} ry={4} fill="#d5dae3" stroke="#4b5565" strokeWidth={1.2} />
        <ellipse cx={235} cy={206} rx={6} ry={4} fill="#d5dae3" stroke="#4b5565" strokeWidth={1.2} />
        <rect {...TYRE} x={122} y={160} width={8} height={40} rx={3} />
        <rect {...TYRE} x={230} y={160} width={8} height={40} rx={3} />
        <rect {...TYRE} x={122} y={360} width={8} height={40} rx={3} />
        <rect {...TYRE} x={230} y={360} width={8} height={40} rx={3} />
      </g>
      {/* Left side, front up, wheels outward */}
      <g transform="translate(100,127) rotate(90)">
        <Profile />
      </g>
      {/* Right side, front up, wheels outward */}
      <g transform="translate(260,127) rotate(90) scale(1,-1)">
        <Profile />
      </g>
      {/* Back */}
      <g>
        <path {...BODY} d="M126,524 Q124,502 140,496 L150,474 Q180,467 210,474 L220,496 Q236,502 234,524 L234,540 L126,540 Z" />
        <path {...GLASS} d="M154,479 Q180,474 206,479 L214,495 L146,495 Z" />
        <rect x={132} y={504} width={20} height={9} rx={2} fill="#f3c4c4" stroke="#4b5565" strokeWidth={1.2} />
        <rect x={208} y={504} width={20} height={9} rx={2} fill="#f3c4c4" stroke="#4b5565" strokeWidth={1.2} />
        <rect x={164} y={512} width={32} height={11} rx={2} fill="#ffffff" stroke="#4b5565" strokeWidth={1.2} />
        <rect {...TYRE} x={128} y={538} width={16} height={12} rx={3} />
        <rect {...TYRE} x={216} y={538} width={16} height={12} rx={3} />
      </g>
    </g>
  );
}

/** One mark: a red zigzag for a scratch, an orange ring for a dent, a black cross for broken. */
export function MarkShape({ kind, x, y, size = 1 }: { kind: MarkKind; x: number; y: number; size?: number }) {
  const s = 7 * size;
  if (kind === "scratch")
    return (
      <polyline
        points={`${x - s},${y + s / 2} ${x - s / 3},${y - s / 2} ${x + s / 3},${y + s / 2} ${x + s},${y - s / 2}`}
        fill="none"
        stroke="#d92d20"
        strokeWidth={3 * size}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  if (kind === "dent") return <circle cx={x} cy={y} r={s} fill="rgba(247,144,9,0.25)" stroke="#dc6803" strokeWidth={3 * size} />;
  return (
    <path d={`M${x - s},${y - s} L${x + s},${y + s} M${x + s},${y - s} L${x - s},${y + s}`} stroke="#101828" strokeWidth={3.2 * size} strokeLinecap="round" />
  );
}

export const MARK_LABEL: Record<MarkKind, Parameters<typeof t>[0]> = {
  scratch: "complaint.markScratch",
  dent: "complaint.markDent",
  broken: "complaint.markBroken",
};

const VIEW_LABEL: Record<Exclude<CarView, "top">, Parameters<typeof t>[0]> = {
  front: "complaint.viewFront",
  back: "complaint.viewBack",
  left: "complaint.viewLeft",
  right: "complaint.viewRight",
};

/**
 * The car from five sides. With `onChange`, tapping the car adds a mark of `kind`,
 * and tapping a mark removes it; without, it only shows the marks.
 */
export default function CarDiagram({
  marks,
  kind = "scratch",
  onChange,
  lang,
  label,
}: {
  marks: CarMark[];
  kind?: MarkKind;
  onChange?: (marks: CarMark[]) => void;
  lang?: Lang;
  label?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);

  function onTap(e: PointerEvent<SVGSVGElement>) {
    if (!onChange || !svg.current) return;
    const box = svg.current.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * DIAGRAM_W;
    const py = ((e.clientY - box.top) / box.height) * DIAGRAM_H;
    // Tapping near a mark removes it.
    const near = marks.findIndex((m) => Math.hypot(m.x * DIAGRAM_W - px, m.y * DIAGRAM_H - py) < 12);
    if (near >= 0) return onChange(marks.filter((_, i) => i !== near));
    if (!viewAt(px, py) || marks.length >= MAX_MARKS) return;
    onChange([...marks, { x: Math.round((px / DIAGRAM_W) * 1000) / 1000, y: Math.round((py / DIAGRAM_H) * 1000) / 1000, k: kind }]);
  }

  return (
    <svg
      ref={svg}
      className={`car-diagram${onChange ? " is-editable" : ""}`}
      viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`}
      role="img"
      aria-label={label}
      onPointerDown={onChange ? onTap : undefined}
    >
      <CarDrawing />
      {(Object.keys(VIEW_LABEL) as Exclude<CarView, "top">[]).map((v) => {
        const b = VIEW_BOXES[v];
        const side = v === "left" || v === "right";
        return (
          <text
            key={v}
            x={side ? b.x + b.w / 2 : b.x + b.w + 6}
            y={side ? b.y - 4 : b.y + b.h / 2}
            textAnchor={side ? "middle" : "start"}
            fontSize={11}
            fill="#667085"
            fontFamily="Inter, 'Noto Sans', 'Nirmala UI', sans-serif"
          >
            {t(VIEW_LABEL[v], undefined, lang)}
          </text>
        );
      })}
      {marks.map((m, i) => (
        <MarkShape key={i} kind={m.k} x={m.x * DIAGRAM_W} y={m.y * DIAGRAM_H} />
      ))}
    </svg>
  );
}
