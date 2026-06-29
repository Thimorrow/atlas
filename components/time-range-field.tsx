"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// Zeit-Eingabe (loest den runden Dial ab). Modernes Kalender-Muster: editierbares
// Feld + 15-Min-Dropdown, dazu ein Pfeil-Stepper fuer 5-Min-Schritte. Drei Wege:
// tippen (smart geparst), ±5 per Pfeil (Klick/Taste, Halten wiederholt), oder
// aus der Liste klicken. Das Bis-Feld zeigt die Dauer und folgt dem Start.

const EASE = [0.22, 1, 0.36, 1] as const;
const STEP_LIST = 15; // Raster der Vorschlagsliste
const STEP_NUDGE = 5; // Schrittweite der Pfeile
const MAX_MIN = 23 * 60 + 59;
const pad = (n: number) => String(n).padStart(2, "0");

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

// "9" -> 09:00 | "930"/"9:30"/"9.30"/"9h30" -> 09:30 | "0900"/"1430" -> .. |
// "14h"/"14 uhr" -> 14:00. Liefert HH:MM oder null bei Unsinn.
function parseTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s|uhr/g, "");
  if (!s) return null;
  const ok = (h: number, m: number) => (h <= 23 && m <= 59 ? `${pad(h)}:${pad(m)}` : null);

  let m = s.match(/^(\d{1,2})[h.:](\d{1,2})$/);
  if (m) return ok(+m[1], +m[2]);
  m = s.match(/^(\d{1,2})h$/);
  if (m) return ok(+m[1], 0);
  if (/^\d+$/.test(s)) {
    if (s.length <= 2) return ok(+s, 0);
    if (s.length === 3) return ok(+s.slice(0, 1), +s.slice(1));
    if (s.length === 4) return ok(+s.slice(0, 2), +s.slice(2));
  }
  return null;
}

function durLabel(min: number): string {
  if (min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} Std`;
  return `${h} Std ${m} min`;
}

type Opt = { value: string; sub?: string };

function TimeCombo({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Aktuell wirksamer Wert (Entwurf, sonst Prop) -- als Ref, damit der
  // Halten-Wiederhol-Timer beim Steppen immer den frischen Stand sieht.
  const curRef = useRef(value);
  curRef.current = parseTime(draft) ?? value;

  // Aussen synchron halten, solange das Feld nicht bearbeitet wird.
  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);

  // Tippen filtert die Liste (ohne fuehrende Null: "9" trifft 09:xx).
  const q = draft.replace(/[^\d]/g, "");
  const filtered = useMemo(() => {
    if (!q) return options;
    return options.filter((o) => {
      const hhmm = o.value.replace(":", "");
      const noLead = String(Number(o.value.slice(0, 2))) + o.value.slice(3);
      return hhmm.startsWith(q) || noLead.startsWith(q);
    });
  }, [options, q]);

  // Aktive Zeile beim Oeffnen / bei Wertaenderung sichtbar halten.
  useLayoutEffect(() => {
    if (!open) return;
    const idx = filtered.findIndex((o) => o.value === value);
    if (idx >= 0) {
      setHi(idx);
      listRef.current?.children[idx]?.scrollIntoView({ block: "nearest" });
    }
  }, [open, value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Klick ausserhalb schliesst (und schreibt den Entwurf fest).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) commit();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }); // bewusst jeden Render: commit liest frischen draft

  const pick = (v: string) => {
    onChange(v);
    setDraft(v);
    setOpen(false);
    inputRef.current?.blur();
  };

  const commit = () => {
    const parsed = parseTime(draft);
    if (parsed) onChange(parsed);
    else setDraft(value);
    setOpen(false);
  };

  // ±5 min, auf das 5er-Raster gerundet. Schreibt sofort durch (curRef), damit
  // der Wiederhol-Timer akkumuliert.
  const nudge = (dir: 1 | -1) => {
    const t = toMin(curRef.current);
    const next = dir > 0 ? Math.floor(t / STEP_NUDGE) * STEP_NUDGE + STEP_NUDGE : Math.ceil(t / STEP_NUDGE) * STEP_NUDGE - STEP_NUDGE;
    const v = fromMin(Math.max(0, Math.min(MAX_MIN, next)));
    curRef.current = v;
    setDraft(v);
    onChange(v);
  };

  // Halten-zum-Wiederholen.
  const rep = useRef<{ t1?: ReturnType<typeof setTimeout>; t2?: ReturnType<typeof setInterval> }>({});
  const holdStart = (dir: 1 | -1) => {
    nudge(dir);
    rep.current.t1 = setTimeout(() => {
      rep.current.t2 = setInterval(() => nudge(dir), 75);
    }, 320);
  };
  const holdStop = () => {
    clearTimeout(rep.current.t1);
    clearInterval(rep.current.t2);
    rep.current = {};
  };
  useEffect(() => holdStop, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      nudge(e.key === "ArrowUp" ? 1 : -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit();
      inputRef.current?.blur();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation(); // nicht das ganze Sheet schliessen
      setDraft(value);
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const stepperBtn =
    "flex flex-1 items-center justify-center rounded-md text-muted-foreground/70 transition-[color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-[0.96]";

  return (
    <div ref={wrapRef} className="relative flex-1">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="relative">
        <input
          ref={inputRef}
          value={draft}
          inputMode="numeric"
          onChange={(e) => {
            setDraft(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.select());
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-12 w-full rounded-xl border bg-background pl-3.5 pr-9 font-mono text-[20px] font-semibold tabular-nums tracking-tight outline-none transition-[box-shadow,border-color,background-color]",
            "focus-visible:border-foreground/35 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-foreground/[0.07]",
          )}
        />

        {/* Pfeil-Stepper: ±5 min, Halten wiederholt. tabIndex -1 + preventDefault
            am pointerdown -> klaut dem Feld nicht den Fokus. */}
        <div className="absolute inset-y-1 right-1 flex w-7 flex-col gap-px">
          {([1, -1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              tabIndex={-1}
              aria-label={dir > 0 ? `${label} plus 5 Minuten` : `${label} minus 5 Minuten`}
              onPointerDown={(e) => {
                e.preventDefault();
                holdStart(dir);
              }}
              onPointerUp={holdStop}
              onPointerLeave={holdStop}
              onPointerCancel={holdStop}
              className={stepperBtn}
            >
              {dir > 0 ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {open && filtered.length > 0 && (
            <motion.ul
              ref={listRef}
              initial={{ opacity: 0, y: -4, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
              transition={{ duration: 0.16, ease: EASE }}
              className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-56 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg shadow-foreground/5"
            >
              {filtered.map((o, i) => {
                const sel = o.value === value;
                const active = i === hi;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      onMouseEnter={() => setHi(i)}
                      onClick={() => pick(o.value)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors",
                        active ? "bg-accent" : "hover:bg-accent/60",
                      )}
                    >
                      <span className={cn("font-mono text-[14px] tabular-nums", sel ? "font-semibold text-foreground" : "text-foreground/90")}>
                        {o.value}
                      </span>
                      {o.sub && <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{o.sub}</span>}
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function TimeRangeField({
  start,
  end,
  onStart,
  onEnd,
}: {
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  const dur = toMin(end) - toMin(start);

  // Start verschieben -> Ende mit gleicher Dauer mitziehen (innerhalb des Tages).
  const setStart = (v: string) => {
    onStart(v);
    const keep = dur > 0 ? dur : 60;
    onEnd(fromMin(Math.min(toMin(v) + keep, MAX_MIN)));
  };

  // Von: alle 15-Min-Marken des Tages.
  const startOpts: Opt[] = useMemo(
    () => Array.from({ length: (24 * 60) / STEP_LIST }, (_, i) => ({ value: fromMin(i * STEP_LIST) })),
    [],
  );
  // Bis: nur Zeiten nach dem Start, jeweils mit Dauer-Label.
  const endOpts: Opt[] = useMemo(() => {
    const out: Opt[] = [];
    for (let m = toMin(start) + STEP_LIST; m <= MAX_MIN; m += STEP_LIST) {
      out.push({ value: fromMin(m), sub: durLabel(m - toMin(start)) });
    }
    return out;
  }, [start]);

  return (
    <div>
      <div className="flex items-end gap-3">
        <TimeCombo label="Von" value={start} onChange={setStart} options={startOpts} />
        <span className="mb-3 text-muted-foreground/50">–</span>
        <TimeCombo label="Bis" value={end} onChange={onEnd} options={endOpts} />
      </div>
      <p className="mt-2.5 text-center text-[12px] tabular-nums text-muted-foreground">
        {dur > 0 ? `Dauer · ${durLabel(dur)}` : "Ende muss nach dem Start liegen"}
      </p>
    </div>
  );
}
