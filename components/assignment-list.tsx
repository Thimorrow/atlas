"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GraduationCap, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { AssignmentCheckbox } from "@/components/assignment-checkbox";
import { AssignmentComposer, type AssignmentComposerInitial } from "@/components/assignment-composer";
import { useToast } from "@/components/toast";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import {
  type AssignmentDTO,
  TYPE_LABEL,
  compareInGroup,
  dueLabel,
  groupAssignments,
  isExam,
  localISO,
  overdueLabel,
  recentlyCompleted,
} from "@/lib/assignments-view";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

type SubjectOption = { id: string; name: string; color: string | null };

export function AssignmentList({
  assignments,
  onChange,
  grouped = false,
  emptyLabel = "Nichts offen.",
  showSubject = true,
}: {
  assignments: AssignmentDTO[];
  onChange: (next: AssignmentDTO[]) => void;
  grouped?: boolean;
  emptyLabel?: string;
  showSubject?: boolean;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const toast = useToast();
  const [today, setToday] = useState(() => localISO());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentComposerInitial | undefined>(undefined);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);

  // Ueber Mitternacht darf eine offene Seite nicht in der falschen Gruppe
  // haengenbleiben -- der Tageswechsel schiebt "heute" sonst nie weiter.
  useEffect(() => {
    const id = setInterval(() => setToday(localISO()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Die Fachliste braucht nur, wer wirklich bearbeitet. Deshalb erst beim
  // ersten Oeffnen des Editors laden, nicht bei jedem Listen-Mount.
  useEffect(() => {
    if (!editorOpen || subjects.length > 0) return;
    let alive = true;
    fetch("/api/subjects")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setSubjects((d.subjects ?? []) as SubjectOption[]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [editorOpen, subjects.length]);

  // Abhaken ist optimistic: der Zustand kippt sofort, der Server bestaetigt
  // danach. Schlaegt der Request fehl (HTTP-Fehler ODER Netzwerkfehler),
  // springt exakt der vorherige Zustand zurueck und eine Meldung erscheint --
  // eine faelschlich abgehakte Aufgabe waere schlimmer als gar keine Reaktion.
  const toggle = useCallback(
    async (a: AssignmentDTO) => {
      const wasCompleted = Boolean(a.completedAt);
      const before = assignments;
      const optimistic = assignments.map((x) =>
        x.id === a.id ? { ...x, completedAt: wasCompleted ? null : new Date().toISOString() } : x,
      );
      onChange(optimistic);
      try {
        const res = await fetch(`/api/assignments/${a.id}/complete`, {
          method: wasCompleted ? "DELETE" : "POST",
        });
        if (!res.ok) throw new Error("toggle failed");
        // Den Serverwert uebernehmen, damit completedAt exakt stimmt (die
        // optimistische Zeit ist nur eine Schaetzung).
        const data = (await res.json().catch(() => null)) as { assignment?: AssignmentDTO } | null;
        if (data?.assignment) {
          onChange(optimistic.map((x) => (x.id === a.id ? data.assignment! : x)));
        }
      } catch {
        onChange(before);
        toast(
          wasCompleted
            ? "Die Aufgabe konnte nicht wieder geöffnet werden."
            : "Die Aufgabe konnte nicht abgehakt werden.",
        );
      }
    },
    [assignments, onChange, toast],
  );

  const remove = useCallback(
    async (a: AssignmentDTO) => {
      const before = assignments;
      onChange(assignments.filter((x) => x.id !== a.id));
      try {
        const res = await fetch(`/api/assignments/${a.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("delete failed");
      } catch {
        onChange(before);
        toast("Die Aufgabe konnte nicht gelöscht werden.");
      }
    },
    [assignments, onChange, toast],
  );

  const openEdit = useCallback((a: AssignmentDTO) => {
    setEditing({
      id: a.id,
      title: a.title,
      type: a.type,
      subjectId: a.subjectId,
      dueDate: a.dueDate,
      notes: a.notes,
    });
    setEditorOpen(true);
  }, []);

  const onSaved = useCallback(
    (saved: AssignmentDTO) => {
      onChange(assignments.map((x) => (x.id === saved.id ? saved : x)));
    },
    [assignments, onChange],
  );

  const open = assignments.filter((a) => !a.completedAt);
  const done = recentlyCompleted(assignments, today);
  const groups = grouped ? groupAssignments(assignments, today) : [];
  // Flache Liste (Fach-Seite): erst nach Datum, dann nach der Gruppenregel
  // (Pruefungen vorn, dann Fach, dann Titel). Aufgaben ohne Datum ans Ende.
  const flat = grouped
    ? []
    : [...open].sort(
        (a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿") || compareInGroup(a, b),
      );

  const row = (a: AssignmentDTO, overdue: boolean) => (
    <Row
      key={a.id}
      a={a}
      today={today}
      overdue={overdue}
      showSubject={showSubject}
      reduce={Boolean(reduce)}
      onToggle={toggle}
      onEdit={openEdit}
      onDelete={remove}
    />
  );

  return (
    <div>
      {open.length === 0 && done.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="space-y-6">
          {grouped
            ? groups.map((g) => (
                <section
                  key={g.key}
                  className={cn(
                    // Der Ueberfaellig-Block traegt die Fehlerfarbe, aber dezent
                    // getoent statt als schreiend rote Flaeche.
                    g.key === "overdue" && "rounded-xl bg-destructive/5 px-3 py-3 ring-1 ring-destructive/15",
                  )}
                >
                  <GroupHeading
                    label={g.label}
                    count={g.items.length}
                    tone={g.key === "overdue" ? "destructive" : "muted"}
                  />
                  <ul className="mt-1">
                    <AnimatePresence initial={false}>
                      {g.items.map((a) => row(a, g.key === "overdue"))}
                    </AnimatePresence>
                  </ul>
                </section>
              ))
            : flat.length > 0 && (
                <ul>
                  <AnimatePresence initial={false}>
                    {flat.map((a) => row(a, Boolean(a.dueDate && a.dueDate < today)))}
                  </AnimatePresence>
                </ul>
              )}

          {done.length > 0 && (
            <section>
              <GroupHeading label="Erledigt" count={done.length} tone="muted" />
              <ul className="mt-1">
                <AnimatePresence initial={false}>{done.map((a) => row(a, false))}</AnimatePresence>
              </ul>
            </section>
          )}
        </div>
      )}

      <AssignmentComposer
        open={editorOpen}
        onOpenChange={setEditorOpen}
        subjects={subjects}
        initial={editing}
        onSaved={onSaved}
      />
    </div>
  );
}

// --- Kleinteile -------------------------------------------------------------

function GroupHeading({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "muted" | "destructive";
}) {
  return (
    <h3 className="flex items-center gap-2 px-2.5">
      <span
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wide",
          tone === "destructive" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          tone === "destructive" ? "text-destructive/70" : "text-muted-foreground/70",
        )}
      >
        {count}
      </span>
    </h3>
  );
}

function RowMenu({
  a,
  onEdit,
  onDelete,
}: {
  a: AssignmentDTO;
  onEdit: (a: AssignmentDTO) => void;
  onDelete: (a: AssignmentDTO) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Aktionen für ${a.title}`}
          onClick={(e) => e.stopPropagation()}
          // A1 (Touch): before blaeht die 28px-Flaeche unsichtbar auf 44px auf.
          // Auf Touch-Geraeten ist das Menue immer sichtbar (opacity-100), weil
          // es dort kein Hover gibt, das es einblenden koennte.
          className="relative grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/60 transition-[opacity,color,background-color] before:absolute before:-inset-2 before:content-[''] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=open]:bg-accent data-[state=open]:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="size-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem className="py-2.5" onClick={() => onEdit(a)}>
          <Pencil />
          Bearbeiten
        </DropdownMenuItem>
        <DropdownMenuItem
          className="py-2.5 text-destructive [&_svg]:text-destructive focus:bg-destructive/10 focus:text-destructive"
          onClick={() => onDelete(a)}
        >
          <Trash2 />
          Löschen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Row({
  a,
  today,
  overdue,
  showSubject,
  reduce,
  onToggle,
  onEdit,
  onDelete,
}: {
  a: AssignmentDTO;
  today: string;
  overdue: boolean;
  showSubject: boolean;
  reduce: boolean;
  onToggle: (a: AssignmentDTO) => void;
  onEdit: (a: AssignmentDTO) => void;
  onDelete: (a: AssignmentDTO) => void;
}) {
  const checked = Boolean(a.completedAt);
  const exam = isExam(a.type);
  const tint = a.subjectId ? colorValue(a.subjectColor) : NEUTRAL_COLOR;
  const due = dueLabel(a.dueDate, today);

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, transition: { duration: 0.16, ease: EASE } }}
      transition={{ duration: 0.28, ease: EASE }}
    >
      <div
        className={cn(
          "group flex items-center gap-3.5 rounded-lg px-2.5 py-3 transition-colors hover:bg-accent/40",
          checked && "opacity-55",
        )}
      >
        <AssignmentCheckbox
          checked={checked}
          tint={tint}
          size={22}
          ariaLabel={`${a.title} ${checked ? "wieder öffnen" : "abhaken"}`}
          onClick={() => onToggle(a)}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[15px] font-medium leading-snug",
                checked && "line-through decoration-foreground/30",
              )}
            >
              {a.title}
            </span>
            {/* Pruefungen sind sichtbar als solche gekennzeichnet, nicht nur
                ueber ihre Position in der Sortierung. Hausaufgaben brauchen
                kein Label -- sie sind der Normalfall. */}
            {a.type !== "homework" && (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                  exam
                    ? "border-foreground/25 font-medium text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {exam && <GraduationCap className="-ml-0.5 size-3" strokeWidth={2.25} />}
                {TYPE_LABEL[a.type]}
              </span>
            )}
            <RowMenu a={a} onEdit={onEdit} onDelete={onDelete} />
          </div>

          <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted-foreground">
            {showSubject && (
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} />
                <span className="truncate">{a.subjectName ?? "Allgemein"}</span>
              </span>
            )}
            {/* Im Ueberfaellig-Block zaehlt die Verspaetung, sonst das Datum. */}
            {overdue && a.dueDate ? (
              <span className="shrink-0 tabular-nums text-destructive">
                {showSubject && <span aria-hidden className="mr-2 text-muted-foreground/50">·</span>}
                {overdueLabel(a.dueDate, today)}
              </span>
            ) : (
              due && (
                <span className="shrink-0 tabular-nums">
                  {showSubject && <span aria-hidden className="mr-2 text-muted-foreground/50">·</span>}
                  {due}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </motion.li>
  );
}
