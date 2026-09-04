import { NextResponse } from "next/server";
import { expandDay, expandRange, isRealDate } from "@/lib/calendar-expand";
import { listAssignments } from "@/lib/assignment-store";
import { listSubjects, listNotes, type SubjectDTO } from "@/lib/subject-store";
import { listFiles, type FileDTO } from "@/lib/subject-file-store";
import { dueUntilTarget, examsOnTarget, pickFocusDay, targetDayLabel } from "@/lib/morgen-view";
import { addDays } from "@/lib/assignments-view";
import { lokalesDatum as heuteLokal, lokaleUhrzeit as jetztLokal, minutesLeft, pickLiveLesson } from "@/lib/jetzt-stunde";
import { lernenFuerTag, type LernenFuerTagEintrag } from "@/lib/lernplan-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Wie weit die Suche nach dem naechsten Schultag vorausschaut. 14 Tage decken
// jede normale Ferienwoche ab, ohne bei laengeren Ferien (Sommer) endlos in
// eine Zukunft zu suchen, fuer die noch gar kein Plan importiert ist.
const LOOKAHEAD_DAYS = 14;

// Fach zur Schulstunde: identische Regel wie in app/page.tsx (subjectFor) --
// erst der exakte Untis-Wert, sonst der Anzeigename. school_blocks.subject ist
// beim Import bereits normalisiert (siehe lib/untis/adapter.ts), Events tragen
// also denselben Wert wie subjects.untisSubject.
function subjectFor(subjects: SubjectDTO[], title: string): SubjectDTO | null {
  return subjects.find((s) => s.untisSubject === title) ?? subjects.find((s) => s.name === title) ?? null;
}

export type MaterialDTO = {
  subjectId: string;
  subjectName: string;
  subjectColor: string | null;
  files: FileDTO[];
  notes: { id: string; title: string }[];
};

// Eine Schulstunde des Zieltags, angereichert um das aufgeloeste Fach --
// die Seite braucht subjectId, um von der Stunde ins Fach zu verlinken.
export type MorgenLessonDTO = {
  refId: string;
  startTime: string;
  endTime: string | null;
  title: string;
  status: "regular" | "cancelled" | "substituted";
  room: string | null;
  teacher: string | null;
  hasNote: boolean;
  hasAssignment: boolean;
  subjectId: string | null;
  subjectColor: string | null;
};

// Die Stunde, die JETZT gerade laeuft -- Grundlage des Vollbild-Stundenmodus
// im Fokus. endTime ist hier nicht mehr optional: ohne Endzeit laesst sich
// gar nicht sagen, dass etwas noch laeuft (siehe lib/jetzt-stunde.ts).
export type LiveLessonDTO = MorgenLessonDTO & { endTime: string; minutesLeft: number };

// GET /api/morgen?date=JJJJ-MM-TT
//
// Ohne date: rechnet den Fokus-Zieltag selbst aus -- heute, solange heute noch
// Unterricht laeuft oder ansteht, sonst morgen oder der naechste Schultag
// danach. Mit date: liefert genau diesen Tag (fuer Tests und Debug) -- die
// UI selbst hat bewusst keinen Heute/Morgen-Schalter mehr.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const forcedDate = url.searchParams.get("date");
  if (forcedDate !== null && (!DATE_RE.test(forcedDate) || !isRealDate(forcedDate))) {
    return NextResponse.json(
      { error: "date muss ein gueltiges Datum im Format JJJJ-MM-TT sein." },
      { status: 400 },
    );
  }

  const today = heuteLokal();

  // Fuer die automatische Zieltagsuche wird das Suchfenster einmal am Stueck
  // geholt (nicht Tag fuer Tag): eine Anfrage statt bis zu 14.
  const lookahead = forcedDate
    ? null
    : await expandRange(today, addDaysISO(today, LOOKAHEAD_DAYS));
  const hasLessons = (dateISO: string) =>
    (lookahead?.days.find((d) => d.date === dateISO)?.events.length ?? 0) > 0;

  const target = forcedDate
    ? { date: forcedDate, isTomorrow: forcedDate === addDaysISO(today, 1) }
    : pickFocusDay(today, hasLessons, todayRemaining(today, lookahead), LOOKAHEAD_DAYS);

  // Der Tag selbst: aus dem schon geladenen Suchfenster wiederverwenden, wenn
  // moeglich, sonst (erzwungenes date ausserhalb des Fensters, z.B. "heute")
  // einzeln nachladen.
  const dayFromLookahead = lookahead?.days.find((d) => d.date === target.date);
  const day = dayFromLookahead ?? (await expandDay(target.date)).days[0];

  const [assignments, subjects] = await Promise.all([
    listAssignments({ includeCompleted: false }),
    listSubjects("active"),
  ]);

  const due = dueUntilTarget(assignments, target.date, today);
  const exams = examsOnTarget(assignments, target.date);

  // Stunden mit aufgeloestem Fach, fuer den Link von der Stunde ins Fach.
  const events: MorgenLessonDTO[] = (day?.events ?? []).map((ev) => {
    const s = subjectFor(subjects, ev.title);
    return {
      refId: ev.refId,
      startTime: ev.startTime,
      endTime: ev.endTime,
      title: ev.title,
      status: ev.status,
      room: ev.room,
      teacher: ev.teacher,
      hasNote: ev.hasNote,
      hasAssignment: ev.hasAssignment,
      subjectId: s?.id ?? null,
      subjectColor: s?.color ?? null,
    };
  });

  // Faecher des Tages, ohne Duplikate (Doppelstunden desselben Fachs zaehlen
  // einmal). Nur Faecher mit Treffer -- Atlas kennt keine Untis-Kuerzel ohne
  // Fach dahinter, dafuer braucht es keinen Platzhalter.
  // Entfallene Stunden zaehlen nicht: fuer eine Stunde, die nicht stattfindet,
  // muss niemand etwas einpacken.
  const subjectIds = new Set<string>();
  for (const ev of events) {
    if (ev.subjectId && ev.status !== "cancelled") subjectIds.add(ev.subjectId);
  }
  const materials: MaterialDTO[] = await Promise.all(
    [...subjectIds].map(async (id) => {
      const subject = subjects.find((s) => s.id === id)!;
      const [files, notes] = await Promise.all([listFiles(id), listNotes(id)]);
      return {
        subjectId: id,
        subjectName: subject.name,
        subjectColor: subject.color,
        files,
        notes: notes.map((n) => ({ id: n.id, title: n.title })),
      };
    }),
  );

  // Der Vollbild-Stundenmodus gilt nur fuer das echte Jetzt: ein erzwungenes
  // ?date= ist eine Nachschau (Test, Debug, kuenftiger Tag) und darf nie eine
  // laufende Stunde behaupten -- auch dann nicht, wenn zufaellig das heutige
  // Datum uebergeben wurde.
  const live: LiveLessonDTO | null = (() => {
    if (forcedDate || target.date !== today) return null;
    const nowHM = jetztLokal();
    const hit = pickLiveLesson(events, nowHM);
    if (!hit || hit.endTime === null) return null;
    return { ...hit, endTime: hit.endTime, minutesLeft: minutesLeft(hit.endTime, nowHM) };
  })();

  const lernen: LernenFuerTagEintrag[] = await lernenFuerTag(target.date);

  return NextResponse.json({
    today,
    target: { date: target.date, isTomorrow: target.isTomorrow, label: targetDayLabel(target, today) },
    live,
    day: day ? { date: day.date, weekday: day.weekday, events } : null,
    due,
    exams,
    materials,
    lernen,
  });
}

function addDaysISO(iso: string, n: number): string {
  return addDays(iso, n);
}

// Heute steht noch etwas an, solange mindestens eine nicht-entfallene Stunde
// nach Jetzt endet (HH:MM vergleicht sich lexikographisch). Entfallene und
// stundenlose Tage zaehlen nicht -- abends und am Wochenende zeigt der Fokus
// ehrlich den naechsten Schultag statt ein leeres Heute.
function todayRemaining(
  today: string,
  lookahead: { days: { date: string; events: { status: string; endTime: string | null }[] }[] } | null,
): boolean {
  if (!lookahead) return false;
  const events = lookahead.days.find((d) => d.date === today)?.events ?? [];
  const nowHM = jetztLokal();
  return events.some(
    (ev) => ev.status !== "cancelled" && typeof ev.endTime === "string" && ev.endTime > nowHM,
  );
}
