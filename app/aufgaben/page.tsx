"use client";

// Aufgaben und Pruefungen auf einer Seite: zwei Tabs ueber derselben Tabelle.
// "Offen" ist die Hausaufgaben-Liste mit Quick-Add, "Pruefungen" die
// Pruefungsansicht (naechste gross, Rest nach Woche, Vergangene aufklappbar).
// Je Tab holt die Seite ihren Stand vom Server -- der Tabwechsel ist nur noch
// ein Fetch statt einer vollen Seitennavigation.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, RefreshCw } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { AssignmentList } from "@/components/assignment-list";
import { AssignmentQuickAdd } from "@/components/assignment-quick-add";
import { ExamComposer } from "@/components/exam-composer";
import { PruefungenEmpty, PruefungenSkeleton, PruefungenView } from "@/components/pruefungen-view";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import {
  groupExamsByWeek,
  localISO,
  partitionExams,
  type AssignmentDTO,
} from "@/lib/assignments-view";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type Tab = "offen" | "pruefungen";
type SubjectOption = { id: string; name: string; color: string | null };

function initialTab(): Tab {
  if (typeof window === "undefined") return "offen";
  return new URLSearchParams(window.location.search).get("tab") === "pruefungen"
    ? "pruefungen"
    : "offen";
}

export default function AssignmentsPage() {
  const toast = useToast();
  const [assignments, setAssignments] = useState<AssignmentDTO[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  // Getrennt vom Toast: der Toast verschwindet nach ein paar Sekunden von
  // selbst, aber solange gar keine Daten da sind, braucht die Seite einen
  // Zustand, der bleibt -- sonst sieht ein Fehlschlag genauso aus wie "keine
  // offenen Aufgaben" und die Erklaerung dazu ist laengst weg.
  const [loadError, setLoadError] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [composerOpen, setComposerOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [today, setToday] = useState(() => localISO());

  // Ueber Mitternacht darf eine offene Seite nicht in der falschen Gruppe
  // haengenbleiben (gleiches Muster wie components/assignment-list.tsx).
  useEffect(() => {
    const id = setInterval(() => setToday(localISO()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Offen ohne, Erledigte und Pruefungen mit ?completed=1 -- wie frueher je
  // Ansicht vom Server, damit Loeschen und Abhaken keine Geister in der
  // jeweils anderen Sicht hinterlassen. Der Tabwechsel ist nur noch ein
  // Fetch statt einer vollen Seitennavigation.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    const query = tab === "pruefungen" || showCompleted ? "?completed=1" : "";
    Promise.all([
      fetch(`/api/assignments${query}`).then((r) => r.json()),
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
        setLoadError(true);
        toast("Die Aufgaben konnten nicht geladen werden.");
      });
    return () => {
      alive = false;
    };
  }, [toast, reloadKey, tab, showCompleted]);

  const onCreated = useCallback((a: AssignmentDTO) => {
    setAssignments((prev) => [...prev, a]);
  }, []);

  const switchTab = useCallback((next: Tab) => {
    setTab(next);
    const url = next === "pruefungen" ? "/aufgaben?tab=pruefungen" : "/aufgaben";
    window.history.replaceState(null, "", url);
  }, []);

  const open = assignments.filter((a) => !a.completedAt);
  const { upcoming, past } = partitionExams(assignments, today);
  const [next, ...rest] = upcoming;
  const weeks = groupExamsByWeek(rest, today);

  const subtitle = loading
    ? "Wird geladen …"
    : tab === "pruefungen"
      ? upcoming.length === 0
        ? "Nichts steht an."
        : `${upcoming.length} anstehend.`
      : open.length === 0
        ? "Nichts offen."
        : `${open.length} offen über alle Fächer.`;

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
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {tab === "pruefungen" && !loading && !loadError && (
              <Button size="sm" className="gap-1.5" onClick={() => setComposerOpen(true)}>
                <Plus className="size-4" />
                Neue Prüfung
              </Button>
            )}
          </div>
        </StaggerItem>

        <StaggerItem>
          <div
            role="tablist"
            aria-label="Aufgaben und Prüfungen"
            className="flex gap-1 rounded-lg border bg-card p-1 shadow-card"
          >
            {(
              [
                { id: "offen", label: "Offen" },
                { id: "pruefungen", label: "Prüfungen" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => switchTab(t.id)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  tab === t.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </StaggerItem>

        {tab === "offen" && (
          <StaggerItem>
            <AssignmentQuickAdd onCreated={onCreated} />
          </StaggerItem>
        )}

        {tab === "offen" && (
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
        )}

        <StaggerItem>
          {loading ? (
            tab === "pruefungen" ? (
              <PruefungenSkeleton />
            ) : (
              <ListSkeleton />
            )
          ) : loadError ? (
            <LoadErrorState onRetry={() => setReloadKey((k) => k + 1)} />
          ) : tab === "pruefungen" ? (
            upcoming.length === 0 ? (
              <PruefungenEmpty onAdd={() => setComposerOpen(true)} />
            ) : (
              next && (
                <PruefungenView
                  next={next}
                  weeks={weeks}
                  past={past}
                  today={today}
                  showPast={showPast}
                  onTogglePast={() => setShowPast((v) => !v)}
                />
              )
            )
          ) : (
            <AssignmentList
              assignments={assignments}
              onChange={setAssignments}
              grouped
              emptyLabel="Nichts offen."
              emptyHint="Neue legst du oben in der Zeile an."
            />
          )}
        </StaggerItem>
      </Stagger>

      <ExamComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        subjects={subjects}
        existingExams={upcoming}
        onSaved={onCreated}
      />
    </main>
  );
}

// Eigener Zustand statt eines leeren AssignmentList mit generischem
// emptyLabel -- sonst sieht ein Fehlschlag beim Laden optisch genauso aus
// wie "keine offenen Aufgaben", und der erklaerende Toast ist nach 4s weg.
function LoadErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center">
      <p className="text-sm text-muted-foreground">Die Aufgaben konnten nicht geladen werden.</p>
      <button
        type="button"
        onClick={onRetry}
        className="relative inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[13px] font-medium transition-colors [touch-action:manipulation] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <RefreshCw className="size-3.5" />
        Erneut versuchen
      </button>
    </div>
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
