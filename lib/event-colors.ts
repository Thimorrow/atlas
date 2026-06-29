// Kuratierte Event-Palette (M001-S03-T04).
//
// Acht abgestimmte OKLCH-Farben, die in Light + Dark gut tragen. Gespeichert wird
// der reine oklch-String (color-Spalte). Das Rendering mischt daraus ueber
// `.ev-tint` (globals.css) Farbrand + Fuellung. So bleibt die Wahl klein und
// idiotensicher, sieht aber wertig aus -- kein nacktes <input type=color>.

import type { CSSProperties } from "react";

export type EventColor = { id: string; name: string; value: string };

export const EVENT_COLORS: EventColor[] = [
  { id: "violet", name: "Violett", value: "oklch(0.56 0.20 300)" },
  { id: "indigo", name: "Indigo", value: "oklch(0.55 0.17 268)" },
  { id: "blue", name: "Blau", value: "oklch(0.58 0.16 245)" },
  { id: "cyan", name: "Cyan", value: "oklch(0.66 0.12 210)" },
  { id: "emerald", name: "Gruen", value: "oklch(0.62 0.14 162)" },
  { id: "amber", name: "Bernstein", value: "oklch(0.74 0.15 78)" },
  { id: "rose", name: "Rose", value: "oklch(0.63 0.19 12)" },
  { id: "slate", name: "Graphit", value: "oklch(0.58 0.03 265)" },
];

export const DEFAULT_EVENT_COLOR = EVENT_COLORS[0].value;

// Inline-Style-Traeger fuer die gewaehlte Farbe -> setzt die CSS-Var --ev, die
// `.ev-tint` auswertet. null/leere Farbe -> kein Style (Quellen-Fallback greift).
export function evVar(color: string | null | undefined): CSSProperties | undefined {
  return color ? ({ "--ev": color } as CSSProperties) : undefined;
}

// --- OKLCH-Zerlegung fuer den eigenen Farb-Slider --------------------------
// Events speichern den reinen `oklch(L C H)`-String. Der Picker muss ihn in
// Kanaele zerlegen (Slider) und wieder zusammensetzen.

export type Oklch = { l: number; c: number; h: number };

// Sinnvolle Grenzen: zu dunkel/zu hell traegt im Kalender nicht, daher L gekappt.
export const OKLCH_RANGE = {
  l: { min: 0.4, max: 0.85, step: 0.005 },
  c: { min: 0, max: 0.37, step: 0.005 },
  h: { min: 0, max: 360, step: 1 },
} as const;

export function parseOklch(value: string | null | undefined): Oklch {
  const m = value?.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) return { l: 0.56, c: 0.2, h: 300 };
  return { l: +m[1], c: +m[2], h: +m[3] };
}

// L/C auf 3 Stellen, H auf 1 -- Nachkomma-Nullen fallen weg (oklch-Konvention).
const round = (n: number, d: number) => String(Math.round(n * 10 ** d) / 10 ** d);
export function buildOklch({ l, c, h }: Oklch): string {
  return `oklch(${round(l, 3)} ${round(c, 3)} ${round(h, 1)})`;
}
