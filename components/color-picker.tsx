"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { EVENT_COLORS, evVar, parseOklch } from "@/lib/event-colors";
import { InfinitySlider } from "@/components/infinity-slider";

// Tiefe statt flacher Fuellung -- Inset-Highlight + Hairline, damit helle Farben
// nicht auf der weissen Card verschwinden.
const SWATCH_SHADOW =
  "inset 0 0 0 1px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.35), inset 0 -2px 3px rgba(0,0,0,0.1)";

const hueDiff = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
};

// Presets = Farbton-Anker. Ein Klick waehlt die Farbfamilie, der Acht-Slider
// darunter erkundet die Schattierungen (hell..dunkel, satt..blass) GENAU dieses
// Farbtons. Der Auswahl-Ring sitzt auf dem Preset, dessen Farbton gerade aktiv
// ist (gleitet per layoutId), auch nachdem man die Schattierung verschoben hat.
export function ColorPicker({ value, onPick, title }: { value: string; onPick: (c: string) => void; title: string }) {
  const curHue = parseOklch(value).h;
  let activeIdx = 0;
  let best = Infinity;
  EVENT_COLORS.forEach((c, i) => {
    const d = hueDiff(parseOklch(c.value).h, curHue);
    if (d < best) {
      best = d;
      activeIdx = i;
    }
  });

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {EVENT_COLORS.map((col, i) => {
          const on = i === activeIdx;
          return (
            <button
              key={col.id}
              type="button"
              aria-label={col.name}
              aria-pressed={on}
              onClick={() => onPick(col.value)}
              style={{ backgroundColor: col.value, boxShadow: SWATCH_SHADOW }}
              className="relative grid size-8 place-items-center rounded-full outline-none transition-transform hover:scale-110 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              {on && (
                <motion.span
                  layoutId="color-ring"
                  aria-hidden
                  className="absolute -inset-[4px] rounded-full border-2"
                  style={{ borderColor: col.value }}
                  transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
                />
              )}
              <AnimatePresence>
                {on && (
                  <motion.span
                    initial={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                    animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                    exit={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                  >
                    <Check className="size-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]" strokeWidth={3} />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </div>

      {/* Acht-Slider: ein Griff, der die Schattierungen des aktiven Farbtons erkundet. */}
      <div className="rounded-xl border bg-background/60 p-3 pt-4">
        <InfinitySlider value={value} onChange={onPick} />
      </div>

      {/* Live-Vorschau: genau der Block-Look aus dem Kalender (.ev-tint). */}
      <div className="ev-tint flex items-center gap-2 rounded-lg border border-l-[3px] px-3 py-2" style={evVar(value)}>
        <span className="flex-1 truncate text-[13px] font-semibold leading-tight">{title.trim() || "Beispieltermin"}</span>
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{EVENT_COLORS[activeIdx]?.name}</span>
      </div>
    </div>
  );
}
