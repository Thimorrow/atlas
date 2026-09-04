"use client";

// Reine Anzeige der Pruefungen (Klassenarbeit, Test, Referat): naechste gross,
// Rest nach Woche gruppiert, Vergangene aufklappbar. Frueher die eigene Seite
// /pruefungen, jetzt der Pruefungen-Tab auf /aufgaben -- Gruppierung und
// Sortierung (partitionExams, groupExamsByWeek) laufen in der Seite, hier wird
// nur gerendert. Anlegen bleibt beim ExamComposer der Seite.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, GraduationCap, ListChecks, PartyPopper, Plus, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { PhaseChip, SicherheitsBalken } from "@/components/lernplan-ui";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import {
  TYPE_LABEL,
  daysUntilLabel,
  isExam,
  sameDayCount,
  weekdayDateLabel,
  type AssignmentDTO,
  type AssignmentLernplan,
  type AssignmentType,
  type ExamWeekGroup,
} from "@/lib/assignments-view";
import type { ItemDTO } from "@/lib/lernplan-types";
import { cn } from "@/lib/utils";

// Referat bekommt ein eigenes Icon, Klassenarbeit und Test teilen sich den
// Doktorhut -- beide sind "die Note zaehlt", nur unterschiedlich schwer.
const TYPE_ICON: Record<AssignmentType, typeof GraduationCap> = {
  homework: GraduationCap,
  exam: GraduationCap,
  test: GraduationCap,
  presentation: Presentation,
  other: GraduationCap,
};

export function PruefungenView({
  next,
  weeks,
  past,
  today,
  showPast,
  onTogglePast,
}: {
  next: AssignmentDTO;
  weeks: ExamWeekGroup[];
  past: AssignmentDTO[];
  today: string;
  showPast: boolean;
  onTogglePast: () => void;
}) {
  return (
    <div className="space-y-5">
      <NextExamCard exam={next} today={today} />
      {weeks.map((w) => (
        <WeekSection key={w.key} group={w} today={today} />
      ))}
      {past.length > 0 && (
        <PastExams items={past} today={today} open={showPast} onToggle={onTogglePast} />
      )}
    </div>
  );
}

// --- Naechste Pruefung, gross -------------------------------------------------

function NextExamCard({ exam, today }: { exam: AssignmentDTO; today: string }) {
  const tint = exam.subjectId ? colorValue(exam.subjectColor) : NEUTRAL_COLOR;
  const Icon = TYPE_ICON[exam.type];
  const days = exam.dueDate ? daysUntilLabel(exam.dueDate, today) : null;

  // Der Kopf bleibt der klickbare Link ins Fach (group-Hover fuer den
  // Chevron); der Lernplan-Block darunter braucht eigene Links/Checkboxen
  // und darf deshalb nicht mehr IN diesem Link liegen (kein <a> in <a>).
  const kopf = (
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
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-card">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: tint }} />
      {exam.subjectId ? (
        <Link
          href={`/faecher/${exam.subjectId}`}
          className="group -m-1 block rounded-lg p-1 transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {kopf}
        </Link>
      ) : (
        kopf
      )}
      <NextExamLernplan exam={exam} />
    </div>
  );
}

// --- Lernplan-Block in der grossen Karte -----------------------------------

function NextExamLernplan({ exam }: { exam: AssignmentDTO }) {
  if (!isExam(exam.type) || !exam.subjectId || exam.lernplan === undefined) return null;
  const subjectId = exam.subjectId;

  if (exam.lernplan === null) {
    return (
      <div className="mt-3 border-t pt-3 pl-2">
        <Link
          href={`/lernen/${subjectId}/plan/${exam.id}/neu`}
          className="relative inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors [touch-action:manipulation] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ListChecks className="size-3.5" strokeWidth={2.25} />
          Lernplan erstellen
        </Link>
      </div>
    );
  }

  return (
    <NextExamLernplanDetails subjectId={subjectId} assignmentId={exam.id} plan={exam.lernplan} />
  );
}

function NextExamLernplanDetails({
  subjectId,
  assignmentId,
  plan,
}: {
  subjectId: string;
  assignmentId: string;
  plan: AssignmentLernplan;
}) {
  const toast = useToast();
  const [items, setItems] = useState(plan.heute);
  const [done, setDone] = useState(plan.done);
  useEffect(() => {
    setItems(plan.heute);
    setDone(plan.done);
  }, [plan]);

  async function toggle(item: ItemDTO) {
    const neuErledigt = item.doneAt === null;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, doneAt: neuErledigt ? new Date().toISOString() : null } : i)));
    setDone((d) => d + (neuErledigt ? 1 : -1));
    try {
      const res = await fetch(`/api/lernen/plan/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done: neuErledigt }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, doneAt: item.doneAt } : i)));
      setDone((d) => d + (neuErledigt ? -1 : 1));
      toast("Einheit konnte nicht aktualisiert werden.");
    }
  }

  return (
    <div className="mt-3 space-y-2.5 border-t pt-3 pl-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Lernplan{plan.heuteLeer ? " · nächste offene" : ""}
        </p>
        <Link
          href={`/lernen/${subjectId}/plan/${assignmentId}`}
          className="relative shrink-0 rounded px-1 py-1 text-[12.5px] font-medium text-primary before:absolute before:-inset-2 before:content-[''] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Ganzer Plan
        </Link>
      </div>

      <SicherheitsBalken wert={plan.sicherheit}>
        <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
          {done} von {plan.total}
        </span>
      </SicherheitsBalken>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => (
            <NextExamEinheitZeile key={item.id} subjectId={subjectId} assignmentId={assignmentId} item={item} onToggle={toggle} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NextExamEinheitZeile({
  subjectId,
  assignmentId,
  item,
  onToggle,
}: {
  subjectId: string;
  assignmentId: string;
  item: ItemDTO;
  onToggle: (item: ItemDTO) => void;
}) {
  const erledigt = item.doneAt !== null;
  const titel = item.punktTitel ?? (item.phase === "simulation" ? "Simulation" : "Thema fehlt");
  const manuell = item.phase === "probe" || item.phase === "simulation";

  const inhalt = (
    <>
      {!manuell && (
        <button
          type="button"
          role="checkbox"
          aria-checked={erledigt}
          aria-label={erledigt ? `${titel} als offen markieren` : `${titel} als erledigt markieren`}
          onClick={() => onToggle(item)}
          className={cn(
            "relative grid size-5 shrink-0 place-items-center rounded border transition-colors before:absolute before:-inset-3 before:content-[''] [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            erledigt ? "border-primary bg-primary text-primary-foreground" : "border-border",
          )}
        >
          {erledigt && (
            <span aria-hidden className="text-[11px] leading-none">
              ✓
            </span>
          )}
        </button>
      )}
      <PhaseChip phase={item.phase} />
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", erledigt && !manuell && "text-muted-foreground line-through")}>
        {titel}
      </span>
      <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">{item.minuten} Min</span>
      {manuell && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  );

  if (manuell) {
    return (
      <li>
        <Link
          href={`/lernen/${subjectId}/plan/${assignmentId}`}
          className="flex items-center gap-2 rounded-lg px-1 py-1.5 transition-colors [touch-action:manipulation] hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {inhalt}
        </Link>
      </li>
    );
  }

  return <li className="flex items-center gap-2 px-1 py-1.5">{inhalt}</li>;
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
      <ExamRowLernplanLink exam={exam} />
    </li>
  );
}

// Kein zweites Gewicht neben der Zeile: nur ein kleiner Link, kein eigener
// Block wie in der grossen Karte (siehe SPEC.md "Wochen-Listen: Link 'Plan'
// oder 'Lernplan erstellen'").
function ExamRowLernplanLink({ exam }: { exam: AssignmentDTO }) {
  if (!isExam(exam.type) || !exam.subjectId || exam.lernplan === undefined) return null;
  const href = exam.lernplan
    ? `/lernen/${exam.subjectId}/plan/${exam.id}`
    : `/lernen/${exam.subjectId}/plan/${exam.id}/neu`;
  return (
    <Link
      href={href}
      className="relative -mt-1 ml-[1.625rem] inline-flex min-h-8 items-center rounded px-1 py-1 text-[12px] font-medium text-primary before:absolute before:-inset-1 before:content-[''] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {exam.lernplan ? "Plan" : "Lernplan erstellen"}
    </Link>
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

// --- Leerer Pruefungs-Tab ------------------------------------------------------

export function PruefungenEmpty({ onAdd }: { onAdd: () => void }) {
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

// --- Ladezustand des Pruefungs-Tabs --------------------------------------------

export function PruefungenSkeleton() {
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
