// Text size and spacing, chosen per device in Settings > Display.
import { useEffect, useState } from "react";

export type TextSize = "small" | "normal" | "large" | "xlarge";
export type Density = "comfortable" | "compact";

export interface DisplayPrefs {
  textSize: TextSize;
  density: Density;
}

export const TEXT_SIZES: { id: TextSize; label: string; px: number }[] = [
  { id: "small", label: "Small", px: 14 },
  { id: "normal", label: "Normal", px: 16 },
  { id: "large", label: "Large", px: 18 },
  { id: "xlarge", label: "Extra large", px: 20 },
];

export const DENSITIES: { id: Density; label: string; hint: string }[] = [
  { id: "comfortable", label: "Comfortable", hint: "More space around things" },
  { id: "compact", label: "Compact", hint: "Fits more on the screen" },
];

const KEY = "pitstop:display";
const DEFAULTS: DisplayPrefs = { textSize: "normal", density: "comfortable" };
const listeners = new Set<(p: DisplayPrefs) => void>();

export function loadDisplay(): DisplayPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<DisplayPrefs>;
    return {
      textSize: TEXT_SIZES.some((t) => t.id === saved.textSize) ? saved.textSize! : DEFAULTS.textSize,
      density: DENSITIES.some((d) => d.id === saved.density) ? saved.density! : DEFAULTS.density,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Puts the choices on <html>, where the styles read them. */
export function applyDisplay(p: DisplayPrefs = loadDisplay()) {
  const root = document.documentElement;
  root.style.setProperty("--text-base", `${TEXT_SIZES.find((t) => t.id === p.textSize)!.px}px`);
  root.dataset.density = p.density;
}

export function saveDisplay(p: DisplayPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: still applies until the app is closed */
  }
  applyDisplay(p);
  listeners.forEach((fn) => fn(p));
}

export function useDisplay(): [DisplayPrefs, (p: DisplayPrefs) => void] {
  const [prefs, setPrefs] = useState(loadDisplay);
  useEffect(() => {
    listeners.add(setPrefs);
    return () => {
      listeners.delete(setPrefs);
    };
  }, []);
  return [prefs, saveDisplay];
}
