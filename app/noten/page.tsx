"use client";

// Notenuebersicht: die Frage "wie stehe ich insgesamt" in fuenf Sekunden
// beantworten, ohne jedes Fach einzeln aufzumachen. Bearbeitet wird hier
// nichts -- das bleibt der Fach-Detailseite vorbehalten (components/subject-grades.tsx),
// diese Seite liest nur.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { colorValue } from "@/lib/subject-colors";
import {
  KIND_LABEL,
  formatPoints,
  sortSubjectsByAverage,
  type GradeAverage,
} from "@/lib/grades";
import type { GradeOverviewDTO, GradeOverviewEntryDTO } from "@/lib/grade-store";

// Unter dieser Anzahl Noten insgesamt ist ein Gesamtschnitt mehr Behauptung
// als Aussage -- die Seite zeigt dann lieber, was schon da ist, statt eine
// Zahl vorzutaeuschen, die noch nichts traegt.
const MIN_GRADES_FOR_OVERALL = 3;

export default function NotenPage() {
  const [data, setData] = useState<GradeOverviewDTO | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/grades");
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      setData((await res.json()) as GradeOverviewDTO);
    } catch {
      setFailed(true);
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="h-full overflow-y-auto px-6 pt-6 pb-8 lg:px-8">
      <Stagger className="mx-auto max-w-4xl space-y-6">
        <StaggerItem>
          <div>
            <h1 className="text-xl font-semibold leading-tight tracking-tight">Noten</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Dein Schnitt auf einen Blick, Fach für Fach.
            </p>
          </div>
        </StaggerItem>

        <StaggerItem>
          {failed ? (
            <div className="rounded-xl border bg-card px-4 py-6 text-center shadow-card">
              <p className="text-[14px] text-muted-foreground">
                Die Noten konnten nicht geladen werden.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
                Erneut versuchen
              </Button>
            </div>
          ) : data === null ? (
            <NotenSkeleton />
          ) : (
            <NotenBody data={data} />
          )}
        </StaggerItem>
      </Stagger>
    </main>
  );
}

function totalGradeCount(entries: GradeOverviewEntryDTO[]): number {
  return entries.reduce((sum, e) => sum + e.summary.count, 0);
}

function NotenBody({ data }: { data: GradeOverviewDTO }) {
  const totalCount = totalGradeCount(data.subjects);

  if (totalCount === 0) {
    return (
      <div className="rounded-xl border bg-card px-4 py-8 text-center shadow-card">
        <p className="text-[15px] font-medium">Noch keine Note eingetragen</p>
        <p className="mx-auto mt-1.5 max-w-xs text-[13px] text-muted-foreground">
          Trag deine erste Note in einem Fach ein, dann steht hier dein Schnitt.
        </p>
        <Link href="/faecher" className={buttonVariants({ size: "sm", className: "mt-4" })}>
          Zu den Fächern
        </Link>
      </div>
    );
  }

  const { withGrades, withoutGrades } = sortSubjectsByAverage(
    data.subjects.map((s) => ({ ...s, average: s.summary.average })),
  );

  return (
    <div className="space-y-6">
      <OverallBlock overall={data.overall} totalCount={totalCount} subjectCount={withGrades.length} />

      <div className="space-y-2">
        {withGrades.map((entry) => (
          <SubjectRow key={entry.id} entry={entry} />
        ))}
      </div>

      {withoutGrades.length > 0 && (
        <p className="text-[13px] text-muted-foreground">
          {withoutGrades.length === 1
            ? `In ${withoutGrades[0].name} steht noch keine Note.`
            : `In ${withoutGrades.length} Fächern steht noch keine Note.`}
        </p>
      )}

      {data.recentGrades.length > 0 && <RecentGrades grades={data.recentGrades} />}
    </div>
  );
}

// Der Gesamtschnitt oben: gross und ruhig, mit der Grundlage direkt darunter,
// damit die Zahl nicht schwebt.
function OverallBlock({
  overall,
  totalCount,
  subjectCount,
}: {
  overall: GradeAverage | null;
  totalCount: number;
  subjectCount: number;
}) {
  const basis = `aus ${plural(totalCount, "Note", "Noten")} in ${plural(subjectCount, "Fach", "Fächern")}`;

  if (!overall || totalCount < MIN_GRADES_FOR_OVERALL) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3.5 shadow-card">
        <p className="text-[14px] font-medium">Noch zu wenig Noten für einen Gesamtschnitt</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Bisher {basis}. Trag ein paar Noten mehr ein, dann steht hier eine verlässliche Zahl.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card px-4 py-3.5 shadow-card">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[13px] text-muted-foreground">Gesamtschnitt</span>
        <span className="text-3xl font-semibold leading-none tracking-tight tabular-nums">
          {formatPoints(overall.points)}
        </span>
        <span className="text-[13px] text-muted-foreground">Punkte</span>
        <span aria-hidden="true" className="text-[13px] text-muted-foreground opacity-50">
          ·
        </span>
        <span className="text-[16px] font-medium">Note {overall.label}</span>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">Berechnet {basis}.</p>
    </div>
  );
}

// Eine Fachzeile: Farbe, Name, Schnitt gesamt, muendlich/schriftlich getrennt.
// Die ganze Zeile ist der Link ins Fach -- Bearbeiten passiert dort, nicht hier.
function SubjectRow({ entry }: { entry: GradeOverviewEntryDTO }) {
  const { summary } = entry;
  return (
    <Link
      href={`/faecher/${entry.id}`}
      className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-card transition-[background-color,border-color,scale] duration-150 ease-[var(--ease-atlas)] [touch-action:manipulation] hover:bg-accent/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: colorValue(entry.color) }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium leading-tight">{entry.name}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] tabular-nums text-muted-foreground">
          <span>
            {KIND_LABEL.oral}: {summary.oral ? formatPoints(summary.oral.points) : "–"}
          </span>
          <span>
            {KIND_LABEL.written}: {summary.written ? formatPoints(summary.written.points) : "–"}
          </span>
        </div>
      </div>
      {summary.average && (
        <div className="shrink-0 text-right tabular-nums">
          <div className="text-[16px] font-semibold leading-tight">
            {formatPoints(summary.average.points)}
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">Note {summary.average.label}</div>
        </div>
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function RecentGrades({ grades }: { grades: GradeOverviewDTO["recentGrades"] }) {
  return (
    <div>
      <h2 className="mb-2 text-[13px] font-medium text-muted-foreground">Zuletzt eingetragen</h2>
      <ul className="divide-y rounded-xl border bg-card shadow-card">
        {grades.map((g) => (
          <li key={g.id} className="flex items-center gap-3 px-4 py-2.5">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: colorValue(g.subjectColor) }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium leading-tight">{g.label}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                <span className="truncate">{g.subjectName}</span>
                <span aria-hidden="true" className="opacity-50">
                  ·
                </span>
                <span className="tabular-nums">{formatDate(g.date)}</span>
              </div>
            </div>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[12px] font-semibold tabular-nums">
              {g.grade}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function NotenSkeleton() {
  return (
    <div className="space-y-6" aria-label="Noten werden geladen" aria-busy="true">
      <Skeleton className="h-[89px] w-full rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}
