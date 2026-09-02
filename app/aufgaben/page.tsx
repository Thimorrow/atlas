"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { Button } from "@/components/ui/button";
import { AssignmentList } from "@/components/assignment-list";
import { AssignmentComposer } from "@/components/assignment-composer";
import { useToast } from "@/components/toast";
import { type AssignmentDTO } from "@/lib/assignments-view";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type SubjectOption = { id: string; name: string; color: string | null };

export default function AssignmentsPage() {
  const toast = useToast();
  const [assignments, setAssignments] = useState<AssignmentDTO[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // Die Erledigten kommen nicht mit der Standardantwort, sondern erst mit
  // ?completed=1 -- der Umschalter laedt deshalb neu, statt lokal zu filtern.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/assignments${showCompleted ? "?completed=1" : ""}`).then((r) => r.json()),
      fetch("/api/subjects").then((r) => r.json()),
    ])
      .then(([a, s]) => {
        if (!alive) return;
        setAssignments((a.assignments ?? []) as AssignmentDTO[]);
        setSubjects((s.subjects ?? []) as SubjectOption[]);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        toast("Die Aufgaben konnten nicht geladen werden.");
      });
    return () => {
      alive = false;
    };
  }, [showCompleted, toast]);

  const onCreated = useCallback((a: AssignmentDTO) => {
    setAssignments((prev) => [...prev, a]);
  }, []);

  const openCount = assignments.filter((a) => !a.completedAt).length;

  return (
    // Gleiches Seiten-Geruest wie /settings: die Layout-Hoehe ist fix, gescrollt
    // wird innerhalb der Seite, nicht das Dokument.
    <main className="h-full overflow-y-auto px-6 pt-6 pb-8 lg:px-8">
      <Stagger className="mx-auto max-w-2xl space-y-6">
        <StaggerItem>
          {/* Back-Link nur auf Mobile -- dort fehlt die Sidebar. */}
          <Link
            href="/"
            className="relative mb-4 inline-flex items-center gap-1 rounded text-sm text-muted-foreground transition-colors [touch-action:manipulation] before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
          >
            <ChevronLeft className="size-4" />
            Zurück zum Stundenplan
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold leading-tight tracking-tight">Aufgaben</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {loading
                  ? "Wird geladen …"
                  : openCount === 0
                    ? "Nichts offen."
                    : `${openCount} offen über alle Fächer.`}
              </p>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setComposerOpen(true)}>
              <Plus className="size-4" />
              Neue Aufgabe
            </Button>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="flex items-center justify-end">
            <button
              type="button"
              role="switch"
              aria-checked={showCompleted}
              onClick={() => setShowCompleted((v) => !v)}
              className="relative inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 ease-[var(--ease-atlas)]",
                  showCompleted ? "bg-primary" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "size-3 rounded-full bg-background transition-transform duration-150 ease-[var(--ease-atlas)]",
                    showCompleted && "translate-x-3",
                  )}
                />
              </span>
              Erledigte zeigen
            </button>
          </div>
        </StaggerItem>

        <StaggerItem>
          {loading ? (
            <ListSkeleton />
          ) : (
            <AssignmentList
              assignments={assignments}
              onChange={setAssignments}
              grouped
              emptyLabel="Keine offenen Aufgaben. Neue legst du oben rechts an."
            />
          )}
        </StaggerItem>
      </Stagger>

      <AssignmentComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        subjects={subjects}
        onSaved={onCreated}
      />
    </main>
  );
}

// Skelett statt "Lade ..."-Text: die Seite behaelt beim Eintreffen der Daten
// ihre Form, statt von einer Textzeile auf eine Liste zu springen.
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Aufgaben werden geladen" aria-busy="true">
      {[3, 2].map((rows, g) => (
        <section key={g} className="flex flex-col gap-2">
          <Skeleton className="mx-2.5 h-3 w-20" />
          <ul className="flex flex-col gap-1">
            {Array.from({ length: rows }).map((_, i) => (
              <li key={i} className="flex items-center gap-3.5 px-2.5 py-3">
                <Skeleton className="size-[22px] shrink-0 rounded-full" />
                <span className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5" style={{ width: `${62 - i * 9}%` }} />
                  <Skeleton className="h-3 w-28 opacity-70" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
