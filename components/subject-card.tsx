"use client";

import Link from "next/link";
import { colorValue } from "@/lib/subject-colors";
import { formatPoints, type GradeAverage } from "@/lib/grades";
import { cn } from "@/lib/utils";

// Der DTO liegt hier statt in lib/, weil das Faecher-Modul der einzige
// Verbraucher ist -- Karte, Uebersicht und Detailseite ziehen ihn von hier.
export type SubjectDTO = {
  id: string;
  name: string;
  untisSubject: string | null;
  teacher: string | null; // Nachname, so wie Untis ihn liefert
  teacherTitle: "herr" | "frau";
  teacherLabel: string | null; // "Herr Schulze", vom Server zusammengesetzt
  room: string | null;
  color: string | null; // Token aus SUBJECT_COLORS, nie ein Hex-Wert
  onenoteSectionId: string | null;
  onenoteSectionName: string | null; // "Notizbuch / Abschnitt", nur zur Anzeige
  oralWeight: number; // Anteil muendlich am Fachschnitt, in Prozent
  archivedAt: string | null; // ISO
  openAssignments: number;
  noteCount: number;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function SubjectCard({
  subject,
  average,
}: {
  subject: SubjectDTO;
  // Wird von der Uebersicht nachgereicht (eine Runde fuer alle Faecher),
  // deshalb optional: die Karte rendert auch ohne Noten vollstaendig.
  average?: GradeAverage | null;
}) {
  const archived = Boolean(subject.archivedAt);
  return (
    <Link
      href={`/faecher/${subject.id}`}
      className={cn(
        // Die GANZE Karte ist der Link -- kein verschachtelter Titel-Link, der
        // nur ein paar Pixel breit waere. min-h haelt die Trefferflaeche auch
        // bei kurzem Namen weit ueber 44px.
        "group flex min-h-[104px] flex-col justify-between rounded-xl border bg-card p-4 text-left shadow-card",
        "transition-[background-color,border-color,scale] duration-150 ease-[var(--ease-atlas)] [touch-action:manipulation]",
        "hover:bg-accent/40 active:scale-[0.985]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        archived && "opacity-70",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-1 size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: colorValue(subject.color) }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight tracking-tight">
            {subject.name}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {subject.teacherLabel || "Kein Lehrer hinterlegt"}
          </div>
        </div>
        {/* Der Schnitt rechts oben: die eine Zahl, die eine Fachkarte im
            Vorbeigehen beantworten soll. */}
        {average && (
          <div className="shrink-0 text-right tabular-nums">
            <div className="text-[15px] font-semibold leading-tight">
              {formatPoints(average.points)}
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">{average.label}</div>
          </div>
        )}
      </div>

      {/* tabular-nums: die Zahlen zittern nicht in der Breite, wenn sich die
          Anzahl offener Aufgaben aendert. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums text-muted-foreground">
        <span className={cn(subject.openAssignments > 0 && "font-medium text-foreground")}>
          {plural(subject.openAssignments, "offene Aufgabe", "offene Aufgaben")}
        </span>
        <span aria-hidden="true" className="opacity-50">
          ·
        </span>
        <span>{plural(subject.noteCount, "Notiz", "Notizen")}</span>
        {archived && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide">
            Archiviert
          </span>
        )}
      </div>
    </Link>
  );
}
