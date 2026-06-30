"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlanSuggestion } from "@/lib/todo-autoplan";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function weekdayOf(iso: string) {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}
function dayLabel(iso: string) {
  return `${WEEKDAYS[weekdayOf(iso)]}, ${Number(iso.slice(8, 10))}. ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

// Bestaetigungs-Panel fuer den Auto-Planer: Atlas schlaegt Uhrzeiten vor, der User
// nimmt sie an (einzeln oder alle). Erst beim Annehmen wird geschrieben.
export function AutoplanSheet({
  open,
  suggestions,
  acceptedIds,
  onAccept,
  onAcceptAll,
  onClose,
}: {
  open: boolean;
  suggestions: PlanSuggestion[];
  acceptedIds: Set<string>;
  onAccept: (s: PlanSuggestion) => void;
  onAcceptAll: () => void;
  onClose: () => void;
}) {
  // Vorschlaege nach Tag gruppieren (chronologisch -- die Liste kommt sortiert rein).
  const groups: { date: string; items: PlanSuggestion[] }[] = [];
  for (const s of suggestions) {
    const last = groups[groups.length - 1];
    if (last && last.date === s.date) last.items.push(s);
    else groups.push({ date: s.date, items: [s] });
  }
  const allDone = suggestions.length > 0 && suggestions.every((s) => acceptedIds.has(s.todoId));

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop = eigener Layer mit eigener Opacity (wie im Termin-Sheet) --
              faded unabhaengig in 0.2s, die Karte animiert separat darueber. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-label="Woche automatisch planen"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-card shadow-xl"
          >
            {/* Kopf */}
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <h2 className="text-[15px] font-semibold leading-tight">Woche planen</h2>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {suggestions.length > 0
                      ? `${suggestions.length} Vorschläge in deine freien Lücken`
                      : "Vorschläge"}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Schließen"
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Liste */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {suggestions.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Nichts zu verplanen. Entweder hast du keine offenen Aufgaben ohne Uhrzeit, oder keine freien Lücken passen.
                </div>
              ) : (
                groups.map((g) => (
                  <section key={g.date} className="mb-3 last:mb-0">
                    <h3 className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                      {dayLabel(g.date)}
                    </h3>
                    <div className="flex flex-col gap-1.5">
                      {g.items.map((s) => {
                        const accepted = acceptedIds.has(s.todoId);
                        return (
                          <div
                            key={s.todoId}
                            className={cn(
                              "flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2",
                              accepted && "opacity-60",
                            )}
                          >
                            <span className="w-[72px] shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                              {s.startTime}–{s.endTime}
                            </span>
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: s.color ?? "color-mix(in oklab, var(--foreground) 40%, transparent)" }}
                            />
                            <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", accepted && "line-through")}>
                              {s.title}
                            </span>
                            {accepted ? (
                              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-primary">
                                <Check className="size-3.5" /> übernommen
                              </span>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7 shrink-0 px-2.5" onClick={() => onAccept(s)}>
                                Annehmen
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>

            {/* Fuss */}
            {suggestions.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
                <span className="text-[12px] text-muted-foreground">
                  {acceptedIds.size}/{suggestions.length} angenommen
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={onClose}>
                    {allDone ? "Fertig" : "Schließen"}
                  </Button>
                  <Button size="sm" onClick={onAcceptAll} disabled={allDone}>
                    Alle annehmen
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
