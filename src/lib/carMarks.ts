// Marks on the car diagram: where a scratch, dent or broken part was seen when the car came in.
// x and y are fractions (0-1) of the whole diagram, so marks stay in place at any size.

export type MarkKind = "scratch" | "dent" | "broken";
export type CarView = "front" | "back" | "left" | "right" | "top";

export interface CarMark {
  x: number;
  y: number;
  k: MarkKind;
}

export const MARK_KINDS: MarkKind[] = ["scratch", "dent", "broken"];
export const MAX_MARKS = 60;

/** The diagram's drawing size (SVG units). */
export const DIAGRAM_W = 360;
export const DIAGRAM_H = 560;

/** Where each view sits on the diagram, in drawing units. */
export const VIEW_BOXES: Record<CarView, { x: number; y: number; w: number; h: number }> = {
  front: { x: 110, y: 8, w: 140, h: 96 },
  left: { x: 4, y: 120, w: 102, h: 320 },
  top: { x: 118, y: 120, w: 124, h: 320 },
  right: { x: 254, y: 120, w: 102, h: 320 },
  back: { x: 110, y: 456, w: 140, h: 96 },
};

/** The view a point (in drawing units) falls on, or null for the space between views. */
export function viewAt(px: number, py: number): CarView | null {
  for (const [view, b] of Object.entries(VIEW_BOXES) as [CarView, (typeof VIEW_BOXES)[CarView]][]) {
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return view;
  }
  return null;
}

/** Keeps only well-formed marks (data from older versions or other devices may be odd). */
export function cleanMarks(raw: unknown): CarMark[] {
  if (!Array.isArray(raw)) return [];
  const marks: CarMark[] = [];
  for (const m of raw) {
    const { x, y, k } = (m ?? {}) as Partial<CarMark>;
    if (typeof x !== "number" || typeof y !== "number" || !MARK_KINDS.includes(k as MarkKind)) continue;
    if (x < 0 || x > 1 || y < 0 || y > 1) continue;
    marks.push({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, k: k as MarkKind });
    if (marks.length === MAX_MARKS) break;
  }
  return marks;
}

/** How many marks of each kind. */
export function countMarks(marks: CarMark[]): Record<MarkKind, number> {
  const n: Record<MarkKind, number> = { scratch: 0, dent: 0, broken: 0 };
  for (const m of marks) n[m.k]++;
  return n;
}
