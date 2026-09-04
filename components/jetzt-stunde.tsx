"use client";

// Der Vollbild-Stundenmodus des Fokus: solange wirklich eine Schulstunde
// laeuft, fuellt genau diese Stunde die Ansicht. Alles, was mitten im
// Unterricht anfaellt -- Hausaufgabe, Meldung, Notiz, Datei -- steht hier in
// einem Zug untereinander, statt sich hinter je einem Dialog zu verstecken.
//
// Die Editoren sind bewusst nicht neu geschrieben: Meldung und Notiz sind
// dieselben Bausteine wie in den Overlays (ParticipationCounter,
// LessonNoteField), die Hausaufgabe ist der Schnelleintrag von /aufgaben mit
// vorbelegtem Fach, und die Dateien sind der Datei-Bereich des Fachs.

import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, User } from "lucide-react";
import { AssignmentQuickAdd } from "@/components/assignment-quick-add";
import { LessonNoteField } from "@/components/lesson-note";
import { ParticipationCounter } from "@/components/lesson-participation";
import { SubjectFiles } from "@/components/subject-files";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import { minutesLeft } from "@/lib/jetzt-stunde";
import type { AssignmentDTO } from "@/lib/assignments-view";
import type { LiveLessonDTO } from "@/app/api/morgen/route";

// Wie oft die Restzeit nachgerechnet wird. 30s reicht: die Anzeige ist
// minutengenau, ein halbminuetiger Versatz faellt niemandem auf -- und der
// Uebergang ans Stundenende darf ruhig eine halbe Minute spaeter greifen,
// statt dafuer sekuendlich zu rechnen.
const TICK_MS = 30_000;

function jetztHM(): string {
  return new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function JetztStunde({
  live,
  onExpired,
  onShowDay,
}: {
  live: LiveLessonDTO;
  // Die Stunde ist vorbei -- der Fokus laedt neu und zeigt danach entweder die
  // naechste laufende Stunde oder wieder den Tag.
  onExpired: () => void;
  // "Zurueck zum Tag": reine Ansichtssache, keine neue Route.
  onShowDay: () => void;
}) {
  const tint = live.subjectId ? colorValue(live.subjectColor) : NEUTRAL_COLOR;

  // Die Restzeit kommt vom Server, laeuft danach aber im Browser weiter --
  // sonst stuende bis zum naechsten Laden dieselbe Zahl da.
  const [rest, setRest] = useState(live.minutesLeft);
  useEffect(() => {
    setRest(minutesLeft(live.endTime, jetztHM()));
    const id = setInterval(() => {
      const next = minutesLeft(live.endTime, jetztHM());
      setRest(next);
      if (next <= 0) onExpired();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [live.endTime, live.refId, onExpired]);

  // Was in dieser Stunde schon eingetragen wurde. Ohne diese Rueckmeldung
  // verschwindet eine gerade getippte Hausaufgabe spurlos aus dem Feld und man
  // weiss nicht, ob sie angekommen ist.
  const [neu, setNeu] = useState<AssignmentDTO[]>([]);


  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={onShowDay}
          className="relative -ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-[13px] text-muted-foreground transition-colors [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Tag
        </button>

        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wide" style={{ color: tint }}>
          {/* Der Puls sagt "das laeuft gerade wirklich". motion-safe: haelt
              ihn aus prefers-reduced-motion raus, der Punkt bleibt dann
              ruhig stehen -- die Aussage traegt der Text daneben ohnehin. */}
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full motion-safe:animate-pulse"
            style={{ backgroundColor: tint }}
          />
          {/* Nur das Zustandswort steht in Versalien -- die Restzeit daneben
              liest sich normal gesetzt schneller. */}
          {/* Bewusst KEINE aria-live-Region: der Wert aendert sich alle 30
              Sekunden, eine hoefliche Live-Region wuerde die Restzeit
              mitten im Unterricht immer wieder vorlesen. Wer sie wissen
              will, liest oder tastet die Zeile selbst an. */}
          <span>
            <span className="uppercase">Läuft</span> · noch {rest} min
          </span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{live.title}</h1>
        {/* Nur, was wirklich da ist -- mit "·" verbunden wie in der
            Stundenliste. */}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
          <span className="tabular-nums">
            {live.startTime}–{live.endTime}
          </span>
          {live.room && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" strokeWidth={2.25} aria-hidden />
                {live.room}
              </span>
            </>
          )}
          {live.teacher && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <User className="size-3" strokeWidth={2.25} aria-hidden />
                {live.teacher}
              </span>
            </>
          )}
        </p>
      </div>

      <Abschnitt titel="Hausaufgabe">
        <AssignmentQuickAdd
          defaultSubjectId={live.subjectId}
          placeholder="Was ist auf?"
          onCreated={(a) => setNeu((prev) => [a, ...prev])}
        />
        {neu.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1 px-2.5">
            {neu.map((a) => (
              <li key={a.id} className="truncate text-[12.5px] text-muted-foreground">
                Eingetragen: {a.title}
              </li>
            ))}
          </ul>
        )}
      </Abschnitt>

      <Abschnitt titel="Meldung">
        <div className="rounded-xl border bg-card px-4 pb-2 shadow-card">
          <ParticipationCounter schoolBlockId={live.refId} onSaved={() => {}} />
        </div>
      </Abschnitt>

      <Abschnitt titel="Notiz">
        <div className="rounded-xl border bg-card px-4 pt-1 pb-2 shadow-card">
          <LessonNoteField schoolBlockId={live.refId} onSaved={() => {}} placeholder="Was kam dran?" />
        </div>
      </Abschnitt>

      {/* Ohne aufgeloestes Fach gibt es keinen Ort, an dem eine Datei landen
          koennte -- dann faellt der Abschnitt ganz weg statt einen Upload
          anzubieten, der nirgendwo hin fuehrt. */}
      {live.subjectId && (
        <Abschnitt titel="Dateien">
          <SubjectFiles subjectId={live.subjectId} />
        </Abschnitt>
      )}
    </div>
  );
}

// Gleiche Abschnittsueberschrift wie in components/morgen-panel.tsx -- der
// Vollbildmodus ist eine andere Ansicht derselben Seite, kein anderer Ort.
function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titel}
      </h2>
      {children}
    </section>
  );
}
