"use client";

// Geteilte kleine UI-Bausteine des Lernplans: Phase-Chip, Sicherheits-Farben
// und -Balken. War vorher vierfach dupliziert in lernplan-seite.tsx,
// pruefungen-view.tsx, morgen-panel.tsx und stunden-cockpit.tsx -- jetzt eine
// Quelle (Referenz war lernplan-seite.tsx).
//
// LernenEinheitZeile (unten): war bytgleich zwischen morgen-panel.tsx
// (LernenEinheitZeile) und stunden-cockpit.tsx (CockpitLernenEinheitZeile) --
// echte Dopplung, kein Zufall, darum hierher gezogen. Bewusst NICHT
// zusammengelegt mit EinheitZeile aus lernplan-seite.tsx: die Planseite kennt
// Karten-/Fehlerzustaende (kartenLaeuft, kartenLokalFehler), einen manuellen
// "Wie lief es?"-Dialog-Pfad und Fokus-Ruecksprung nach dem Verschwinden der
// Zeile -- alles Zustaende, die es in der Tages- und Cockpit-Ansicht nicht
// gibt (dort ist "ueben"/"probe"/"simulation" immer nur ein Link, kein
// Dialog). Eine Zusammenlegung mit der Planseite haette mehr
// Unterscheidungs-Props gebraucht, als der Baustein wert ist.
//
// Die umgebenden Karten (LernenCard in morgen-panel.tsx, CockpitLernenCard in
// stunden-cockpit.tsx) bleiben dagegen bewusst getrennt: der Cockpit-Poll
// (setInterval alle 60s) ersetzt `data` komplett und braucht darum einen
// Nachzieh-Effekt ueber eine aus den Erledigt-Zeitstempeln abgeleitete
// Signatur statt ueber die Referenz von `plan` (siehe Kommentar dort) -- ein
// echter fachlicher Unterschied, keine zufaellige Abweichung.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ItemDTO, Phase, SicherheitQuelle } from "@/lib/lernplan-types";

// Gleiche Form wie der Rueckgabewert von useToast() in components/toast.tsx --
// hier eigens getippt, damit dieser gemeinsame Baustein nicht vom Toast-Modul
// abhaengt.
type ToastFn = (
  message: string,
  variant?: "error" | "success" | "warning",
  action?: { label: string; onClick: () => void },
) => void;

// Nativer Browser-Tooltip nur dort, wo der Text wirklich abgeschnitten ist --
// ein `title` an einem vollstaendig sichtbaren Titel laesst beim Verweilen
// einen Kasten aufgehen, der nichts Neues sagt. scrollWidth > clientWidth ist
// die uebliche Messung; der ResizeObserver haelt sie auch bei Layoutwechseln
// (Fensterbreite, Seitenleiste) aktuell und nicht nur beim Mount.
// externalRef: erlaubt, denselben Knoten zusaetzlich fuer einen zweiten Zweck
// zu referenzieren (der Plankopf-Titel ist zugleich Fokusziel), statt zwei
// Refs auf ein DOM-Element haengen zu muessen.
// Lag vorher dreifach vor -- in lernplan-seite.tsx, morgen-panel.tsx und
// stunden-cockpit.tsx -- weil die drei Dateien getrennt bearbeitet wurden.
export function useOverflowTitle<T extends HTMLElement = HTMLElement>(
  text: string,
  externalRef?: RefObject<T | null>,
) {
  const ownRef = useRef<T | null>(null);
  const ref = externalRef ?? ownRef;
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollWidth > el.clientWidth);
    check();
    const obs = new ResizeObserver(check);
    obs.observe(el);
    return () => obs.disconnect();
  }, [text]);
  return { ref, title: truncated ? text : undefined } as const;
}

// --- Minuten-Feld: spaet validieren -----------------------------------------
// Klemmen bei jedem Tastendruck macht das Feld waehrend des Tippens
// unbedienbar: wer die 30 loescht, um 45 zu tippen, hat sofort das Minimum im
// Feld stehen und tippt dann daran vorbei. Stattdessen haelt das Feld den
// rohen Eingabe-String lokal, erlaubt auch leer und Zwischenwerte, und klemmt
// erst beim Verlassen auf den gueltigen Bereich.
// Lag vorher nur in lernplan-erstellen.tsx. Die Planseite hat daneben ein
// eigenes, roheres Feld gebaut, das genau den beschriebenen Fehler wieder
// hatte -- darum jetzt hier, damit es nur eine Fassung gibt.
export function MinutenFeld({
  id,
  wert,
  min,
  max,
  onCommit,
  className,
  "aria-label": ariaLabel,
  toast,
}: {
  id?: string;
  wert: number;
  min: number;
  max: number;
  onCommit: (wert: number) => void;
  className?: string;
  "aria-label"?: string;
  // S6-Fix: optional, damit ein Klemmen (siehe commit unten) angesagt werden
  // kann -- ohne toast bleibt das Verhalten wie zuvor (stumm), das betrifft
  // aber inzwischen keinen Aufrufer mehr, alle drei Stellen in SchrittPunkte
  // haben toast zur Hand.
  toast?: ToastFn;
}) {
  const [roh, setRoh] = useState(String(wert));
  const bearbeitetRef = useRef(false);

  useEffect(() => {
    if (!bearbeitetRef.current) setRoh(String(wert));
  }, [wert]);

  function commit() {
    bearbeitetRef.current = false;
    // Ganzzahlig runden -- der Server lehnt sonst z.B. "30.5" mit dem Code
    // "punkte" ab, ohne dass beim Tippen etwas darauf hingewiesen haette.
    // NIT: ein geleertes Feld faellt auf den vorherigen Wert zurueck, nicht
    // auf das Minimum -- sonst verliert der Nutzer z.B. seine 45 Minuten nur,
    // weil er sie kurz geloescht hatte. "0" ist dagegen eine echte
    // Tastenfolge, kein leeres Feld -- `Number(roh) || wert` behandelte
    // beides gleich (0 ist falsy) und klemmte "0" stillschweigend auf den
    // alten Wert statt auf `min`. Erst auf ein wirklich leeres (getrimmtes)
    // Feld faellt der alte Wert zurueck, "0" wird wie jede andere Zahl
    // geparst und dann normal geklemmt.
    const leer = roh.trim() === "";
    const geparst = leer ? wert : Number(roh);
    const gerundet = Math.round(Number.isNaN(geparst) ? wert : geparst);
    const geklemmt = Math.min(max, Math.max(min, gerundet));
    setRoh(String(geklemmt));
    if (geklemmt !== wert) onCommit(geklemmt);
    // S6-Fix: dasselbe Muster wie bei zusammenlegen() oben (Minuten auf 90
    // gekappt) -- ohne diese Ansage sah der Nutzer nur, dass sein getippter
    // Wert beim Verlassen des Felds durch einen anderen ersetzt wurde, ohne
    // zu erfahren, dass und warum. Nur bei einer echten, ausserhalb des
    // Bereichs liegenden Zahl (nicht beim leeren-Feld-Fallback oben).
    if (!leer && !Number.isNaN(geparst) && geklemmt !== gerundet) {
      toast?.(`Minuten auf ${geklemmt} gekappt (statt ${gerundet}).`, "warning");
    }
  }

  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={roh}
      aria-label={ariaLabel}
      onChange={(e) => {
        bearbeitetRef.current = true;
        setRoh(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      className={cn("h-11 [touch-action:manipulation]", className)}
    />
  );
}

export const PHASE_LABEL: Record<Phase, string> = {
  lernen: "Lernen",
  ueben: "Üben",
  probe: "Probe",
  simulation: "Simulation",
};

// S12: derselbe leere Titel (punktTitel === null, Phase ungleich simulation)
// hiess an verschiedenen Stellen unterschiedlich ("Thema fehlt" vs. "Ohne
// Thema") -- "Thema fehlt" liest sich zudem wie ein Fehler, den der Nutzer
// beheben soll, obwohl er nichts tun kann. Eine Quelle, analog zu PHASE_LABEL.
export const OHNE_THEMA_LABEL = "Ohne Thema";

// N2: die Fuellung gegen die Spur (bg-muted) unterschritt in Hell 3:1 (WCAG
// 1.4.11) bei gruen und gelb -- nachgerechnet (echte sRGB-Leuchtdichte, nicht
// die Graustufen-Naeherung): green-600 3,02:1, yellow-600 2,69:1, beide unter
// der Pflicht. red-600 lag mit 4,43:1 schon darueber und bleibt daher
// unveraendert. Fix: gruen und gelb je eine Stufe dunkler (700 statt 600) --
// green-700 4,60:1, yellow-700 4,51:1, beide jetzt klar ueber 3:1. Die drei
// Stufen bleiben ueber den Farbton (gruen/gelb/rot) unterscheidbar, nicht
// ueber die Leuchtdichte -- die liegt nach dem Fix ohnehin nah beieinander
// (0,159/0,163/0,167), war aber vorher schon nicht der Unterscheidungsweg.
// Dunkel unveraendert, war mit green-500 6,63:1/yellow-500 7,88:1/red-500
// 4,02:1 schon klar ueber 3:1.
export function balkenFarbe(v: number): string {
  if (v >= 80) return "bg-green-700 dark:bg-green-500";
  if (v >= 40) return "bg-yellow-700 dark:bg-yellow-500";
  return "bg-red-600 dark:bg-red-500";
}

export function balkenTextFarbe(v: number): string {
  if (v >= 80) return "text-green-700 dark:text-green-400";
  if (v >= 40) return "text-yellow-700 dark:text-yellow-400";
  return "text-red-700 dark:text-red-400";
}

export function PhaseChip({ phase }: { phase: Phase }) {
  const styles: Record<Phase, string> = {
    lernen: "border-blue-600/30 bg-blue-600/10 text-blue-700 dark:border-blue-500/30 dark:text-blue-400",
    ueben: "border-purple-600/30 bg-purple-600/10 text-purple-700 dark:border-purple-500/30 dark:text-purple-400",
    probe: "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:border-amber-500/30 dark:text-amber-400",
    simulation: "border-primary/30 bg-primary/10 text-primary",
  };
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", styles[phase])}>
      {PHASE_LABEL[phase]}
    </span>
  );
}

// Balken + Prozent-Text fuer die Sicherheit eines Punkts/Plans. `children`
// haengt sich rechts an, in derselben Zeile (z.B. "3 von 5" in
// pruefungen-view.tsx). `label` benennt, WOVON die Prozentzahl gilt -- ohne
// das liest ein Screenreader nur "50 Prozent" ohne Bezug.
//
// `quelle`: optional, damit bestehende Aufrufer ohne Quelle unveraendert
// uebersetzen. Ist sie "ohne_test", ist `wert` keine Messung, sondern der
// erfundene Platzhalter 50 (lib/lernplan-store.ts, gesetzt fuer jeden Punkt
// ohne Diagnose-Check). Der Balken zeigt dann weder Fuellstand noch
// Prozentzahl -- eine gefaerbte Fuellung waere eine falsche Praezisions-
// Behauptung -- sondern eine neutrale Spur und "Noch nicht eingeschätzt".
export function SicherheitsBalken({
  wert,
  quelle,
  label,
  className,
  children,
}: {
  wert: number;
  quelle?: SicherheitQuelle;
  label?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const ohneTest = quelle === "ohne_test";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={
          ohneTest
            ? label
              ? `Sicherheit ${label}: noch nicht eingeschätzt`
              : "Sicherheit: noch nicht eingeschätzt"
            : label
              ? `Sicherheit ${label}`
              : "Sicherheit"
        }
        aria-valuenow={ohneTest ? undefined : wert}
        aria-valuetext={ohneTest ? undefined : `${wert} Prozent`}
        aria-valuemin={ohneTest ? undefined : 0}
        aria-valuemax={ohneTest ? undefined : 100}
      >
        {!ohneTest && <div className={cn("h-full rounded-full", balkenFarbe(wert))} style={{ width: `${wert}%` }} />}
      </div>
      {ohneTest ? (
        <span className="shrink-0 text-[12.5px] font-medium text-muted-foreground">Noch nicht eingeschätzt</span>
      ) : (
        // NIT: aria-hidden -- der Balken traegt die Zahl schon als aria-valuetext
        // ("50 Prozent"), ohne das hoerte ein Screenreader sie zweimal (einmal
        // als Wert des progressbar, einmal als Text dieses <span>).
        <span aria-hidden className={cn("shrink-0 tabular-nums text-[12.5px] font-medium", balkenTextFarbe(wert))}>
          {wert}%
        </span>
      )}
      {children}
    </div>
  );
}

// --- Lernen-Einheit-Zeile (Tages- und Cockpit-Ansicht) ----------------------

// Genau eine Handlung pro Zeile (Review): "ueben" fuehrt direkt in die Karten
// dieses Punkts (Filter ueber `thema` plus `pruefung`, genau wie
// lernplan-seite.tsx -- ohne `thema` wuerde lib/lernen-session.tsx alle
// Karten aller Themen der Pruefung laden, und das Abhaken haette dann ueber
// die falschen Karten geurteilt). item.topicId ist null, wenn der Punkt ohne
// Thema ist ("Allgemein"), dafuer kennt lernen-session.tsx das Sonderwort
// "allgemein". "simulation" fuehrt direkt in den Tutor (genau wie
// lernplan-seite.tsx), weil sie keine topicId braucht (nur `pruefung`).
// "probe" fuehrt ebenfalls direkt in den Tutor, sofern item.topicId gesetzt
// ist -- ohne Thema kann der Tutor keine Probe zu diesem Punkt oeffnen, dann
// bleibt der Weg zum Plan, der dafuer die richtige Meldung zeigt (siehe
// lernplan-seite.tsx EinheitZeile, "Kann gerade nicht geoeffnet werden"). Nur
// "lernen" behaelt das einfache Abhaken, weil es dort keine weitere Handlung
// gibt (reine Lesearbeit, siehe lernplan-seite.tsx EinheitZeile).
export function LernenEinheitZeile({
  subjectId,
  assignmentId,
  item,
  onToggle,
}: {
  subjectId: string;
  assignmentId: string;
  item: ItemDTO;
  onToggle: (item: ItemDTO) => void;
}) {
  const erledigt = item.doneAt !== null;
  const titel = item.punktTitel ?? (item.phase === "simulation" ? "Simulation" : OHNE_THEMA_LABEL);
  const titelOverflow = useOverflowTitle<HTMLSpanElement>(titel);

  const rowClass =
    "flex min-h-11 items-center gap-2 rounded-lg px-1 py-1.5 transition-colors [touch-action:manipulation] hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  // S5: der Link ist die ganze Zeile (Klick navigiert), darum kein
  // eigenstaendiger Checkbox-Button wie auf der Planseite -- stattdessen ein
  // rein optischer Status-Punkt plus gedaempfter/durchgestrichener Titel.
  // S3-Fix: KEIN Quadrat mit Rahmen mehr -- das sieht ident aus wie die
  // echte Checkbox unten (role="checkbox", "lernen"-Zeile) und wie die auf
  // der Planseite (lernplan-seite.tsx EinheitZeile), obwohl hier ein Tap gar
  // nichts abhakt, sondern in eine Kartensitzung/den Tutor fuehrt. Rund statt
  // eckig macht den Unterschied auf den ersten Blick klar: nur ein Quadrat
  // mit Rahmen ist ein Bedienelement zum Abhaken.
  // N1-Fix: border-border-control statt border-border (letzteres ist
  // schwaecher). Formal ist das egal, aria-hidden greift die 3:1-Pflicht
  // nicht -- aber in derselben Spalte muessen ein "ueben"- und ein
  // "lernen"-Zeile gleich kraeftig wirken, sonst liest der
  // Kontrastunterschied als Bedeutung, die es nicht gibt.
  const erledigtBadge = (
    <span
      aria-hidden
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border",
        erledigt ? "border-primary bg-primary text-primary-foreground" : "border-border-control",
      )}
    >
      {erledigt && (
        <span aria-hidden className="text-[11px] leading-none">
          ✓
        </span>
      )}
    </span>
  );

  if (item.phase === "ueben") {
    const thema = item.topicId ?? "allgemein";
    return (
      <li>
        <Link
          href={`/lernen/${subjectId}/session?modus=lernen&thema=${thema}&pruefung=${assignmentId}&einheit=${item.id}`}
          aria-label={erledigt ? `${titel}, erledigt, Karten üben` : `${titel}, Karten üben`}
          className={rowClass}
        >
          {erledigtBadge}
          <PhaseChip phase={item.phase} />
          <span
            ref={titelOverflow.ref}
            title={titelOverflow.title}
            className={cn("min-w-0 flex-1 truncate text-[13px]", erledigt && "text-muted-foreground line-through")}
          >
            {titel}
          </span>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </li>
    );
  }

  if (item.phase === "simulation" || item.phase === "probe") {
    const href =
      item.phase === "simulation"
        ? `/lernen/${subjectId}/tutor?pruefung=${assignmentId}&modus=probe&einheit=${item.id}`
        : item.topicId
          ? `/lernen/${subjectId}/tutor?thema=${item.topicId}&modus=probe&einheit=${item.id}`
          : `/lernen/${subjectId}/plan/${assignmentId}`;
    const ziel = item.phase === "simulation" || item.topicId ? "im Tutor" : "im Plan";
    const label = erledigt ? `${titel}, erledigt, ${ziel}` : `${titel}, ${ziel}`;
    return (
      <li>
        <Link href={href} aria-label={label} className={rowClass}>
          {erledigtBadge}
          <PhaseChip phase={item.phase} />
          <span
            ref={titelOverflow.ref}
            title={titelOverflow.title}
            className={cn("min-w-0 flex-1 truncate text-[13px]", erledigt && "text-muted-foreground line-through")}
          >
            {titel}
          </span>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </li>
    );
  }

  return (
    <li className="flex min-h-11 items-center gap-2 px-1 py-1.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={erledigt}
        aria-label={erledigt ? `${titel} als offen markieren` : `${titel} als erledigt markieren`}
        onClick={() => onToggle(item)}
        className={cn(
          "relative grid size-5 shrink-0 place-items-center rounded border transition-colors before:absolute before:-inset-3 before:content-[''] [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          // BLOCKIEREND: --border liegt auf --card bei nur 1,27:1 -- WCAG
          // 1.4.11 verlangt 3:1 fuer die Begrenzung eines Bedienelements, und
          // dieser Rahmen ist der einzige Traeger von "diese Einheit ist noch
          // offen". Nutzt border-control statt border (app/globals.css).
          erledigt ? "border-primary bg-primary text-primary-foreground" : "border-border-control",
        )}
      >
        {erledigt && (
          <span aria-hidden className="text-[11px] leading-none">
            ✓
          </span>
        )}
      </button>
      <PhaseChip phase={item.phase} />
      <span
        ref={titelOverflow.ref}
        title={titelOverflow.title}
        className={cn("min-w-0 flex-1 truncate text-[13px]", erledigt && "text-muted-foreground line-through")}
      >
        {titel}
      </span>
    </li>
  );
}
