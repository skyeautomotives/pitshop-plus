import { useRef, useState, type PointerEvent } from "react";
import { useT } from "../i18n";
import { shrinkToDataUrl } from "../lib/pictures";

/** A box to sign in with a finger or mouse. Returns the signature cropped to what was drawn. */
export default function SignaturePad({ onDone, onCancel }: { onDone: (picture: string) => void; onCancel: () => void }) {
  const { t } = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const bounds = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  function draw(to: { x: number; y: number }) {
    const ctx = canvas.current?.getContext("2d");
    const from = last.current;
    if (!ctx || !from) return;
    ctx.strokeStyle = "#0f1f4b";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    const b = bounds.current ?? { x0: to.x, y0: to.y, x1: to.x, y1: to.y };
    bounds.current = { x0: Math.min(b.x0, from.x, to.x), y0: Math.min(b.y0, from.y, to.y), x1: Math.max(b.x1, from.x, to.x), y1: Math.max(b.y1, from.y, to.y) };
    last.current = to;
    setEmpty(false);
  }

  function clear() {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    bounds.current = null;
    setEmpty(true);
  }

  function done() {
    const c = canvas.current;
    const b = bounds.current;
    if (!c || !b) return;
    const pad = 8;
    const x = Math.max(0, Math.floor(b.x0 - pad));
    const y = Math.max(0, Math.floor(b.y0 - pad));
    const crop = document.createElement("canvas");
    crop.width = Math.min(c.width, Math.ceil(b.x1 + pad)) - x;
    crop.height = Math.min(c.height, Math.ceil(b.y1 + pad)) - y;
    crop.getContext("2d")?.drawImage(c, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    onDone(shrinkToDataUrl(crop, 500, 160));
  }

  return (
    <div className="signature-pad">
      <canvas
        ref={canvas}
        width={900}
        height={300}
        aria-label={t("settings.drawHere")}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = point(e);
        }}
        onPointerMove={(e) => last.current && draw(point(e))}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
      />
      <p className="hint">{t("settings.drawHere")}</p>
      <div className="branding-actions">
        <button type="button" className="btn btn-primary" disabled={empty} onClick={done}>
          {t("settings.useDrawing")}
        </button>
        <button type="button" className="btn btn-outline" disabled={empty} onClick={clear}>
          {t("settings.clearDrawing")}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
