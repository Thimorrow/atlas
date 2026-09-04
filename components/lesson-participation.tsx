"use client";

// Meldungszaehler: ein Zaehlstand je konkreter Schulstunde. Zwei Ebenen:
// ParticipationCounter ist der Zaehler selbst (Laden, Speichern, Knoepfe),
// LessonParticipationEditor nur das Dialog-Geruest drumherum, wie
// components/lesson-note.tsx fuer die Notiz.


import { useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Overlay } from "@/components/subject-notes";
import { useToast } from "@/components/toast";
import { MAX_COUNT } from "@/lib/participation";
import { cn } from "@/lib/utils";


export type LessonParticipationTarget = {
  schoolBlockId: string;
  subject: string;
  dayLabel: string; // "Montag, 02.09."
  time: string; // "08:00" oder "08:00–08:45"
  color?: string | null;
};


const BUTTON_BASE =
  "grid size-14 shrink-0 place-items-center rounded-xl transition-[color,background-color,scale] duration-150 ease-[var(--ease-atlas)] [touch-action:manipulation] motion-safe:active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";


// Wechsel der Stunde laeuft ueber ein Remount (key={schoolBlockId} beim
// Aufrufer), keine Reset-Logik hier.
export function ParticipationCounter({
  schoolBlockId,
  onSaved,
  className,
}: {
  schoolBlockId: string;
  // null bedeutet "nicht erfasst" (nach DELETE).
  onSaved: (schoolBlockId: string, count: number | null) => void;
  className?: string;
  footerClassName?: string;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [recorded, setRecorded] = useState(false);

  // savedRef ist der letzte bekannt gespeicherte Stand. Speichern koalesziert
  // ueber diese beiden Refs: laeuft schon ein PUT, wird nur der neueste
  // Wunschwert gemerkt und nach dessen Rueckkehr genau ein weiterer PUT
  // geschickt, damit immer der letzte Wert zuletzt ankommt.
  const savedRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef<number | null>(null);

  function resetToSaved() {
    const fallback = savedRef.current;
    setCount(fallback ?? 0);
    setRecorded(fallback !== null);
  }

  async function persist(value: number) {
    if (inFlightRef.current) {
      pendingRef.current = value;
      return;
    }
    inFlightRef.current = true;
    try {
      const res = await fetch(`/api/lessons/${schoolBlockId}/participation`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: value }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast(data?.error ?? "Die Meldungen konnten nicht gespeichert werden.");
        resetToSaved();
        return;
      }
      savedRef.current = value;
      onSaved(schoolBlockId, value);
    } catch {
      toast("Keine Verbindung zum Server.");
      resetToSaved();
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current !== null) {
        const next = pendingRef.current;
        pendingRef.current = null;
        void persist(next);
      }
    }
  }

  function change(next: number) {
    const clamped = Math.max(0, Math.min(MAX_COUNT, next));
    setCount(clamped);
    setRecorded(true);
    void persist(clamped);
  }

  async function clearRecord() {
    try {
      const res = await fetch(`/api/lessons/${schoolBlockId}/participation`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast(data?.error ?? "Die Erfassung konnte nicht entfernt werden.");
        return;
      }
      savedRef.current = null;
      setCount(0);
      setRecorded(false);
      onSaved(schoolBlockId, null);
    } catch {
      toast("Die Erfassung konnte nicht entfernt werden.");
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/lessons/${schoolBlockId}/participation`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { participation: { count: number } | null }) => {
        if (!alive) return;
        const c = d.participation?.count ?? null;
        savedRef.current = c;
        setCount(c ?? 0);
        setRecorded(c !== null);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        toast("Die Meldungen konnten nicht geladen werden.");
        savedRef.current = null;
        setCount(0);
        setRecorded(false);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolBlockId]);

  const label = recorded ? (count === 1 ? "Meldung" : "Meldungen") : "Nicht erfasst";

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="flex w-full items-center justify-between gap-3 pt-4">
        <button
          type="button"
          aria-label="Eine Meldung abziehen"
          disabled={loading || count <= 0}
          onClick={() => change(count - 1)}
          className={cn(BUTTON_BASE, "border bg-background text-foreground hover:bg-muted")}
        >
          <Minus className="size-6" />
        </button>
        {loading ? (
          // Gleiche Hoehe wie Zahl (44px) plus Label (mt-1 + 16px), damit
          // beim Eintreffen der Daten nichts springt.
          <div className="flex flex-1 flex-col items-center" aria-hidden="true">
            <div className="h-11 w-12 animate-pulse rounded-md bg-muted" />
            <div className="mt-1 h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div role="status" aria-live="polite" className="flex flex-1 flex-col items-center">
            <span className={cn("min-w-[3ch] text-center text-[44px] font-semibold leading-none tabular-nums", !recorded && "text-muted-foreground")}>
              {recorded ? count : "–"}
            </span>
            <span className="mt-1 text-[12px] text-muted-foreground">{label}</span>
          </div>
        )}
        <button
          type="button"
          aria-label="Eine Meldung hinzufuegen"
          disabled={loading || count >= MAX_COUNT}
          onClick={() => change(count + 1)}
          className={cn(BUTTON_BASE, "bg-primary text-primary-foreground hover:bg-primary/90")}
        >
          <Plus className="size-6" />
        </button>
      </div>
      <div className="min-h-11">
        {!loading && (
          <button
            type="button"
            onClick={recorded ? clearRecord : () => change(0)}
            className="min-h-11 text-[13px] text-muted-foreground [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {recorded ? "Erfassung loeschen" : "Da gewesen, keine Meldung"}
          </button>
        )}
      </div>
    </div>
  );
}


export function LessonParticipationEditor({
  target,
  onClose,
  onSaved,
}: {
  target: LessonParticipationTarget | null;
  onClose: () => void;
  onSaved: (schoolBlockId: string, count: number | null) => void;
}) {
  return (
    <Overlay open={target !== null} onClose={onClose} labelledBy="lesson-participation-title">
      {target ? (
        <>
          {target.color ? (
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: target.color }} />
          ) : null}
          <header className="flex items-start gap-2 px-5 pt-4">
            <div className="min-w-0 flex-1">
              <h3 id="lesson-participation-title" className="text-[16px] font-semibold leading-tight tracking-tight">
                {target.subject}
              </h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {target.dayLabel}, {target.time}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Meldungen schliessen"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground focus-visible:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </header>
          <ParticipationCounter
            key={target.schoolBlockId}
            schoolBlockId={target.schoolBlockId}
            onSaved={onSaved}
            className="px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          />
        </>
      ) : null}
    </Overlay>
  );
}
