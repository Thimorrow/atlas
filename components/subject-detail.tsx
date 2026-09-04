"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Archive,
  ArchiveRestore,
  GraduationCap,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ColorPicker, EmptyPanel, Modal, ButtonLink } from "@/components/subject-setup";
import type { SubjectDTO } from "@/components/subject-card";
import { AssignmentList } from "@/components/assignment-list";
import { AssignmentComposer } from "@/components/assignment-composer";
import { ExamComposer } from "@/components/exam-composer";
import { PROSE, SubjectNotes, type SubjectLessonNoteDTO } from "@/components/subject-notes";
import { LessonNoteEditor, type LessonNoteTarget } from "@/components/lesson-note";
import { SubjectFiles } from "@/components/subject-files";
import { SubjectGrades } from "@/components/subject-grades";
import { SubjectParticipation, type SubjectParticipationDTO } from "@/components/subject-participation";
import { SubjectOnenote, useMicrosoftStatus } from "@/components/subject-onenote";
import { useToast } from "@/components/toast";
import { renderMarkdown } from "@/lib/markdown";
import { colorValue } from "@/lib/subject-colors";
import { subjectAverage, formatPoints } from "@/lib/grades";
import { TEACHER_TITLES } from "@/lib/teacher";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { dueLabel, isExamPageType, type AssignmentDTO } from "@/lib/assignments-view";
import type { GradeDTO } from "@/lib/grade-store";

export type LessonDTO = {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  room: string | null;
  teacher: string | null;
  status: "regular" | "cancelled" | "substituted";
  substitutionText: string | null;
};

type NoteDTO = {
  id: string;
  subjectId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

// Dieselbe Form wie in der Liste, die sie anzeigt -- eine dritte Kopie
// derselben sechs Felder waere nur eine Stelle mehr, die auseinanderlaufen
// kann. Der Name bleibt, weil er hier den Eintrag im Fach-Payload benennt.
export type LessonNoteEntryDTO = SubjectLessonNoteDTO;

type Payload = {
  subject: SubjectDTO;
  notes: NoteDTO[];
  assignments: AssignmentDTO[];
  upcoming: LessonDTO[];
  grades: GradeDTO[];
  lessonNotes: LessonNoteEntryDTO[];
  participation: SubjectParticipationDTO;
};

// 16px ist Pflicht, nicht Geschmack: iOS-Safari zoomt beim Fokus in jedes Feld
// darunter hinein und schiebt den halben Dialog aus dem Bild.
const FIELD =
  "h-11 w-full rounded-lg border bg-background px-3 text-[16px] transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const hm = (t: string) => t.slice(0, 5);

// "02.09.2026" fuer den Kopf einer Stundennotiz -- date kommt als YYYY-MM-DD.
function fmtLessonDate(dateISO: string) {
  const [y, m, d] = dateISO.split("-");
  return `${d}.${m}.${y}`;
}

// Neuste zuerst -- dieselbe Reihenfolge wie die API liefert, gebraucht beim
// Wiedereinfuegen eines Eintrags nach dem Speichern (siehe onSaved unten).
const byLessonDateDesc = (a: LessonNoteEntryDTO, b: LessonNoteEntryDTO) =>
  b.date === a.date ? b.startTime.localeCompare(a.startTime) : b.date.localeCompare(a.date);

// Zwei Knoepfe statt eines Auswahlfeldes: bei genau zwei Moeglichkeiten ist die
// Auswahl schon sichtbar, ein Aufklappen waere ein Schritt zu viel.
function TitlePicker({
  value,
  onChange,
}: {
  value: "herr" | "frau";
  onChange: (v: "herr" | "frau") => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Anrede"
      className="flex h-11 shrink-0 items-center gap-0.5 rounded-lg border bg-background p-0.5"
    >
      {TEACHER_TITLES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={value === t.value}
          onClick={() => value !== t.value && onChange(t.value)}
          className={cn(
            "h-full rounded-[6px] px-3 text-[14px] transition-colors [touch-action:manipulation]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === t.value
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3">
        <h2 className="text-[15px] font-semibold leading-tight tracking-tight">{title}</h2>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

// --- Tabs ---------------------------------------------------------------

type Tab = "uebersicht" | "noten" | "aufgaben" | "notizen" | "material";
const TAB_IDS: Tab[] = ["uebersicht", "noten", "aufgaben", "notizen", "material"];

// Gleiches Muster wie /aufgaben: der Tab kommt direkt aus der URL, kein
// zusaetzlicher Umweg ueber useEffect noetig.
function initialTab(): Tab {
  if (typeof window === "undefined") return "uebersicht";
  const raw = new URLSearchParams(window.location.search).get("tab");
  return (TAB_IDS as string[]).includes(raw ?? "") ? (raw as Tab) : "uebersicht";
}

// Ersetzt in `full` genau die Eintraege, die auch im ausgewerteten Ausschnitt
// standen -- unveraendert gebliebene Aufgaben ausserhalb des Ausschnitts
// bleiben unangetastet, geloeschte fallen raus. Gebraucht, weil die
// Uebersicht AssignmentList nur die ersten fuenf offenen Aufgaben zeigt,
// dessen onChange aber nur diesen Ausschnitt kennt.
function mergeAssignments(
  full: AssignmentDTO[],
  oldSubset: AssignmentDTO[],
  newSubset: AssignmentDTO[],
): AssignmentDTO[] {
  const oldIds = new Set(oldSubset.map((a) => a.id));
  const byId = new Map(newSubset.map((a) => [a.id, a]));
  return full.filter((a) => !oldIds.has(a.id) || byId.has(a.id)).map((a) => byId.get(a.id) ?? a);
}

export function SubjectDetail({ id }: { id: string }) {
  const toast = useToast();
  // Einmal pro Seite abgefragt: die Abschnittswahl und der Sende-Knopf an der
  // Notiz haengen an derselben Auskunft.
  const microsoft = useMicrosoftStatus();
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");

  // Stammdaten-Entwurf: die Felder sind direkt beschreibbar und speichern beim
  // Verlassen des Feldes, damit es keinen separaten "Bearbeiten"-Modus braucht.
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  // Zweiter Einstieg neben "Aufgabe hinzufuegen": eine Klassenarbeit ist kein
  // Formularfeld mehr in AssignmentComposer (siehe exam-composer.tsx), das
  // Fach ist hier aber bereits bekannt und wird direkt vorbelegt.
  const [examComposing, setExamComposing] = useState(false);
  const [noteTarget, setNoteTarget] = useState<LessonNoteTarget | null>(null);
  // date/startTime der gerade geoeffneten Stundennotiz -- gebraucht, um einen
  // Eintrag nach dem Leeren+Wiederbeschreiben an der richtigen Stelle zurueck
  // in die Liste einzufuegen (siehe onSaved am LessonNoteEditor unten).
  const [noteMeta, setNoteMeta] = useState<{ date: string; startTime: string } | null>(null);

  const [tab, setTab] = useState<Tab>(initialTab);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/subjects/${id}`);
      if (res.status === 404) {
        setState("missing");
        return;
      }
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      const json = (await res.json()) as Payload;
      setData(json);
      setName(json.subject.name);
      setTeacher(json.subject.teacher ?? "");
      setRoom(json.subject.room ?? "");
      setState("ready");
    } catch {
      setState("failed");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const switchTab = useCallback(
    (next: Tab) => {
      setTab(next);
      const url = next === "uebersicht" ? `/faecher/${id}` : `/faecher/${id}?tab=${next}`;
      window.history.replaceState(null, "", url);
    },
    [id],
  );

  async function patch(body: Record<string, unknown>) {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/subjects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Speichern fehlgeschlagen");
      setData((prev) => (prev ? { ...prev, subject: json.subject as SubjectDTO } : prev));
    } catch (e) {
      toast((e as Error).message || "Die Änderung konnte nicht gespeichert werden.");
      // Zurueck auf den zuletzt bestaetigten Serverstand, statt eine Aenderung
      // stehen zu lassen, die gar nicht angekommen ist.
      if (data) {
        setName(data.subject.name);
        setTeacher(data.subject.teacher ?? "");
        setRoom(data.subject.room ?? "");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/subjects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
      // Voller Reload statt router.push: die Uebersicht laedt ihre Zahlen ohnehin
      // frisch, und der geloeschte Eintrag darf nirgends im Cache stehenbleiben.
      window.location.href = "/faecher";
    } catch (e) {
      toast((e as Error).message || "Das Fach konnte nicht gelöscht werden.");
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (state === "loading") {
    return (
      <Shell>
        <SubjectDetailSkeleton />
      </Shell>
    );
  }

  if (state === "missing") {
    return (
      <Shell>
        <EmptyPanel
          title="Fach nicht gefunden"
          text="Dieses Fach gibt es nicht mehr. Vielleicht wurde es gelöscht."
        >
          <ButtonLink href="/faecher">Zurück zu den Fächern</ButtonLink>
        </EmptyPanel>
      </Shell>
    );
  }

  if (state === "failed" || !data) {
    return (
      <Shell>
        <EmptyPanel
          title="Das Fach konnte nicht geladen werden"
          text="Prüf deine Verbindung und versuch es noch einmal."
        >
          <Button variant="outline" onClick={() => void load()}>
            Erneut versuchen
          </Button>
        </EmptyPanel>
      </Shell>
    );
  }

  const subject = data.subject;
  const archived = Boolean(subject.archivedAt);

  const nextLesson = data.upcoming[0];
  const subtitleParts = [
    subject.teacherLabel,
    subject.room ? `Raum ${subject.room}` : null,
    nextLesson
      ? `Nächste Stunde ${dueLabel(nextLesson.date)} ${hm(nextLesson.startTime)}${
          nextLesson.status === "cancelled" ? " entfällt" : ""
        }`
      : null,
  ].filter(Boolean);

  const average = subjectAverage(data.grades, subject.oralWeight).average;

  const openAssignments = data.assignments.filter((a) => !a.completedAt);
  const notesCount = data.notes.length + data.lessonNotes.length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "uebersicht", label: "Übersicht" },
    { id: "noten", label: "Noten" },
    { id: "aufgaben", label: "Aufgaben", badge: openAssignments.length },
    { id: "notizen", label: "Notizen", badge: notesCount },
    { id: "material", label: "Material" },
  ];

  return (
    <Shell>
      <StaggerItem>
        <Link
          href="/faecher"
          className="relative mb-4 inline-flex items-center gap-1 rounded text-sm text-muted-foreground transition-colors [touch-action:manipulation] before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ChevronLeft className="size-4" />
          Alle Fächer
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: colorValue(subject.color) }}
              />
              <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
                {subject.name}
              </h1>
              {archived && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Archiviert
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {subtitleParts.length > 0 ? subtitleParts.join(" · ") : "Keine Stammdaten hinterlegt"}
            </p>
          </div>

          <div className="flex shrink-0 items-start gap-2">
            {average ? (
              <div className="text-right tabular-nums">
                <div className="text-3xl font-semibold leading-none">{formatPoints(average.points)}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">Note {average.label}</div>
              </div>
            ) : (
              <div className="text-right text-[12px] text-muted-foreground">Noch keine Note</div>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Mehr">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  Bearbeiten
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void patch({ archivedAt: archived ? null : "now" })}>
                  {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                  {archived ? "Reaktivieren" : "Archivieren"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setConfirmDelete(true)}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                  Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </StaggerItem>

      <StaggerItem>
        <div
          role="tablist"
          aria-label="Fachbereiche"
          className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1 shadow-card"
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const idx = tabs.findIndex((t) => t.id === tab);
            const dir = e.key === "ArrowRight" ? 1 : -1;
            const next = tabs[(idx + dir + tabs.length) % tabs.length];
            switchTab(next.id);
            tabRefs.current[next.id]?.focus();
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              id={`fach-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`fach-panel-${t.id}`}
              onClick={() => switchTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex-1",
                tab === t.id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {!!t.badge && (
                <span className="rounded bg-muted px-1.5 text-[11px] tabular-nums">{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </StaggerItem>

      {/* --- Uebersicht --- */}
      <StaggerItem>
        <div
          id="fach-panel-uebersicht"
          role="tabpanel"
          aria-labelledby="fach-tab-uebersicht"
          hidden={tab !== "uebersicht"}
          className="space-y-6"
        >
          <Section title="Nächste Stunden">
            {data.upcoming.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Keine kommenden Stunden</p>
            ) : (
              <ul className="divide-y">
                {data.upcoming.slice(0, 5).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
                    <span className="w-32 shrink-0 font-medium">{dueLabel(l.date)}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {hm(l.startTime)}
                      {l.endTime ? `–${hm(l.endTime)}` : ""}
                    </span>
                    {l.room && <span className="text-muted-foreground">{l.room}</span>}
                    {/* Chips im Stil des Stundenplans: Vertretung bernstein,
                        Ausfall leise grau mit rotem Punkt. */}
                    {l.status === "substituted" && (
                      <span className="inline-flex rounded bg-amber-500/20 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
                        Vertretung
                      </span>
                    )}
                    {l.status === "cancelled" && (
                      <span className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 text-[11px] font-medium text-muted-foreground">
                        <span aria-hidden="true" className="size-1 rounded-full bg-red-500/40" />
                        Entfällt
                      </span>
                    )}
                    {l.substitutionText && (
                      <span className="text-muted-foreground">{l.substitutionText}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Offen">
            {openAssignments.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nichts offen.</p>
            ) : (
              <>
                <AssignmentList
                  assignments={openAssignments.slice(0, 5)}
                  onChange={(next) =>
                    setData((prev) => {
                      if (!prev) return prev;
                      const oldSubset = prev.assignments.filter((a) => !a.completedAt).slice(0, 5);
                      return { ...prev, assignments: mergeAssignments(prev.assignments, oldSubset, next) };
                    })
                  }
                  grouped={false}
                  showSubject={false}
                  emptyLabel="Nichts offen."
                />
                {openAssignments.length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3"
                    onClick={() => switchTab("aufgaben")}
                  >
                    Alle {openAssignments.length} anzeigen
                  </Button>
                )}
              </>
            )}
          </Section>

          <Section title="Meldungen">
            <SubjectParticipation data={data.participation} />
          </Section>
        </div>
      </StaggerItem>

      {/* --- Noten --- */}
      <StaggerItem>
        <div
          id="fach-panel-noten"
          role="tabpanel"
          aria-labelledby="fach-tab-noten"
          hidden={tab !== "noten"}
        >
          <Section title="Noten">
            <SubjectGrades
              subjectId={subject.id}
              initialGrades={data.grades}
              initialOralWeight={subject.oralWeight}
              onChange={(grades) => setData((prev) => (prev ? { ...prev, grades } : prev))}
            />
          </Section>
        </div>
      </StaggerItem>

      {/* --- Aufgaben --- */}
      <StaggerItem>
        <div
          id="fach-panel-aufgaben"
          role="tabpanel"
          aria-labelledby="fach-tab-aufgaben"
          hidden={tab !== "aufgaben"}
        >
          <Section
            title="Aufgaben"
            // gap-2 statt gap-1: beide Buttons blaehen ihre Trefferflaeche
            // unsichtbar per before-Pseudo-Element auf (siehe ui/button.tsx),
            // bei zu wenig Abstand ueberlappen sich die beiden Zonen. Beide
            // Beschriftungen bewusst kurz gehalten -- der Section-Header
            // umbricht nicht, und "Aufgabe hinzufuegen" plus ein zweiter Button
            // sprengt auf schmalen Handys die Breite neben dem Titel.
            action={
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setExamComposing(true)}>
                  <GraduationCap className="size-4" />
                  Prüfung
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setComposing(true)}>
                  <Plus className="size-4" />
                  Aufgabe
                </Button>
              </div>
            }
          >
            <AssignmentList
              assignments={data.assignments}
              onChange={(next) => setData((prev) => (prev ? { ...prev, assignments: next } : prev))}
              grouped={false}
              showSubject={false}
              emptyLabel="Keine Aufgaben in diesem Fach."
            />
          </Section>
        </div>
      </StaggerItem>

      {/* --- Notizen --- */}
      <StaggerItem>
        <div
          id="fach-panel-notizen"
          role="tabpanel"
          aria-labelledby="fach-tab-notizen"
          hidden={tab !== "notizen"}
        >
          <Section title="Notizen">
            <SubjectNotes
              subjectId={subject.id}
              initialNotes={data.notes}
              lessonNotes={data.lessonNotes}
              onenoteReady={Boolean(microsoft?.connected && subject.onenoteSectionId)}
              onOpenLessonNote={(n) => {
                setNoteMeta({ date: n.date, startTime: n.startTime });
                setNoteTarget({
                  schoolBlockId: n.schoolBlockId,
                  subject: subject.name,
                  dayLabel: fmtLessonDate(n.date),
                  time: hm(n.startTime),
                  color: colorValue(subject.color),
                });
              }}
            />
          </Section>
        </div>
      </StaggerItem>

      {/* --- Material --- */}
      <StaggerItem>
        <div
          id="fach-panel-material"
          role="tabpanel"
          aria-labelledby="fach-tab-material"
          hidden={tab !== "material"}
          className="space-y-6"
        >
          <Section title="Lehrplan">
            <SubjectCurriculum
              subjectId={subject.id}
              subjectName={subject.name}
              initial={{
                curriculum: subject.curriculum,
                curriculumSource: subject.curriculumSource,
                curriculumUpdatedAt: subject.curriculumUpdatedAt,
              }}
            />
          </Section>

          <Section title="Dateien">
            <SubjectFiles subjectId={subject.id} />
          </Section>

          <Section title="OneNote">
            <SubjectOnenote
              subjectId={subject.id}
              status={microsoft}
              sectionId={subject.onenoteSectionId}
              sectionName={subject.onenoteSectionName}
              onChange={(next) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        subject: {
                          ...prev.subject,
                          onenoteSectionId: next.id,
                          onenoteSectionName: next.name,
                        },
                      }
                    : prev,
                )
              }
            />
          </Section>
        </div>
      </StaggerItem>

      <AssignmentComposer
        open={composing}
        onOpenChange={setComposing}
        subjects={[{ id: subject.id, name: subject.name, color: subject.color }]}
        initial={{ subjectId: subject.id }}
        onSaved={(a) =>
          setData((prev) => (prev ? { ...prev, assignments: [a, ...prev.assignments] } : prev))
        }
      />

      <ExamComposer
        open={examComposing}
        onOpenChange={setExamComposing}
        subjects={[{ id: subject.id, name: subject.name, color: subject.color }]}
        initialSubjectId={subject.id}
        existingExams={data.assignments.filter((a) => isExamPageType(a.type))}
        onSaved={(a) =>
          setData((prev) => (prev ? { ...prev, assignments: [a, ...prev.assignments] } : prev))
        }
      />

      {/* --- Stammdaten-Modal --- */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Fach bearbeiten">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium">Name</span>
            <input
              className={FIELD}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const v = name.trim();
                if (!v) {
                  setName(subject.name);
                  return;
                }
                if (v !== subject.name) void patch({ name: v });
              }}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium">Lehrer</span>
              {/* Untis kennt nur den Nachnamen, nicht das Geschlecht. Die
                  Anrede sitzt deshalb direkt am Feld statt in einer eigenen
                  Zeile -- sie ist Teil desselben Namens, keine zweite
                  Einstellung. */}
              <div className="flex gap-2">
                <TitlePicker
                  value={subject.teacherTitle}
                  onChange={(v) => void patch({ teacherTitle: v })}
                />
                <input
                  className={FIELD}
                  value={teacher}
                  placeholder="Nicht hinterlegt"
                  onChange={(e) => setTeacher(e.target.value)}
                  onBlur={() => {
                    const v = teacher.trim();
                    if (v !== (subject.teacher ?? "")) void patch({ teacher: v || null });
                  }}
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium">Raum</span>
              <input
                className={FIELD}
                value={room}
                placeholder="Nicht hinterlegt"
                onChange={(e) => setRoom(e.target.value)}
                onBlur={() => {
                  const v = room.trim();
                  if (v !== (subject.room ?? "")) void patch({ room: v || null });
                }}
              />
            </label>
          </div>
          <div>
            <span className="mb-1 block text-[13px] font-medium">Farbe</span>
            <ColorPicker
              value={subject.color}
              onChange={(token) => void patch({ color: token })}
              label="Farbe des Fachs"
            />
          </div>
          <p className="text-[12px] text-muted-foreground">
            Änderungen werden gespeichert, sobald du das Feld verlässt. Archivieren nimmt das Fach nur
            aus der Übersicht. Es taucht auch nach einem neuen Untis-Abgleich nicht wieder auf.
          </p>
        </div>
      </Modal>

      {/* Eigenes Bestaetigungs-Overlay statt window.confirm -- und es benennt
          ausdruecklich, was mitgeht und was bleibt. */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`„${subject.name}“ löschen?`}
        description="Das lässt sich nicht rückgängig machen."
      >
        <ul className="space-y-1.5 text-[13px] text-muted-foreground">
          <li>Die Notizen dieses Fachs werden mit gelöscht.</li>
          <li>Die Dateien dieses Fachs werden mit gelöscht.</li>
          <li>
            <span className="text-foreground">Die Aufgaben bleiben erhalten</span> und laufen danach
            unter „Allgemein“.
          </li>
        </ul>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Willst du das Fach nur aus der Übersicht nehmen, archivier es lieber.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Abbrechen
          </Button>
          <Button
            disabled={busy}
            onClick={() => void remove()}
            // Es gibt kein --destructive-foreground-Token: text-background traegt
            // in beiden Themes (helles Rot/dunkle Schrift bzw. umgekehrt).
            className="bg-destructive text-background hover:bg-destructive/90"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Endgültig löschen
          </Button>
        </div>
      </Modal>

      <LessonNoteEditor
        target={noteTarget}
        onClose={() => setNoteTarget(null)}
        onSaved={(schoolBlockId, hasNote, body) =>
          setData((prev) => {
            if (!prev) return prev;
            if (!hasNote) {
              // Leer gespeichert -> aus der Chronik raus.
              return { ...prev, lessonNotes: prev.lessonNotes.filter((n) => n.schoolBlockId !== schoolBlockId) };
            }
            const exists = prev.lessonNotes.some((n) => n.schoolBlockId === schoolBlockId);
            if (exists) {
              // Nur den Text aktualisieren, die Reihenfolge (Datum) aendert
              // sich durch eine Bearbeitung nicht.
              return {
                ...prev,
                lessonNotes: prev.lessonNotes.map((n) => (n.schoolBlockId === schoolBlockId ? { ...n, body } : n)),
              };
            }
            // War vorher leer und ist im selben geoeffneten Overlay wieder
            // beschrieben worden -- der Eintrag fehlt noch in der Liste
            // (onSaved mit hasNote=false hat ihn rausgefiltert). noteMeta
            // traegt date/startTime derselben Stunde, die aendern sich beim
            // erneuten Speichern nicht.
            if (!noteMeta) return prev;
            const entry: LessonNoteEntryDTO = {
              id: schoolBlockId,
              schoolBlockId,
              date: noteMeta.date,
              startTime: noteMeta.startTime,
              body,
              updatedAt: new Date().toISOString(),
            };
            return { ...prev, lessonNotes: [...prev.lessonNotes, entry].sort(byLessonDateDesc) };
          })
        }
      />
    </Shell>
  );
}

// "04.09.2026" fuer die Herkunftszeile -- curriculumUpdatedAt kommt als ISO
// mit Uhrzeit, die Uhrzeit interessiert bei einem Lehrplan nicht.
function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type CurriculumState = {
  curriculum: string | null;
  curriculumSource: string | null;
  curriculumUpdatedAt: string | null;
};

function SubjectCurriculum({
  subjectId,
  subjectName,
  initial,
}: {
  subjectId: string;
  subjectName: string;
  initial: CurriculumState;
}) {
  const toast = useToast();
  const [data, setData] = useState<CurriculumState>(initial);
  // undefined = noch nicht bekannt, null = die Vorlage kennt dieses Fach nicht.
  // Solange es unbekannt ist, wird kein Knopf angeboten, der ins Leere liefe.
  const [vorlage, setVorlage] = useState<{ fach: string } | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let abgebrochen = false;
    void (async () => {
      try {
        const res = await fetch(`/api/subjects/${subjectId}/curriculum`);
        if (!res.ok) return;
        const json = (await res.json()) as CurriculumState & { vorlage: { fach: string } | null };
        if (abgebrochen) return;
        setVorlage(json.vorlage);
        setData({
          curriculum: json.curriculum,
          curriculumSource: json.curriculumSource,
          curriculumUpdatedAt: json.curriculumUpdatedAt,
        });
      } catch {
        // Der Abschnitt zeigt weiter den Stand aus dem Fach-Payload -- nur die
        // Knoepfe fehlen, weil unbekannt bleibt, ob es eine Vorlage gibt.
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [subjectId]);

  const html = useMemo(
    () => (data.curriculum ? renderMarkdown(data.curriculum) : ""),
    [data.curriculum],
  );

  async function speichern(body: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/curriculum`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Speichern fehlgeschlagen");
      setData(json as CurriculumState);
      setEditing(false);
    } catch (e) {
      toast((e as Error).message || "Der Lehrplan konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function ausVorlage() {
    setBusy(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/curriculum/seed`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Das hat nicht geklappt");
      setData(json as CurriculumState);
      setEditing(false);
      setConfirmReset(false);
    } catch (e) {
      toast((e as Error).message || "Der Kernlehrplan konnte nicht geladen werden.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={14}
          placeholder={"## Inhaltsfeld\n- Schwerpunkt\n**fett**, [Link](https://…)"}
          className="min-h-[260px] w-full resize-y rounded-lg border bg-background px-3 py-2.5 font-mono text-[16px] leading-relaxed outline-none transition-[border-color,box-shadow] duration-150 ease-[var(--ease-atlas)] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [touch-action:manipulation]"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
            Abbrechen
          </Button>
          <Button disabled={busy} onClick={() => void speichern(draft)}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Speichern
          </Button>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Markdown wird unterstützt. Ein leerer Text löscht den Lehrplan.
        </p>
      </div>
    );
  }

  if (!data.curriculum) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-muted-foreground">
          {vorlage === null
            ? `Für „${subjectName}“ kennt der Kernlehrplan NRW keine Vorlage. Du kannst den Lehrplan selbst eintragen.`
            : "Noch kein Lehrplan hinterlegt."}
        </p>
        <div className="flex flex-wrap gap-2">
          {vorlage && (
            <Button variant="outline" disabled={busy} onClick={() => void ausVorlage()}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Aus dem Kernlehrplan NRW füllen
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setDraft("");
              setEditing(true);
            }}
          >
            <Pencil className="size-4" />
            Selbst schreiben
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={PROSE} dangerouslySetInnerHTML={{ __html: html }} />
      {(data.curriculumSource || data.curriculumUpdatedAt) && (
        <p className="mt-4 text-[12px] text-muted-foreground">
          {[data.curriculumSource, data.curriculumUpdatedAt ? fmtStamp(data.curriculumUpdatedAt) : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setDraft(data.curriculum ?? "");
            setEditing(true);
          }}
        >
          <Pencil className="size-4" />
          Bearbeiten
        </Button>
        {vorlage && (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmReset(true)}>
            <RotateCcw className="size-4" />
            Auf den Kernlehrplan zurücksetzen
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void speichern("")}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
          Löschen
        </Button>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Auf den Kernlehrplan zurücksetzen?"
        description="Der jetzige Text wird dabei überschrieben."
      >
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Abbrechen
          </Button>
          <Button disabled={busy} onClick={() => void ausVorlage()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Zurücksetzen
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function SubjectDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Fach wird geladen" aria-busy="true">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-16" />
        </div>
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
      {["Übersicht", "Aufgaben"].map((title) => (
        <section key={title} className="overflow-hidden rounded-2xl border bg-card shadow-card">
          <div className="border-b bg-muted/30 px-5 py-3">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex flex-col gap-3 px-5 py-5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </section>
      ))}
    </div>
  );
}

// Gleicher scrollbarer Container wie /settings: die Layout-Hoehe ist fix.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="h-full overflow-y-auto px-6 pt-6 pb-8 lg:px-8">
      <Stagger className="mx-auto max-w-3xl space-y-6">{children}</Stagger>
    </main>
  );
}
