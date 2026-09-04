"use client";

// Meldungszaehler: ein grosser Zaehlstand je konkreter Schulstunde, gedacht
// fuer die Bedienung WAEHREND des Unterrichts mit einem Daumen. Strukturell
// die Zwillingsschwester von components/lesson-note.tsx (gleiches
// Overlay-Geruest, gleicher Fachrand, gleiches Autosave-Muster) -- der
// Unterschied ist die Eingabe: kein Textfeld, sondern +1/-1 auf einer Zahl.
// Wird sowohl vom Stundenplan (app/page.tsx) als auch vom Fachdetail
// (components/subject-detail.tsx) geoeffnet.
//
// Zwei Ebenen: ParticipationCounter ist der Zaehler selbst (Laden, Autosave,
// Knoepfe) und weiss nichts von einem Overlay -- der Vollbild-Stundenmodus
// (components/jetzt-stunde.tsx) setzt ihn direkt in die Seite. Der
// LessonParticipationEditor darunter ist nur noch das Dialog-Geruest drumherum.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Minus, Plus, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Overlay } from "@/components/subject-notes";
import { useToast } from "@/components/toast";
import { MAX_COUNT } from "@/lib/participation";
import { cn } from "@/lib/utils";

// Atlas-Signaturkurve, identisch zu components/stagger.tsx und der
// --ease-atlas-Custom-Property, die components/ui/button.tsx fuer den
// Press-State nutzt.
const EASE = [0.22, 1, 0.36, 1] as const;

// Haptik-Analogon: ein sehr kurzer Vibrationsimpuls beim Hochzaehlen, als
// zusaetzliches Feedback neben der visuellen Zahlen-Animation. Ein Bonus,
// keine tragende Saeule: iOS Safari kennt die Vibration API ueberhaupt
// nicht (dort passiert schlicht nichts, sauber abgefangen durch die
// Feature-Detection), nur auf Android-Browsern kommt sie an. Das eigentliche
// "sicher ohne Hinsehen zaehlen" traegt deshalb allein die Geometrie: der
// +1-Knopf ist gross und gut vom -1-Knopf abgesetzt, ein Fehltipp ist billig
// (Rueckgaengig-Chip, siehe bump()) -- nicht die Vibration.
// Wer prefers-reduced-motion gesetzt hat, will in aller Regel weniger
// sensorische Reize insgesamt, nicht nur weniger Bewegung auf dem Bildschirm
// -- deshalb entscheidet der Aufrufer per reduce-Flag, ob ueberhaupt
// vibriert wird (siehe bump()).
function tick() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
  } catch {
    // Vibration ist ein Bonus, kein Pflichtfeedback -- Fehler ignorieren.
  }
}

// Identische Felder wie LessonNoteTarget -- gleiche Kopfzeile, gleicher Aufrufer.
export type LessonParticipationTarget = {
  schoolBlockId: string;
  subject: string;
  dayLabel: string; // "Montag, 02.09."
  time: string; // "08:00" oder "08:00–08:45"
  color?: string | null;
};

type SaveState = "idle" | "loading" | "saving" | "saved" | "error";

// Der Zaehler ohne jedes Dialog-Geruest. Ein Wechsel der Stunde laeuft ueber
// ein Remount (key={schoolBlockId} beim Aufrufer) statt ueber einen
// Ziel-Wechsel im laufenden Zustand: so greift derselbe Weg, der auch beim
// Schliessen einen offenen Autosave noch wegschreibt (Cleanup unten).
export function ParticipationCounter({
  schoolBlockId,
  onSaved,
  className,
  footerClassName,
}: {
  schoolBlockId: string;
  // Meldet nach jedem erfolgreichen Speichern/Loeschen den neuen Stand --
  // null bedeutet "nicht erfasst" (nach DELETE). Der Aufrufer aktualisiert
  // damit Marker (Stundenplan) bzw. Eintrag (Fachdetail) ohne vollen Reload.
  onSaved: (schoolBlockId: string, count: number | null) => void;
  className?: string;
  // Zusatzklassen fuer die Statuszeile -- im Overlay traegt sie das
  // Safe-Area-Polster, in der Seite braucht sie es nicht.
  footerClassName?: string;
}) {
  const toast = useToast();
  const reduce = useReducedMotion();

  const [count, setCount] = useState(0);
  // Zeigt kurz nach einem +1-Tap eine "Rueckgaengig"-Chip -- die schnelle
  // Korrektur eines Fehlklicks, ohne dass der Blick zum -1-Knopf wandern
  // muss. Reserviert eigenen Platz (siehe unten), damit ihr Erscheinen
  // nichts verschiebt.
  const [showUndo, setShowUndo] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Treibt den Skalen-Puls der Zahl an -- siehe bump().
  const [pulse, setPulse] = useState(0);
  // Solange nichts erfasst ist (kein GET-Treffer, noch nicht gespeichert),
  // legt der erste Tastendruck die Zeile erst an -- der "Nicht erfasst"-Knopf
  // erscheint erst danach.
  const [recorded, setRecorded] = useState(false);
  const [state, setState] = useState<SaveState>("idle");

  const countRef = useRef(0);
  countRef.current = count;
  const savedCountRef = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Race-Schutz wie typedRef in lesson-note.tsx: kommt die GET-Antwort erst
  // NACH dem ersten Tippen an, darf sie den schon gezaehlten Stand nicht
  // ueberschreiben.
  const typedRef = useRef(false);

  async function persist(id: string, value: number) {
    setState("saving");
    try {
      const res = await fetch(`/api/lessons/${id}/participation`, {
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
      onSaved(id, value);
    } catch {
      toast("Keine Verbindung zum Server. Die Meldungen wurden nicht gespeichert.");
      setState("error");
    }
  }

  // Zaehlstand laden.
  useEffect(() => {
    let alive = true;
    typedRef.current = false;
    setState("loading");
    fetch(`/api/lessons/${schoolBlockId}/participation`)
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
  }, [schoolBlockId]);

  // Autosave: ~600ms nach der letzten Aenderung, nur wenn sich der Stand vom
  // zuletzt gespeicherten unterscheidet (auch null -> Zahl zaehlt als Aenderung).
  useEffect(() => {
    if (state === "loading") return;
    if (!typedRef.current) return;
    if (savedCountRef.current === count) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persist(schoolBlockId, count);
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, schoolBlockId]);

  // Speichern beim Verschwinden (Dialog zu, Stunde gewechselt, Seite
  // umgeschaltet): ein pending Debounce wird sofort ausgeloest statt verworfen.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
      const current = countRef.current;
      if (typedRef.current && savedCountRef.current !== current) {
        void persist(schoolBlockId, current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolBlockId]);

  function bump(delta: 1 | -1) {
    typedRef.current = true;
    setCount((c) => Math.min(MAX_COUNT, Math.max(0, c + delta)));
    // pulse zaehlt bei jedem NUTZER-Tap hoch (Plus, Minus, Rueckgaengig) und
    // treibt ausschliesslich den Skalen-Puls unten an -- getrennt von count
    // selbst, weil count sich auch beim Laden (GET-Antwort) aendert. Ohne
    // diese Trennung wuerde die Zahl beim OEFFNEN des Dialogs mitpulsen,
    // sobald der geladene Stand eintrifft, statt nur bei echten Taps.
    setPulse((p) => p + 1);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (delta === 1) {
      // Haptik-Analogon nur beim Hochzaehlen -- das ist die haeufige,
      // bestaetigende Aktion; -1 ist schon die Korrektur und braucht keinen
      // zusaetzlichen Impuls. An reduce gekoppelt wie die visuelle Motion:
      // prefers-reduced-motion heisst in aller Regel "weniger Reize
      // insgesamt", nicht nur "weniger Bewegung auf dem Bildschirm".
      if (!reduce) tick();
      setShowUndo(true);
      undoTimerRef.current = setTimeout(() => setShowUndo(false), 2500);
    } else {
      // Manuelles -1 ist selbst schon die Korrektur -- die Chip fuer die
      // vorherige waere jetzt nur noch verwirrend.
      setShowUndo(false);
    }
  }

  // Rueckgaengig ist funktional identisch zu einem manuellen -1 -- geht
  // deshalb durch dieselbe Funktion statt eigene Logik zu duplizieren.
  function undoLast() {
    bump(-1);
  }

  // Eine erfasste 0 ist der Kern des Schnitts (Stunde da gewesen, nie gemeldet),
  // sie muss deshalb mit EINEM Griff erreichbar sein. Ueber die Knoepfe ginge
  // sie nur als Umweg (+1 dann -1), weil -1 bei 0 gesperrt ist.
  function recordZero() {
    typedRef.current = true;
    setCount(0);
    void persist(schoolBlockId, 0);
  }

  async function clear() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setState("saving");
    try {
      const res = await fetch(`/api/lessons/${schoolBlockId}/participation`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      savedCountRef.current = null;
      typedRef.current = false;
      setCount(0);
      setRecorded(false);
      setState("idle");
      onSaved(schoolBlockId, null);
    } catch {
      toast("Die Erfassung konnte nicht entfernt werden.");
      setState("error");
    }
  }

  const statusLabel =
    state === "saving" ? "Speichert …" : state === "saved" ? "Gespeichert" : state === "error" ? "Fehler" : "";

  return (
    <div className={className}>
      <div className="flex flex-col items-center gap-1 pt-4 pb-2">
        {/* Grosse zentrale Zahl -- das Einzige, wonach beim Melden waehrend
            des Unterrichts geschaut wird. aria-live meldet Aenderungen auch
            Screenreader-Nutzern, ohne dass sie den Dialog neu abtasten
            muessen. tabular-nums + fester Zeilenraum halten die Breite und
            Hoehe konstant, ein zusaetzlicher Skalen-Puls (nicht Layout!)
            bestaetigt jeden Tap sichtbar, ohne die Zahl zu verschieben. */}
        <span role="status" aria-live="polite" className="text-5xl font-semibold leading-none tabular-nums">
          <motion.span
            key={pulse}
            // pulse === 0 ist der Ausgangszustand vor jedem Tap (auch
            // direkt nach dem Oeffnen des Dialogs) -- der darf nicht
            // pulsen, sonst animiert die Zahl beim blossen Oeffnen mit.
            initial={reduce || pulse === 0 ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="inline-block"
          >
            {count}
          </motion.span>
        </span>
        <span className="text-[13px] text-muted-foreground">Meldungen</span>
      </div>

      <div className="flex items-stretch gap-2 pb-3">
        {/* +1 gross und ueber die volle Breite, -1 kleiner daneben -- in der
            Stunde wird fast nur hochgezaehlt, das Zuruecknehmen ist der
            seltene Korrekturfall. 56px Mindesthoehe = mit einem Daumen
            sicher zu treffen, auch ohne hinzusehen. active:scale ist das
            gleiche Press-Feedback wie components/ui/button.tsx (Atlas-
            Kurve, scale in der Transition-Liste), motion-safe: haelt es
            aus prefers-reduced-motion raus. */}
        <button
          type="button"
          onClick={() => bump(-1)}
          disabled={count <= 0}
          aria-label="Eine Meldung abziehen"
          className="grid h-14 w-16 shrink-0 place-items-center rounded-xl border bg-background text-muted-foreground transition-[color,background-color,scale] duration-150 ease-[var(--ease-atlas)] [touch-action:manipulation] motion-safe:active:scale-[0.96] hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Minus className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => bump(1)}
          disabled={count >= MAX_COUNT}
          aria-label="Eine Meldung hinzufügen"
          className="grid h-14 flex-1 place-items-center rounded-xl bg-primary text-2xl font-semibold text-primary-foreground transition-[color,background-color,scale] duration-150 ease-[var(--ease-atlas)] [touch-action:manipulation] motion-safe:active:scale-[0.96] hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Plus className="size-6" />
        </button>
      </div>

      {/* Rueckgaengig-Chip direkt ueber dem Erfassungs-Link, in einer Spalte
          mit echtem gap-2 (8px) dazwischen -- beide haben eine per
          before:-inset-1 aufgeblaehte Treffflaeche (gleiches Mass wie
          components/ui/button.tsx), 4px Ueberstand je Seite bleibt damit
          innerhalb der 8px Luecke: die beiden Trefflaechen beruehren sich
          hoechstens, sie ueberlappen nie -- kein Fehlklick zwischen
          "Rueckgaengig" und "Nicht erfasst" moeglich. Der Chip-Slot hat
          eine feste Mindesthoehe, ihr Ein-/Ausblenden verschiebt darunter
          nichts (kein Layout-Shift). */}
      <div className="flex flex-col items-center gap-2 pb-2">
        <div className="flex min-h-9 items-center justify-center">
          <AnimatePresence>
            {showUndo && (
              <motion.button
                type="button"
                onClick={undoLast}
                initial={reduce ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: EASE }}
                aria-label="Letzte Meldung rückgängig machen"
                className="relative flex items-center gap-1 rounded-full bg-muted px-2.5 py-3 text-[12px] font-medium text-muted-foreground [touch-action:manipulation] before:absolute before:-inset-1 before:content-[''] hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Undo2 className="size-3" aria-hidden="true" />
                Rückgängig
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Zwei Zustaende an derselben Stelle: solange nichts erfasst ist,
            legt "0 erfassen" die Zeile mit dem Wert 0 an; danach nimmt
            "Nicht erfasst" sie wieder ganz raus. Ein Loeschen-Knopf vor der
            ersten Erfassung waere irrefuehrend, es gaebe nichts zu loeschen. */}
        <button
          type="button"
          onClick={recorded ? () => void clear() : recordZero}
          className="relative rounded px-2 py-3 text-[12px] text-muted-foreground underline-offset-2 transition-colors [touch-action:manipulation] before:absolute before:-inset-1 before:content-[''] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {recorded ? "Nicht erfasst" : "0 erfassen"}
        </button>
      </div>

      <footer className={cn("flex min-h-11 items-center justify-end gap-2", footerClassName)}>
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
  const open = target !== null;

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

          {/* key: ein Wechsel der Stunde bei offenem Dialog setzt den Zaehler
              komplett neu auf -- und schreibt dabei ueber das Unmount-Cleanup
              einen noch offenen Autosave der vorherigen Stunde weg. */}
          <ParticipationCounter
            key={target.schoolBlockId}
            schoolBlockId={target.schoolBlockId}
            onSaved={onSaved}
            className="px-5"
            // Das Overlay liegt fixed inset-0 und damit ausserhalb des
            // Layout-Containers aus app/layout.tsx, der das Safe-Area-Polster
            // traegt -- sonst klebt die Fusszeile auf dem iPhone am Home-Balken.
            footerClassName="pb-[calc(0.625rem+env(safe-area-inset-bottom))]"
          />
        </>
      ) : null}
    </Overlay>
  );
}
