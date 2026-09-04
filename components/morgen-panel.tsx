"use client";

// Der Fokus: ein Blick, der die Abend-Frage beantwortet -- was steht an, was
// muss ich noch machen und mitnehmen. Frueher die eigene Seite /morgen, jetzt
// die Standard-Ansicht des Stundenplans neben der Woche. Welcher Tag gemeint
// ist, entscheidet die API (heute, solange heute noch Unterricht laeuft oder
// ansteht, sonst morgen bzw. der naechste Schultag) -- die UI hat bewusst
// keinen Heute/Morgen-Schalter mehr.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  FileText,
  GraduationCap,
  MapPin,
  NotebookPen,
  PartyPopper,
  Presentation,
  User,
} from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignmentList } from "@/components/assignment-list";
import { useToast } from "@/components/toast";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import { TYPE_LABEL, weekdayDateLabel, type AssignmentDTO, type AssignmentType } from "@/lib/assignments-view";
import { cn } from "@/lib/utils";
import type { LiveLessonDTO, MaterialDTO, MorgenLessonDTO } from "@/app/api/morgen/route";

type MorgenResponse = {
  today: string;
  target: { date: string; isTomorrow: boolean; label: string };
  live: LiveLessonDTO | null;
  day: { date: string; weekday: number; events: MorgenLessonDTO[] } | null;
  due: AssignmentDTO[];
  exams: AssignmentDTO[];
  materials: MaterialDTO[];
};

const TYPE_ICON: Record<AssignmentType, typeof GraduationCap> = {
  homework: GraduationCap,
  exam: GraduationCap,
  test: GraduationCap,
  presentation: Presentation,
  other: GraduationCap,
};

export function MorgenPanel() {
  const toast = useToast();
  const [data, setData] = useState<MorgenResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/morgen");
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      setData((await res.json()) as MorgenResponse);
    } catch {
      setFailed(true);
      toast("Die Fokus-Ansicht konnte nicht geladen werden.");
    }
  }, [toast]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  return (
    <Stagger className="mx-auto max-w-2xl space-y-6">
      <StaggerItem>
        <div>
          <h1 className="text-xl font-semibold leading-tight tracking-tight">
            {data ? data.target.label : "Fokus"}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data ? subtitleFor(data) : "Wird geladen …"}
          </p>
        </div>
      </StaggerItem>

      {failed ? (
        <StaggerItem>
          <div className="rounded-xl border bg-card px-4 py-6 text-center shadow-card">
            <p className="text-[14px] text-muted-foreground">Das hat nicht geklappt.</p>
            <button
              type="button"
              className="mt-3 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent"
              onClick={() => void load()}
            >
              Erneut versuchen
            </button>
          </div>
        </StaggerItem>
      ) : data === null ? (
        <StaggerItem>
          <PageSkeleton />
        </StaggerItem>
      ) : (
        <Body data={data} />
      )}
    </Stagger>
  );
}

function subtitleFor(data: MorgenResponse): string {
  const dateLabel = weekdayDateLabel(data.target.date).replace(/^\w+\.,\s*/, "");
  if (data.target.date === data.today) return `Heute, ${dateLabel}`;
  if (data.target.isTomorrow) return `Morgen, ${dateLabel}`;
  return "Morgen ist schulfrei. Hier der nächste Schultag:";
}

// --- Inhalt --------------------------------------------------------------------

function Body({ data }: { data: MorgenResponse }) {
  const [due, setDue] = useState(data.due);
  useEffect(() => setDue(data.due), [data]);

  const isEmpty =
    (data.day?.events.length ?? 0) === 0 && due.length === 0 && data.exams.length === 0;

  if (isEmpty) {
    return (
      <StaggerItem>
        <EmptyState />
      </StaggerItem>
    );
  }

  return (
    <>
      {data.live && (
        <StaggerItem>
          <LiveCard live={data.live} />
        </StaggerItem>
      )}

      {data.exams.length > 0 && (
        <StaggerItem>
          <div className="flex flex-col gap-3">
            {data.exams.map((exam) => (
              <ExamCard key={exam.id} exam={exam} />
            ))}
          </div>
        </StaggerItem>
      )}

      {data.day && data.day.events.length > 0 && (
        <StaggerItem>
          <Section title="Stunden">
            <ol className="flex flex-col gap-1.5">
              {data.day.events.map((ev) => (
                <LessonRow key={ev.refId} ev={ev} live={ev.refId === data.live?.refId} />
              ))}
            </ol>
          </Section>
        </StaggerItem>
      )}

      {due.length > 0 && (
        <StaggerItem>
          <Section title="Zu erledigen">
            <AssignmentList assignments={due} onChange={setDue} emptyLabel="Nichts offen." />
          </Section>
        </StaggerItem>
      )}

      {data.materials.length > 0 && (
        <StaggerItem>
          <Section title="Mitzunehmen">
            <div className="flex flex-col gap-3">
              {data.materials.map((m) => (
                <MaterialCard key={m.subjectId} material={m} />
              ))}
            </div>
          </Section>
        </StaggerItem>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

// --- Pruefung, gross oben -------------------------------------------------------

function ExamCard({ exam }: { exam: AssignmentDTO }) {
  const tint = exam.subjectId ? colorValue(exam.subjectColor) : NEUTRAL_COLOR;
  const Icon = TYPE_ICON[exam.type];

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
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Icon className="size-3.5" strokeWidth={2.25} />
            {TYPE_LABEL[exam.type]} steht an
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold leading-snug">{exam.title}</h2>
          <p className="mt-1 truncate text-[13px] text-muted-foreground">
            {exam.subjectName ?? "Allgemein"}
          </p>
        </div>
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

// --- Laeuft gerade ---------------------------------------------------------------

// Ganz oben im Body, sobald eine Stunde laeuft: der kurze Verweis auf das
// Stunden-Cockpit (/stunde), das den vollen Erfassungs-Flow traegt -- der
// Fokus selbst zeigt nur noch, DASS gerade Unterricht ist.
function LiveCard({ live }: { live: LiveLessonDTO }) {
  const tint = live.subjectId ? colorValue(live.subjectColor) : NEUTRAL_COLOR;

  return (
    <Link
      href="/stunde"
      className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-card transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span aria-hidden className="size-2.5 shrink-0 rounded-full motion-safe:animate-pulse" style={{ backgroundColor: tint }} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: tint }}>
          Läuft gerade · noch {live.minutesLeft} min
        </p>
        <p className="mt-0.5 truncate text-[15px] font-medium leading-snug">{live.title}</p>
      </div>
      <span className="shrink-0 rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors group-hover:bg-accent">
        Zum Cockpit
      </span>
    </Link>
  );
}

// --- Stunden -------------------------------------------------------------------

// live: diese Stunde laeuft gerade. Sie bleibt ganz normal Teil der Liste,
// traegt aber einen sichtbaren Marker -- und fuehrt ins Stunden-Cockpit
// (/stunde), nicht ins Fach.
function LessonRow({ ev, live = false }: { ev: MorgenLessonDTO; live?: boolean }) {
  const tint = ev.subjectId ? colorValue(ev.subjectColor) : NEUTRAL_COLOR;
  const cancelled = ev.status === "cancelled";

  const inner = (
    <>
      <div className="w-11 shrink-0 text-right text-[12.5px] tabular-nums text-muted-foreground">
        {ev.startTime}
      </div>
      <span aria-hidden className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("truncate text-[14px] font-medium leading-snug", cancelled && "text-muted-foreground line-through decoration-foreground/30")}>
            {ev.title}
          </span>
          {live && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[11px] font-semibold"
              style={{ color: tint, borderColor: tint }}
            >
              <span
                aria-hidden
                className="size-1 rounded-full motion-safe:animate-pulse"
                style={{ backgroundColor: tint }}
              />
              läuft
            </span>
          )}
          {cancelled && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-1.5 py-px text-[11px] font-medium text-muted-foreground">
              <span className="size-1 rounded-full bg-destructive/60" />
              entfällt
            </span>
          )}
          {ev.status === "substituted" && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/20 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
              Vertretung
            </span>
          )}
        </div>
        {!cancelled && (ev.room || ev.teacher) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground">
            {ev.room && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" strokeWidth={2.25} />
                {ev.room}
              </span>
            )}
            {ev.teacher && (
              <span className="inline-flex items-center gap-1">
                <User className="size-3" strokeWidth={2.25} />
                {ev.teacher}
              </span>
            )}
          </div>
        )}
      </div>
      {/* Ein Chevron pro Zeile rauscht beim Scannen -- sechs identische Pfeile
          sagen sechsmal dasselbe. Die Klickbarkeit bleibt (ganze Zeile + Hover-
          Flaeche), der Pfeil erscheint nur als Bestaetigung bei Hover und
          Tastaturfokus. Opacity statt Conditional-Rendering, damit die Zeilen
          nicht um ein paar Pixel springen. Touch bekommt dafuer ein
          Press-Feedback (active:bg, siehe className unten). */}
      {ev.subjectId ? (
        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100" />
      ) : (
        <span aria-hidden className="size-4 shrink-0" />
      )}
    </>
  );

  const className =
    "group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors [touch-action:manipulation] hover:bg-accent/40 active:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <li>
      {live ? (
        // Die laufende Stunde fuehrt bewusst NICHT ins Fach: sie fuehrt ins
        // Stunden-Cockpit, in dem der ganze Erfassungs-Flow dieser Stunde
        // lebt. Das Fach bleibt von dort aus ueber den Datei-Bereich erreichbar.
        <Link href="/stunde" className={className}>
          {inner}
        </Link>
      ) : ev.subjectId ? (
        <Link href={`/faecher/${ev.subjectId}`} className={className}>
          {inner}
        </Link>
      ) : (
        <div className={cn(className, "hover:bg-transparent active:bg-transparent")}>{inner}</div>
      )}
    </li>
  );
}

// --- Mitzunehmen -----------------------------------------------------------------

function MaterialCard({ material }: { material: MaterialDTO }) {
  const tint = colorValue(material.subjectColor);
  const nothing = material.files.length === 0 && material.notes.length === 0;

  return (
    <Link
      href={`/faecher/${material.subjectId}`}
      className="group block rounded-xl border bg-card px-3.5 py-3 shadow-card transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{material.subjectName}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      {nothing ? (
        <p className="mt-1 pl-4 text-[12.5px] text-muted-foreground">
          Keine Dateien oder Notizen hinterlegt.
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1 pl-4">
          {material.files.map((f) => (
            <li key={f.id} className="flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
              <FileText className="size-3.5 shrink-0" strokeWidth={2.25} />
              <span className="truncate">{f.name}</span>
            </li>
          ))}
          {material.notes.map((n) => (
            <li key={n.id} className="flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
              <NotebookPen className="size-3.5 shrink-0" strokeWidth={2.25} />
              <span className="truncate">{n.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}

// --- Leerzustand -----------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
      <PartyPopper className="size-6 text-muted-foreground/60" />
      <div>
        <p className="text-[15px] font-medium">Nichts los.</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Keine Schulstunden, keine Aufgabe fällig, keine Prüfung in Sicht.
        </p>
      </div>
    </div>
  );
}

// --- Ladezustand -----------------------------------------------------------------

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Wird geladen" aria-busy="true">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="mx-1 h-3 w-20" />
        <ul className="flex flex-col gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-2">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="size-2 shrink-0 rounded-full" />
              <span className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5" style={{ width: `${56 - i * 6}%` }} />
                <Skeleton className="h-3 w-28 opacity-70" />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="mx-1 h-3 w-24" />
        <ul className="flex flex-col gap-1">
          {[1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3.5 px-2.5 py-3">
              <Skeleton className="size-[22px] shrink-0 rounded-full" />
              <span className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5" style={{ width: `${52 - i * 8}%` }} />
                <Skeleton className="h-3 w-24 opacity-70" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
