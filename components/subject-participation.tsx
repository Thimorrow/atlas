"use client";

// Der Meldungs-Abschnitt der Fach-Detailseite: Schnitt pro Stunde, Bestwert,
// juengste erfasste Stunden. Reiner Anzeige-Baustein -- die Daten kommen
// bereits fertig gerechnet aus GET /api/subjects/[id] (lib/participation-store.ts
// rechnet den Schnitt ueber ALLE erfassten Stunden, nicht nur die angezeigten),
// deshalb gibt es hier keinen eigenen Fetch.

import { formatAverage } from "@/lib/participation";

export type SubjectParticipationEntryDTO = {
  schoolBlockId: string;
  date: string;
  startTime: string; // HH:MM
  count: number;
};

export type SubjectParticipationDTO = {
  summary: {
    lessons: number;
    total: number;
    average: number | null;
    best: number | null;
  };
  recent: SubjectParticipationEntryDTO[];
};

// "02.09.2026" -- date kommt als YYYY-MM-DD, gleiches Format wie fmtLessonDate
// in subject-detail.tsx.
function fmtDate(dateISO: string) {
  const [y, m, d] = dateISO.split("-");
  return `${d}.${m}.${y}`;
}

export function SubjectParticipation({ data }: { data: SubjectParticipationDTO }) {
  const { summary, recent } = data;

  return (
    <div className="space-y-4">
      {/* Grosse Kennzahl wie AverageBlock in subject-grades.tsx -- der Schnitt
          ist die Zahl, wegen der dieser Abschnitt geoeffnet wird. text-2xl
          bleibt bewusst identisch zu AverageBlock (Noten-Abschnitt direkt
          darueber, gleiche Kartenform) -- zwei benachbarte KPI-Karten mit
          unterschiedlich grosser Zahl wuerden die Hierarchie verwaschen. Die
          drei Nebenwerte (Stunden, Summe, Bestwert) stehen als kompakte
          Statzeile darunter statt als drei fast gleich aussehende
          Fliesstextzeilen -- jede Zahl foreground+medium, das Label bleibt
          muted, dadurch bleibt der Schnitt oben klar die dominante Zahl. */}
      <div className="rounded-xl border bg-muted/30 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums">
            {formatAverage(summary.average)}
          </span>
          <span className="text-[13px] text-muted-foreground">Meldungen je Stunde</span>
        </div>
        <dl className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t pt-2.5 text-[12px] text-muted-foreground">
          <div className="flex items-baseline gap-1">
            <dt className="sr-only">Erfasste Stunden</dt>
            <dd className="font-medium tabular-nums text-foreground">{summary.lessons}</dd>
            <span>{summary.lessons === 1 ? "Stunde" : "Stunden"}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <dt className="sr-only">Meldungen gesamt</dt>
            <dd className="font-medium tabular-nums text-foreground">{summary.total}</dd>
            <span>gesamt</span>
          </div>
          {summary.best !== null && (
            <div className="flex items-baseline gap-1">
              <dt className="sr-only">Bestwert einer Stunde</dt>
              <dd className="font-medium tabular-nums text-foreground">{summary.best}</dd>
              <span>Bestwert</span>
            </div>
          )}
        </dl>
      </div>

      {recent.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Noch keine Stunde erfasst.</p>
      ) : (
        <ul className="divide-y">
          {recent.map((r) => (
            <li key={r.schoolBlockId} className="flex items-center gap-3 py-2.5 text-[13px]">
              <span className="flex-1 tabular-nums text-muted-foreground">
                {fmtDate(r.date)} · {r.startTime}
              </span>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[12px] font-semibold tabular-nums">
                {r.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
