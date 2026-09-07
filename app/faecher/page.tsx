"use client";

import { RefreshNotice } from "@/components/refresh-notice";
import { useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { Button } from "@/components/ui/button";
import { SubjectCard, type SubjectDTO } from "@/components/subject-card";
import { EmptyPanel, NewSubjectDialog, SubjectSetup } from "@/components/subject-setup";
import { formatPoints, type GradeAverage } from "@/lib/grades";
import { colorValue } from "@/lib/subject-colors";
import type { GradeOverviewDTO } from "@/lib/grade-store";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { CACHE_TTLS, invalidateSubjectsCaches } from "@/lib/fetch-cache";
import { useCachedJSON } from "@/lib/use-cached-json";

export default function SubjectsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const toast = useToast();

  // Drei Runden parallel; beim Wiederbetreten steht der gespeicherte Stand
  // sofort, die frische Runde laeuft nach.
  const listUrl = showArchived ? "/api/subjects?archived=1" : "/api/subjects";
  const { data: listData, error: listError } = useCachedJSON<{ subjects: SubjectDTO[] }>(
    listUrl,
    CACHE_TTLS.subjects,
    { refreshKey: reloadKey },
  );
  // "Entschieden" haengt allein daran, ob subjects Zeilen hat (aktive ODER
  // archivierte) -- nicht an einem Client-Flag. Deshalb laedt die Seite immer
  // mit ?all=1 vor und filtert erst danach. Ein Reload nach dem Bestaetigen
  // zeigt so nie wieder die Auswahl.
  const { data: allData, error: allError } = useCachedJSON<{ subjects: SubjectDTO[] }>(
    "/api/subjects?all=1",
    CACHE_TTLS.subjects,
    { refreshKey: reloadKey },
  );
  // Die Noten-Uebersicht liegt bewusst auf DIESER Seite statt auf einer eigenen:
  // "Fach" und "Schnitt des Fachs" sind dieselbe Liste, und ein Schueler, der
  // am Handy nach seinem Schnitt sieht, soll dafuer nicht erst navigieren.
  // Die Noten duerfen die Faecherliste nicht mitreissen: faellt nur diese
  // Runde aus, fehlen die Schnitte, die Seite steht trotzdem.
  const { data: gradeOverview, error: gradesError } = useCachedJSON<GradeOverviewDTO>("/api/grades", CACHE_TTLS.grades, {
    refreshKey: reloadKey,
  });

  const subjects = listData?.subjects ?? null;
  const hasAny = allData ? allData.subjects.length > 0 : null;
  const failed = (listError && subjects === null) || (allError && allData === null);
  const refresh = () => setReloadKey((k) => k + 1);

  // Derselbe Abgleich laeuft nach jedem Untis-Sync automatisch mit. Der Knopf
  // ist fuer den Moment, in dem man ihn JETZT will -- neuer Kurs im Halbjahr,
  // Lehrerwechsel -- ohne auf das naechste Sync-Fenster zu warten.
  async function reconcile() {
    if (reconciling) return;
    setReconciling(true);
    try {
      const res = await fetch("/api/subjects/reconcile", { method: "POST" });
      if (!res.ok) throw new Error("Abgleich fehlgeschlagen");
      const json = (await res.json()) as {
        created: number;
        updated: number;
        archived: number;
        deleted: number;
        skipped: boolean;
      };
      invalidateSubjectsCaches();
      refresh();
      toast(reconcileMeldung(json));
    } catch {
      toast("Der Abgleich hat nicht geklappt. Versuch es später erneut.");
    } finally {
      setReconciling(false);
    }
  }

  const body = () => {
    if (failed) {
      return (
        <EmptyPanel
          title="Die Fächer konnten nicht geladen werden"
          text="Prüf deine Verbindung und versuch es noch einmal."
        >
          <Button variant="outline" onClick={() => refresh()}>
            Erneut versuchen
          </Button>
        </EmptyPanel>
      );
    }

    if (hasAny === null || subjects === null) {
      return <SubjectsSkeleton />;
    }

    // Erstes Oeffnen: noch kein einziges Fach, weder aktiv noch archiviert.
    if (!hasAny) {
      return (
        <SubjectSetup
          onDone={() => {
            setShowArchived(false);
            refresh();
          }}
        />
      );
    }

    if (subjects.length === 0) {
      return showArchived ? (
        <EmptyPanel title="Kein archiviertes Fach" text="Hier landen Fächer, die du abwählst." />
      ) : (
        <EmptyPanel
          title="Keine aktiven Fächer"
          text="Alle Fächer sind archiviert. Du kannst eines reaktivieren oder ein neues anlegen."
        >
          <Button variant="outline" onClick={() => setShowArchived(true)}>
            Archivierte zeigen
          </Button>
        </EmptyPanel>
      );
    }

    const averages = new Map<string, GradeAverage | null>(
      (gradeOverview?.subjects ?? []).map((e) => [e.id, e.summary.average]),
    );

    return (
      <div className="space-y-4">
        {gradeOverview && <OverallAverage overall={gradeOverview.overall} />}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((s) => (
            <SubjectCard key={s.id} subject={s} average={averages.get(s.id) ?? null} />
          ))}
        </div>
        {gradeOverview && gradeOverview.recentGrades.length > 0 && (
          <RecentGrades grades={gradeOverview.recentGrades} />
        )}
      </div>
    );
  };

  return (
    // Gleicher scrollbarer Container wie /settings: die Layout-Hoehe ist fix,
    // gescrollt wird innerhalb der Seite.
    <main className="h-full overflow-y-auto px-6 pt-6 pb-8 lg:px-8">
      <Stagger className="mx-auto max-w-4xl space-y-6">
        {((listError && listData) || (allError && allData) || gradesError) && <RefreshNotice onRetry={refresh} />}
        <StaggerItem>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold leading-tight tracking-tight">Fächer</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Noten, Stammdaten, Notizen und Aufgaben pro Fach.
              </p>
            </div>
            {hasAny && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-pressed={showArchived}
                  onClick={() => setShowArchived((v) => !v)}
                  className={cn(showArchived && "bg-accent text-accent-foreground")}
                >
                  Archivierte zeigen
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={reconciling}
                  onClick={() => void reconcile()}
                >
                  {reconciling ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Abgleichen
                </Button>
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  Fach anlegen
                </Button>
              </div>
            )}
          </div>
        </StaggerItem>

        <StaggerItem>{body()}</StaggerItem>
      </Stagger>

      <NewSubjectDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => {
          setShowArchived(false);
          invalidateSubjectsCaches();
          refresh();
        }}
      />
    </main>
  );
}

function SubjectsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="Fächer werden geladen" aria-busy="true">
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="size-8 rounded-full" />
            </div>
            <Skeleton className="h-3 w-24" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Was der Abgleich getan hat, in einem Satz. "Nichts geaendert" ist dabei ein
// vollwertiges Ergebnis und keine Panne: nach dem ersten Lauf ist genau das der
// Normalfall, und ohne Rueckmeldung wirkt der Knopf kaputt.
function reconcileMeldung(r: {
  created: number;
  updated: number;
  archived: number;
  deleted: number;
  skipped: boolean;
}): string {
  if (r.skipped) return "Es gibt noch keinen Stundenplan zum Abgleichen.";

  const teile: string[] = [];
  if (r.created > 0) teile.push(plural(r.created, "Fach ergänzt", "Fächer ergänzt"));
  if (r.updated > 0) teile.push(plural(r.updated, "Fach aktualisiert", "Fächer aktualisiert"));
  if (r.archived > 0) teile.push(plural(r.archived, "Fach archiviert", "Fächer archiviert"));
  if (r.deleted > 0) teile.push(plural(r.deleted, "Fach entfernt", "Fächer entfernt"));

  return teile.length === 0 ? "Alles war schon aktuell." : teile.join(", ") + ".";
}

function plural(n: number, eins: string, viele: string): string {
  return `${n} ${n === 1 ? eins : viele}`;
}

// Zuletzt eingetragene Noten ueber alle Faecher -- frueher die untere Haelfte
// der eigenen Noten-Seite, jetzt Abschnitt hier: lesen ja, bearbeiten im Fach.
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

// Der Gesamtschnitt ueber alle aktiven Faecher, jedes Fach zaehlt einmal.
function OverallAverage({ overall }: { overall: GradeAverage | null }) {
  if (!overall) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border bg-card px-4 py-3 shadow-card">
      <span className="text-[13px] text-muted-foreground">Gesamtschnitt</span>
      <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums">
        {formatPoints(overall.points)}
      </span>
      <span className="text-[13px] text-muted-foreground">Punkte</span>
      <span aria-hidden="true" className="text-[13px] text-muted-foreground opacity-50">
        ·
      </span>
      <span className="text-[15px] font-medium">Note {overall.label}</span>
    </div>
  );
}
