"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { Button } from "@/components/ui/button";
import { SubjectCard, type SubjectDTO } from "@/components/subject-card";
import { EmptyPanel, NewSubjectDialog, SubjectSetup } from "@/components/subject-setup";
import { cn } from "@/lib/utils";

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

  const load = useCallback(
    async (archived: boolean) => {
      setFailed(false);
      try {
        const [listRes, allRes] = await Promise.all([
          fetch(archived ? "/api/subjects?archived=1" : "/api/subjects"),
          fetch("/api/subjects?all=1"),
        ]);
        if (!listRes.ok || !allRes.ok) throw new Error("Laden fehlgeschlagen");
        const list = (await listRes.json()) as { subjects: SubjectDTO[] };
        const all = (await allRes.json()) as { subjects: SubjectDTO[] };
        setHasAny(all.subjects.length > 0);
        setSubjects(list.subjects);
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
      return (
        <div className="flex items-center gap-2 rounded-2xl border bg-card px-5 py-8 text-sm text-muted-foreground shadow-card">
          <Loader2 className="size-4 animate-spin" />
          Fächer werden geladen…
        </div>
      );
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

    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {subjects.map((s) => (
          <SubjectCard key={s.id} subject={s} />
        ))}
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
                Stammdaten, Notizen und Aufgaben pro Fach.
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
