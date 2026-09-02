"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { Button } from "@/components/ui/button";
import { SubjectCard, type SubjectDTO } from "@/components/subject-card";
import { EmptyPanel, NewSubjectDialog, SubjectSetup } from "@/components/subject-setup";
import { formatPoints, type GradeAverage } from "@/lib/grades";
import type { GradeOverviewDTO } from "@/lib/grade-store";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectDTO[] | null>(null);
  // "Entschieden" haengt allein daran, ob subjects Zeilen hat (aktive ODER
  // archivierte) -- nicht an einem Client-Flag. Deshalb laedt die Seite immer
  // mit ?all=1 vor und filtert erst danach. Ein Reload nach dem Bestaetigen
  // zeigt so nie wieder die Auswahl.
  const [hasAny, setHasAny] = useState<boolean | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const toast = useToast();
  // Die Noten-Uebersicht liegt bewusst auf DIESER Seite statt auf einer eigenen:
  // "Fach" und "Schnitt des Fachs" sind dieselbe Liste, und ein Schueler, der
  // am Handy nach seinem Schnitt sieht, soll dafuer nicht erst navigieren.
  const [gradeOverview, setGradeOverview] = useState<GradeOverviewDTO | null>(null);

  const load = useCallback(
    async (archived: boolean) => {
      setFailed(false);
      try {
        const [listRes, allRes, gradesRes] = await Promise.all([
          fetch(archived ? "/api/subjects?archived=1" : "/api/subjects"),
          fetch("/api/subjects?all=1"),
          fetch("/api/grades"),
        ]);
        if (!listRes.ok || !allRes.ok) throw new Error("Laden fehlgeschlagen");
        const list = (await listRes.json()) as { subjects: SubjectDTO[] };
        const all = (await allRes.json()) as { subjects: SubjectDTO[] };
        setHasAny(all.subjects.length > 0);
        setSubjects(list.subjects);
        // Die Noten duerfen die Faecherliste nicht mitreissen: faellt nur diese
        // Runde aus, fehlen die Schnitte, die Seite steht trotzdem.
        setGradeOverview(gradesRes.ok ? ((await gradesRes.json()) as GradeOverviewDTO) : null);
      } catch {
        setFailed(true);
        setSubjects(null);
      }
    },
    [],
  );

  useEffect(() => {
    void load(showArchived);
  }, [load, showArchived]);

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
      await load(showArchived);
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
          <Button variant="outline" onClick={() => void load(showArchived)}>
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
            void load(false);
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
      </div>
    );
  };

  return (
    // Gleicher scrollbarer Container wie /settings: die Layout-Hoehe ist fix,
    // gescrollt wird innerhalb der Seite.
    <main className="h-full overflow-y-auto px-6 pt-6 pb-8 lg:px-8">
      <Stagger className="mx-auto max-w-4xl space-y-6">
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
          void load(false);
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
