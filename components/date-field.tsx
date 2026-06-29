"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const WD_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
const todayISO = () => {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
};
// Wochentag Mo=0 ... So=6 fuer ein ISO-Datum.
const weekday = (s: string) => (new Date(`${s}T00:00:00`).getDay() + 6) % 7;

function fmt(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return `${WD_SHORT[weekday(value)]} · ${d}. ${MONTHS[m - 1]} ${y}`;
}

// Datums-Picker: Button + Monatsgrid-Popover. Loest den nativen
// <input type="date"> ab -- ein Klick aufs Datum statt Tippen/Browser-Dialog.
export function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [vy, setVy] = useState(() => +value.slice(0, 4));
  const [vm, setVm] = useState(() => +value.slice(5, 7) - 1); // 0-basiert
  const wrapRef = useRef<HTMLDivElement>(null);

  // Beim Oeffnen auf den Monat des aktuellen Werts springen.
  useEffect(() => {
    if (open) {
      setVy(+value.slice(0, 4));
      setVm(+value.slice(5, 7) - 1);
    }
  }, [open, value]);

  // Klick ausserhalb / Escape schliesst (Escape nicht bis zum Sheet durchlassen).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const shift = (delta: number) => {
    const m = vm + delta;
    setVy(vy + Math.floor(m / 12));
    setVm(((m % 12) + 12) % 12);
  };

  const lead = (new Date(vy, vm, 1).getDay() + 6) % 7; // fuehrende Leerzellen (Mo-Start)
  const days = new Date(vy, vm + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = todayISO();

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-11 w-full items-center gap-2.5 rounded-xl border bg-background px-3.5 text-left text-[14px] outline-none transition-[box-shadow,border-color,background-color]",
          open ? "border-foreground/35 bg-card ring-4 ring-foreground/[0.07]" : "hover:bg-accent/40",
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground/60" />
        <span className="flex-1 tabular-nums">{fmt(value)}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
            transition={{ duration: 0.18, ease: EASE }}
            className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border bg-popover p-3 shadow-lg shadow-foreground/5"
          >
            {/* Monats-Kopf mit Navigation */}
            <div className="mb-2 flex items-center justify-between px-1">
              <button
                type="button"
                aria-label="Voriger Monat"
                onClick={() => shift(-1)}
                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-[color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-[0.96]"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-[14px] font-semibold tabular-nums">
                {MONTHS[vm]} {vy}
              </span>
              <button
                type="button"
                aria-label="Nächster Monat"
                onClick={() => shift(1)}
                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-[color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-[0.96]"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            {/* Wochentags-Kopf */}
            <div className="mb-1 grid grid-cols-7 gap-1">
              {WD_SHORT.map((d) => (
                <span key={d} className="grid h-7 place-items-center text-[11px] font-medium text-muted-foreground/60">
                  {d}
                </span>
              ))}
            </div>

            {/* Tages-Grid */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (d === null) return <span key={`e${i}`} />;
                const cur = iso(vy, vm, d);
                const sel = cur === value;
                const isToday = cur === today;
                return (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => {
                      onChange(cur);
                      setOpen(false);
                    }}
                    className={cn(
                      "relative grid h-9 place-items-center rounded-lg text-[13px] tabular-nums transition-[color,background-color,transform] active:scale-[0.96]",
                      sel
                        ? "bg-brand font-semibold text-brand-foreground shadow-sm"
                        : "text-foreground hover:bg-accent",
                      !sel && isToday && "font-semibold text-brand",
                    )}
                  >
                    {d}
                    {!sel && isToday && <span className="absolute bottom-1 size-1 rounded-full bg-brand" />}
                  </button>
                );
              })}
            </div>

            {/* Schnell: Heute */}
            <button
              type="button"
              onClick={() => {
                onChange(today);
                setOpen(false);
              }}
              className="mt-2 h-8 w-full rounded-lg text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Heute
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
