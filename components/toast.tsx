"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

// Schlanke Eigenloesung statt sonner (das in 36f031b bewusst entfernt wurde).
// Ursprruenglich nur fuer den einen Fall gedacht, den die Spec kannte: ein
// fehlgeschlagener Request, dessen Optimistic-Update zurueckgesprungen ist.
// Der Bot-Chat meldet darueber inzwischen auch erfolgreiche Aktionen
// (Rueckgaengig, Note eingetragen) -- dafuer gibt es die zweite Variante
// "success" mit eigenem Symbol, statt ueberall das Fehler-Rot zu zeigen.
// Dritte Variante "warning": der Vorgang hat geklappt, aber etwas ist dabei
// verloren gegangen (ein Blatt liess sich nicht lesen, Einheiten mussten
// gestrichen werden). Weder gruener Haken noch Fehler-Rot waere wahr -- das
// eine verschweigt die Einbusse, das andere behauptet, der Vorgang sei
// gescheitert. Amber ist im Projekt schon die Farbe dafuer (lernplan-ui.tsx,
// morgen-panel.tsx).

const EASE = [0.22, 1, 0.36, 1] as const;
// Exportiert, damit ein Aufrufer mit "Rueckgaengig"-Aktion (z.B. das
// Loeschen einer Aufgabe) seine eigene Frist exakt auf die sichtbare Dauer
// des Toasts abstimmen kann, statt eine zweite Zahl zu raten.
// ACHTUNG: die sichtbare Dauer ist NUR eine Untergrenze. Der Timer pausiert,
// solange Zeiger oder Fokus auf dem Toast liegen (siehe ToastCard) -- der
// Toast lebt also moeglicherweise deutlich laenger als TOAST_DURATION.
//
// Hier stand frueher die Behauptung, das sei "die sichere Richtung", weil ein
// an TOAST_DURATION gebundener Folge-Timer im Aufrufer nie feuere, waehrend
// der Rueckgaengig-Knopf noch sichtbar ist. Das war falsch, und zwar genau
// verkehrt herum: die Aussage folgte aus "Toast lebt genau TOAST_DURATION",
// und die Pause hebt diese Praemisse auf. Wer die Maus auf den Toast fuehrt
// (der einzige Weg, den Knopf zu treffen) und liest, haelt den Toast am
// Leben, waehrend die Frist des Aufrufers ablaeuft -- der Klick landet dann
// im Leeren, im gemeldeten Fall mitsamt dem verworfenen Entwurf.
//
// Daraus die Regel fuer Aufrufer: **binde nichts Unwiderrufliches an
// TOAST_DURATION.** Die Konstante taugt fuer Anzeigezwecke, nicht als Frist
// fuer eine Aktion, die der Nutzer ueber den Toast noch abwenden koennen
// soll. lernplan-erstellen.tsx macht es richtig: der Entwurf haengt an einem
// Marker in sessionStorage, der beim naechsten Oeffnen der Seite ausgewertet
// wird, nicht an einer Uhr.
export const TOAST_DURATION = 4000;
const DURATION = TOAST_DURATION;
// Ein Toast MIT Aktion ist ein Angebot, kein Hinweis: der Nutzer muss den
// Knopf noch finden und treffen koennen. Mit der Tastatur heisst das, bis ans
// Ende des DOM zu tabben -- in vier Sekunden schafft das niemand, und die
// Pause bei Hover/Fokus hilft nur, wer schon dort ist. Darum laeuft ein Toast
// mit Aktion deutlich laenger. Er bleibt trotzdem endlich: siehe die Regel
// oben, an TOAST_DURATION haengt nichts Unwiderrufliches.
const DURATION_MIT_AKTION = 12000;
type ToastVariant = "error" | "success" | "warning";
// action ist additiv: ein Toast kann eine einzelne Aktion tragen (z.B.
// "Rueckgaengig"), die verschwindet, sobald der Toast selbst verschwindet --
// darum kein eigener Timer fuer die Aktion, sie teilt sich den des Toasts.
// Sie verlaengert aber dessen Frist auf DURATION_MIT_AKTION.
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; variant: ToastVariant; action?: ToastAction };

const ToastCtx = createContext<(message: string, variant?: ToastVariant, action?: ToastAction) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

// A2 (Fokus): .focus() allein bringt ein Ziel unterhalb/oberhalb des
// Sichtbereichs nicht zuverlaessig ins Bild -- explizit hereinscrollen statt
// sich auf das Standardverhalten des Browsers zu verlassen (gleiches Muster
// wie fokussiereSichtbar in lernplan-erstellen.tsx).
function fokussiereSichtbar(el: HTMLElement | null | undefined) {
  if (!el) return;
  el.focus();
  const reduziert = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduziert ? "auto" : "smooth", block: "nearest" });
}

function ToastCard({
  toast: t,
  reduce,
  remove,
}: {
  toast: Toast;
  reduce: boolean | null;
  remove: (id: number) => void;
}) {
  const kartenRef = useRef<HTMLDivElement | null>(null);
  // Zwei Klicks auf "Rueckgaengig" im selben Tick wuerden onClick zweimal
  // ausloesen: das Entfernen laeuft ueber State und greift erst nach dem
  // Re-Render. Die Aktion ist aber typischerweise ein Request (eine geloeschte
  // Aufgabe wiederherstellen) -- zweimal geschickt legt sie doppelt an oder
  // laeuft in einen Konflikt. Jede Karte hat ihre eigene ID, der Ref muss also
  // nicht ueber mehrere Toasts hinweg geteilt werden.
  const ausgeloestRef = useRef(false);

  // Fokus vor dem Erscheinen des Toasts (typischerweise der Knopf, der die
  // Aktion ausgeloest hat) -- Auffangziel, falls der Toast verschwindet,
  // waehrend der Fokus noch in ihm steht (siehe fokussiereSichtbar-Muster in
  // lernplan-seite.tsx/lernplan-erstellen.tsx).
  const vorherigesElementRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    vorherigesElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  // Pausierbarer Timer: haelt die Restzeit statt eines festen Ablaufzeitpunkts,
  // damit Hover/Fokus ihn anhalten und exakt an derselben Stelle fortsetzen
  // koennen. timerRef ist null, waehrend pausiert ist.
  const restRef = useRef(t.action ? DURATION_MIT_AKTION : DURATION);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zeigerAufKarteRef = useRef(false);
  const fokusInKarteRef = useRef(false);

  const beendeUndFokusRestaurieren = useCallback(() => {
    const karte = kartenRef.current;
    if (karte && karte.contains(document.activeElement)) {
      const ziel = vorherigesElementRef.current;
      // Auffangziel nur, wenn es noch im DOM haengt -- sonst bleibt der Fokus
      // dem Standardverhalten des Browsers ueberlassen (faellt auf body).
      if (ziel && document.contains(ziel)) fokussiereSichtbar(ziel);
    }
    remove(t.id);
  }, [remove, t.id]);

  const starten = useCallback(
    (ms: number) => {
      startRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        beendeUndFokusRestaurieren();
      }, ms);
    },
    [beendeUndFokusRestaurieren],
  );

  const stoppen = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    restRef.current = Math.max(0, restRef.current - (Date.now() - startRef.current));
  }, []);

  useEffect(() => {
    starten(restRef.current);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
    // Nur beim Mount starten -- starten/stoppen aendern sich pro Render nicht
    // in einer Weise, die einen Neustart rechtfertigt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aktualisierePause = useCallback(() => {
    if (zeigerAufKarteRef.current || fokusInKarteRef.current) {
      stoppen();
    } else if (timerRef.current === null && restRef.current > 0) {
      starten(restRef.current);
    }
  }, [starten, stoppen]);

  return (
    <motion.div
      ref={kartenRef}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: EASE }}
      onMouseEnter={() => {
        zeigerAufKarteRef.current = true;
        aktualisierePause();
      }}
      onMouseLeave={() => {
        zeigerAufKarteRef.current = false;
        aktualisierePause();
      }}
      onFocus={() => {
        fokusInKarteRef.current = true;
        aktualisierePause();
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        fokusInKarteRef.current = false;
        aktualisierePause();
      }}
      className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-popover"
    >
      {t.variant === "success" ? (
        <CheckCircle2 className="mt-px size-4 shrink-0 text-primary" />
      ) : t.variant === "warning" ? (
        <AlertTriangle className="mt-px size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      ) : (
        <AlertCircle className="mt-px size-4 shrink-0 text-destructive" />
      )}
      <span className="flex-1">{t.message}</span>
      {t.action && (
        <button
          type="button"
          onClick={() => {
            if (ausgeloestRef.current) return;
            ausgeloestRef.current = true;
            t.action!.onClick();
            beendeUndFokusRestaurieren();
          }}
          className="relative -my-1 -mr-1 shrink-0 rounded px-1.5 py-1 font-medium text-primary underline-offset-2 outline-none before:absolute before:-inset-2.5 before:content-[''] hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.action.label}
        </button>
      )}
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduce = useReducedMotion();

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback((message: string, variant: ToastVariant = "error", action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, variant, action }]);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {/* aria-live: die Meldung erreicht auch Screenreader, ohne den Fokus zu
          stehlen. pointer-events-none am Container -> der Stapel blockiert
          nichts, die Karten selbst bleiben klickbar. bottom-20 statt bottom-4,
          damit der Stapel nicht auf einer bodennahen Eingabeleiste liegt (z. B.
          das Bot-Eingabefeld).
          S6-Fix: "error" braucht eine eigene ASSERTIVE Region (role="alert"),
          sonst wartet die Fehlermeldung hoeflich hinter jeder laufenden
          Ansage. Zwei feste Regionen statt einer bedingt gerenderten: beide
          stehen von Anfang an im DOM (eine leere Live-Region, die erst beim
          ersten Toast entsteht, wuerde von Screenreadern nicht mehr erfasst).
          Jeder Toast rendert in GENAU einer der beiden -- nie in beiden --,
          sonst wuerde dieselbe Meldung zweimal angesagt. display:contents auf
          den Regionen selbst haelt das Layout (Reihenfolge/Abstand) beim
          gemeinsamen Elternflex, ohne dass die Regionen selbst eine Box
          bilden. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4">
        <div role="status" aria-live="polite" className="contents">
          <AnimatePresence initial={false}>
            {toasts
              .filter((t) => t.variant !== "error")
              .map((t) => (
                <ToastCard key={t.id} toast={t} reduce={reduce} remove={remove} />
              ))}
          </AnimatePresence>
        </div>
        <div role="alert" aria-live="assertive" className="contents">
          <AnimatePresence initial={false}>
            {toasts
              .filter((t) => t.variant === "error")
              .map((t) => (
                <ToastCard key={t.id} toast={t} reduce={reduce} remove={remove} />
              ))}
          </AnimatePresence>
        </div>
      </div>
    </ToastCtx.Provider>
  );
}
