"use client";

// Meldungszaehler: ein grosser Zaehlstand je konkreter Schulstunde, gedacht
// fuer die Bedienung WAEHREND des Unterrichts mit einem Daumen. Strukturell
// die Zwillingsschwester von components/lesson-note.tsx (gleiches
// Overlay-Geruest, gleicher Fachrand, gleiches Autosave-Muster) -- der
// Unterschied ist die Eingabe: kein Textfeld, sondern +1/-1 auf einer Zahl.
// Wird sowohl vom Stundenplan (app/page.tsx) als auch vom Fachdetail
// (components/subject-detail.tsx) geoeffnet.

import { useEffect, useRef, useState } from "react";
import { Loader2, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Overlay } from "@/components/subject-notes";
import { useToast } from "@/components/toast";
import { MAX_COUNT } from "@/lib/participation";
import { cn } from "@/lib/utils";

// Identische Felder wie LessonNoteTarget -- gleiche Kopfzeile, gleicher Aufrufer.
export type LessonParticipationTarget = {
  schoolBlockId: string;
  subject: string;
  dayLabel: string; // "Montag, 02.09."
  time: string; // "08:00" oder "08:00–08:45"
  color?: string | null;
};

type SaveState = "idle" | "loading" | "saving" | "saved" | "error";

export function LessonParticipationEditor({
  target,
  onClose,
  onSaved,
}: {
  target: LessonParticipationTarget | null;
  onClose: () => void;
  // Meldet nach jedem erfolgreichen Speichern/Loeschen den neuen Stand --
  // null bedeutet "nicht erfasst" (nach DELETE). Der Aufrufer aktualisiert
  // damit Marker (Stundenplan) bzw. Eintrag (Fachdetail) ohne vollen Reload.
  onSaved: (schoolBlockId: string, count: number | null) => void;
}) {
  const toast = useToast();
  const open = target !== null;

  const [count, setCount] = useState(0);
  // Solange nichts erfasst ist (kein GET-Treffer, noch nicht gespeichert),
  // legt der erste Tastendruck die Zeile erst an -- der "Nicht erfasst"-Knopf
  // erscheint erst danach.
  const [recorded, setRecorded] = useState(false);
  const [state, setState] = useState<SaveState>("idle");

  const countRef = useRef(0);
  countRef.current = count;
  const savedCountRef = useRef<number | null>(null);
  const blockIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Race-Schutz wie typedRef in lesson-note.tsx: kommt die GET-Antwort erst
  // NACH dem ersten Tippen an, darf sie den schon gezaehlten Stand nicht
  // ueberschreiben.
  const typedRef = useRef(false);

  async function persist(schoolBlockId: string, value: number) {
    setState("saving");
    try {
      const res = await fetch(`/api/lessons/${schoolBlockId}/participation`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: value }),
      });
      const data = (await res.json().catch(() => null)) as
        | { participation?: { count: number } | null; error?: string }
        | null;
      if (!res.ok) {
        toast(data?.error ?? "Die Meldungen konnten nicht gespeichert werden.");
        setState("error");
        return;
      }
      savedCountRef.current = value;
      setRecorded(true);
      setState("saved");
      onSaved(schoolBlockId, value);
    } catch {
      toast("Keine Verbindung zum Server. Die Meldungen wurden nicht gespeichert.");
      setState("error");
    }
  }

  // Zaehlstand laden, sobald sich das Ziel aendert (neue Stunde geoeffnet).
  useEffect(() => {
    if (!target) return;
    let alive = true;
    blockIdRef.current = target.schoolBlockId;
    typedRef.current = false;
    setState("loading");
    setCount(0);
    setRecorded(false);
    savedCountRef.current = null;
    fetch(`/api/lessons/${target.schoolBlockId}/participation`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { participation: { count: number } | null }) => {
        if (!alive) return;
        // Nur uebernehmen, wenn seit dem Oeffnen noch nichts angetippt wurde
        // -- sonst reisst die spaet ankommende Antwort den schon gezaehlten
        // Stand wieder raus.
        if (!typedRef.current) {
          if (d.participation) {
            savedCountRef.current = d.participation.count;
            setCount(d.participation.count);
            setRecorded(true);
          } else {
            savedCountRef.current = null;
            setCount(0);
            setRecorded(false);
          }
        }
        setState("idle");
      })
      .catch(() => {
        if (alive) {
          toast("Die Meldungen konnten nicht geladen werden.");
          savedCountRef.current = null;
          setState("idle");
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.schoolBlockId]);

  // Autosave: ~600ms nach der letzten Aenderung, nur wenn sich der Stand vom
  // zuletzt gespeicherten unterscheidet (auch null -> Zahl zaehlt als Aenderung).
  useEffect(() => {
    if (!target || state === "loading") return;
    if (!typedRef.current) return;
    if (savedCountRef.current === count) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persist(target.schoolBlockId, count);
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, target?.schoolBlockId]);

  // Speichern beim Schliessen: ein pending Debounce wird sofort ausgeloest
  // statt verworfen. Fokus, Escape und Body-Scroll-Sperre uebernimmt Overlay.
  useEffect(() => {
    if (!open) return;
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const id = blockIdRef.current;
      const current = countRef.current;
      if (id && typedRef.current && savedCountRef.current !== current) {
        void persist(id, current);
      }
    };
  }, [open]);

  function bump(delta: 1 | -1) {
    typedRef.current = true;
    setCount((c) => Math.min(MAX_COUNT, Math.max(0, c + delta)));
  }

  // Eine erfasste 0 ist der Kern des Schnitts (Stunde da gewesen, nie gemeldet),
  // sie muss deshalb mit EINEM Griff erreichbar sein. Ueber die Knoepfe ginge
  // sie nur als Umweg (+1 dann -1), weil -1 bei 0 gesperrt ist.
  function recordZero() {
    const id = target?.schoolBlockId;
    if (!id) return;
    typedRef.current = true;
    setCount(0);
    void persist(id, 0);
  }

  async function clear() {
    const id = target?.schoolBlockId;
    if (!id) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setState("saving");
    try {
      const res = await fetch(`/api/lessons/${id}/participation`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      savedCountRef.current = null;
      typedRef.current = false;
      setCount(0);
      setRecorded(false);
      setState("idle");
      onSaved(id, null);
    } catch {
      toast("Die Erfassung konnte nicht entfernt werden.");
      setState("error");
    }
  }

  const statusLabel =
    state === "saving" ? "Speichert …" : state === "saved" ? "Gespeichert" : state === "error" ? "Fehler" : "";

  return (
    <Overlay open={open} onClose={onClose} labelledBy="lesson-participation-title">
      {target ? (
        <>
          {/* Fachrand: identisches Muster wie in lesson-note.tsx. */}
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
              aria-label="Meldungen schließen"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground focus-visible:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </header>

          <div className="flex flex-col items-center gap-1 px-5 pt-4 pb-2">
            {/* Grosse zentrale Zahl -- das Einzige, wonach beim Melden waehrend
                des Unterrichts geschaut wird. aria-live meldet Aenderungen auch
                Screenreader-Nutzern, ohne dass sie den Dialog neu abtasten
                muessen. */}
            <span
              className="text-5xl font-semibold leading-none tabular-nums"
              role="status"
              aria-live="polite"
            >
              {count}
            </span>
            <span className="text-[13px] text-muted-foreground">Meldungen</span>
          </div>

          <div className="flex items-stretch gap-2 px-5 pb-3">
            {/* +1 gross und ueber die volle Breite, -1 kleiner daneben -- in der
                Stunde wird fast nur hochgezaehlt, das Zuruecknehmen ist der
                seltene Korrekturfall. 56px Mindesthoehe = mit einem Daumen
                sicher zu treffen, auch ohne hinzusehen. */}
            <button
              type="button"
              onClick={() => bump(-1)}
              disabled={count <= 0}
              aria-label="Eine Meldung abziehen"
              className="grid h-14 w-16 shrink-0 place-items-center rounded-xl border bg-background text-muted-foreground transition-colors [touch-action:manipulation] hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Minus className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => bump(1)}
              disabled={count >= MAX_COUNT}
              aria-label="Eine Meldung hinzufügen"
              className="grid h-14 flex-1 place-items-center rounded-xl bg-primary text-2xl font-semibold text-primary-foreground transition-colors [touch-action:manipulation] hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Plus className="size-6" />
            </button>
          </div>

          {/* Zwei Zustaende an derselben Stelle: solange nichts erfasst ist,
              legt "0 erfassen" die Zeile mit dem Wert 0 an; danach nimmt
              "Nicht erfasst" sie wieder ganz raus. Ein Loeschen-Knopf vor der
              ersten Erfassung waere irrefuehrend, es gaebe nichts zu loeschen. */}
          <div className="flex justify-center px-5 pb-2">
            <button
              type="button"
              onClick={recorded ? () => void clear() : recordZero}
              className="rounded px-2 py-1 text-[12px] text-muted-foreground underline-offset-2 transition-colors [touch-action:manipulation] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {recorded ? "Nicht erfasst" : "0 erfassen"}
            </button>
          </div>

          <footer className="flex min-h-11 items-center justify-end gap-2 px-5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
            <span
              className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <Loader2 className={cn("size-3 animate-spin", state !== "saving" && "invisible")} />
              <span className={cn("inline-block min-w-[11ch]", state === "error" && "text-destructive")}>
                {statusLabel}
              </span>
            </span>
          </footer>
        </>
      ) : null}
    </Overlay>
  );
}
