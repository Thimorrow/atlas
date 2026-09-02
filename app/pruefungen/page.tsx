"use client";

// Pruefungsplan: nur Klassenarbeiten, Tests und Referate, nach Naehe sortiert.
// Beantwortet "wann ist die naechste Arbeit und was kommt noch" ohne Scrollen
// durch die grosse Aufgabenliste -- siehe app/aufgaben/page.tsx fuer die
// generische Sicht, hier gibt es bewusst keine Hausaufgaben und kein Abhaken.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, GraduationCap, PartyPopper, Plus, Presentation } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignmentComposer } from "@/components/assignment-composer";
import { useToast } from "@/components/toast";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import {
  TYPE_LABEL,
  daysUntilLabel,
  groupExamsByWeek,
  localISO,
  partitionExams,
  sameDayCount,
  weekdayDateLabel,
  type AssignmentDTO,
  type AssignmentType,
  type ExamWeekGroup,
} from "@/lib/assignments-view";
import { cn } from "@/lib/utils";

type SubjectOption = { id: string; name: string; color: string | null };

// Referat bekommt ein eigenes Icon, Klassenarbeit und Test teilen sich den
// Doktorhut -- beide sind "die Note zaehlt", nur unterschiedlich schwer.
const TYPE_ICON: Record<AssignmentType, typeof GraduationCap> = {
  homework: GraduationCap,
  exam: GraduationCap,
  test: GraduationCap,
  presentation: Presentation,
  other: GraduationCap,
};

export default function PruefungenPage() {
  const toast = useToast();
  const [assignments, setAssignments] = useState<AssignmentDTO[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [today, setToday] = useState(() => localISO());

  // Ueber Mitternacht darf eine offene Seite nicht in der falschen Gruppe
  // haengenbleiben (gleiches Muster wie components/assignment-list.tsx).
  useEffect(() => {
    const id = setInterval(() => setToday(localISO()), 60_000);
    return () => clearInterval(id);
  }, []);

  // completed=1 mitgeben, damit als erledigt markierte Pruefungen im
  // aufklappbaren Rueckblick nicht fehlen -- "vorbei" entscheidet hier das
  // Datum, nicht der Haken.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch("/api/assignments?completed=1").then((r) => r.json()),
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
        toast("Die Prüfungen konnten nicht geladen werden.");
      });
    return () => {
      alive = false;
    };
  }, [toast]);

  const onCreated = useCallback((a: AssignmentDTO) => {
    setAssignments((prev) => [...prev, a]);
  }, []);

  const { upcoming, past } = partitionExams(assignments, today);
  const [next, ...rest] = upcoming;
  const weeks = groupExamsByWeek(rest, today);

  return (
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
              <h1 className="text-xl font-semibold leading-tight tracking-tight">Prüfungen</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {loading
                  ? "Wird geladen …"
                  : upcoming.length === 0
                    ? "Nichts steht an."
                    : `${upcoming.length} anstehend.`}
              </p>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setComposerOpen(true)}>
              <Plus className="size-4" />
              Neue Prüfung
            </Button>
          </div>
        </StaggerItem>

        <StaggerItem>
          {loading ? (
            <PageSkeleton />
          ) : upcoming.length === 0 ? (
            <EmptyState onAdd={() => setComposerOpen(true)} />
          ) : (
            <div className="space-y-5">
              <NextExamCard exam={next} today={today} />
              {weeks.map((w) => (
                <WeekSection key={w.key} group={w} today={today} />
              ))}
            </div>
          )}
        </StaggerItem>

        {!loading && past.length > 0 && (
          <StaggerItem>
            <PastExams
              items={past}
              today={today}
              open={showPast}
              onToggle={() => setShowPast((v) => !v)}
            />
          </StaggerItem>
        )}
      </Stagger>

      <AssignmentComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        subjects={subjects}
        initial={{ type: "exam" }}
        newHeading="Neue Prüfung"
        onSaved={onCreated}
      />
    </main>
  );
}

// --- Naechste Pruefung, gross -------------------------------------------------

function NextExamCard({ exam, today }: { exam: AssignmentDTO; today: string }) {
  const tint = exam.subjectId ? colorValue(exam.subjectColor) : NEUTRAL_COLOR;
  const Icon = TYPE_ICON[exam.type];
  const days = exam.dueDate ? daysUntilLabel(exam.dueDate, today) : null;

  const body = (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card p-5 shadow-card",
        exam.subjectId && "transition-colors group-hover:bg-accent/30",
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: tint }} />
      <div className="flex items-start justify-between gap-4 pl-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Nächste Prüfung
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold leading-snug">{exam.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} />
              <span className="truncate">{exam.subjectName ?? "Allgemein"}</span>
            </span>
            <Dot />
            <span className="inline-flex shrink-0 items-center gap-1">
              <Icon className="size-3.5" strokeWidth={2.25} />
              {TYPE_LABEL[exam.type]}
            </span>
            {exam.dueDate && (
              <>
                <Dot />
                <span className="shrink-0 tabular-nums">{weekdayDateLabel(exam.dueDate)}</span>
              </>
            )}
          </div>
        </div>
        {days && (
          <div className="shrink-0 text-right">
            <p className="text-2xl font-semibold leading-none tabular-nums">{days}</p>
          </div>
        )}
        {exam.subjectId && (
          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        )}
      </div>
    </div>
  );

  if (!exam.subjectId) return body;
  return (
    <Link
      href={`/faecher/${exam.subjectId}`}
      className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {body}
    </Link>
  );
}

// --- Die weiteren, gruppiert nach Woche ---------------------------------------

function WeekSection({ group, today }: { group: ExamWeekGroup; today: string }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {group.label}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
          {group.items.length}
        </span>
        {/* Dezenter Hinweis statt bunter Warnung: drei oder mehr Pruefungen in
            derselben Woche sind die eigentliche Information, aber kein Alarm. */}
        {group.crowded && (
          <span className="text-[11px] text-muted-foreground/70">· gehäuft</span>
        )}
      </h3>
      <ul className="mt-1 flex flex-col gap-1">
        {group.items.map((a) => (
          <ExamRow key={a.id} exam={a} today={today} collisions={sameDayCount(group.items, a.dueDate)} />
        ))}
      </ul>
    </section>
  );
}

function ExamRow({
  exam,
  today,
  collisions,
}: {
  exam: AssignmentDTO;
  today: string;
  collisions: number;
}) {
  const tint = exam.subjectId ? colorValue(exam.subjectColor) : NEUTRAL_COLOR;
  const Icon = TYPE_ICON[exam.type];
  const days = exam.dueDate ? daysUntilLabel(exam.dueDate, today) : null;

  const inner = (
    <>
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-snug">
            {exam.title}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-foreground/25 px-2 py-0.5 text-[11px] font-medium text-foreground">
            <Icon className="-ml-0.5 size-3" strokeWidth={2.25} />
            {TYPE_LABEL[exam.type]}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span className="truncate">{exam.subjectName ?? "Allgemein"}</span>
          {exam.dueDate && (
            <>
              <Dot />
              <span className="shrink-0 tabular-nums">{weekdayDateLabel(exam.dueDate)}</span>
            </>
          )}
          {/* An diesem Tag steht noch eine weitere Pruefung an -- genau das
              Zusammentreffen, das eine reine Liste sonst verschluckt. Dezent
              statt alarmierend: es ist eine Information, kein Fehler. */}
          {collisions > 1 && (
            <span className="shrink-0 font-medium text-foreground/70">
              · {collisions} an diesem Tag
            </span>
          )}
        </div>
      </div>
      {days && (
        <span className="shrink-0 text-[12.5px] font-medium tabular-nums text-muted-foreground">
          {days}
        </span>
      )}
      {/* Ohne Fach fuehrt die Zeile nirgendwohin, der Pfeil entfaellt. Der
          Platz bleibt trotzdem stehen, sonst rutschen die Tagesangaben der
          Zeilen darueber und darunter gegeneinander. */}
      {exam.subjectId ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      ) : (
        <span aria-hidden className="size-4 shrink-0" />
      )}
    </>
  );

  const className =
    "group flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors [touch-action:manipulation] hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <li>
      {exam.subjectId ? (
        <Link href={`/faecher/${exam.subjectId}`} className={className}>
          {inner}
        </Link>
      ) : (
        <div className={cn(className, "hover:bg-transparent")}>{inner}</div>
      )}
    </li>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-muted-foreground/50">
      ·
    </span>
  );
}

// --- Vergangene, aufklappbar ---------------------------------------------------

function PastExams({
  items,
  today,
  open,
  onToggle,
}: {
  items: AssignmentDTO[];
  today: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="relative flex items-center gap-1.5 rounded px-1 py-1 text-[13px] text-muted-foreground transition-colors before:absolute before:-inset-1 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {open ? "Vergangene Prüfungen ausblenden" : "Vergangene Prüfungen anzeigen"}
        <span className="font-mono tabular-nums text-muted-foreground/70">({items.length})</span>
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1 opacity-75">
          {items.map((a) => (
            <PastRow key={a.id} exam={a} today={today} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PastRow({ exam, today }: { exam: AssignmentDTO; today: string }) {
  const tint = exam.subjectId ? colorValue(exam.subjectColor) : NEUTRAL_COLOR;
  const Icon = TYPE_ICON[exam.type];
  void today;
  const inner = (
    <>
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} />
      <div className="min-w-0 flex-1">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium leading-snug">
          {exam.title}
        </span>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="truncate">{exam.subjectName ?? "Allgemein"}</span>
          <Dot />
          <span className="inline-flex shrink-0 items-center gap-1">
            <Icon className="size-3" strokeWidth={2.25} />
            {TYPE_LABEL[exam.type]}
          </span>
          {exam.dueDate && (
            <>
              <Dot />
              <span className="shrink-0 tabular-nums">{weekdayDateLabel(exam.dueDate)}</span>
            </>
          )}
        </div>
      </div>
    </>
  );
  const className =
    "group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors [touch-action:manipulation] hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  return (
    <li>
      {exam.subjectId ? (
        <Link href={`/faecher/${exam.subjectId}`} className={className}>
          {inner}
        </Link>
      ) : (
        <div className={cn(className, "hover:bg-transparent")}>{inner}</div>
      )}
    </li>
  );
}

// --- Leerzustand ---------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
      <PartyPopper className="size-6 text-muted-foreground/60" />
      <div>
        <p className="text-[15px] font-medium">Nichts steht an.</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Keine Klassenarbeit, kein Test, kein Referat in Sicht.
        </p>
      </div>
      <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={onAdd}>
        <Plus className="size-4" />
        Prüfung eintragen
      </Button>
    </div>
  );
}

// --- Ladezustand -----------------------------------------------------------------

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-label="Prüfungen werden geladen" aria-busy="true">
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2.5 h-5 w-48" />
        <Skeleton className="mt-2 h-3.5 w-56" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="mx-1 h-3 w-20" />
        <ul className="flex flex-col gap-1">
          {[1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 px-2.5 py-2.5">
              <Skeleton className="size-2 shrink-0 rounded-full" />
              <span className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5" style={{ width: `${58 - i * 8}%` }} />
                <Skeleton className="h-3 w-32 opacity-70" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
