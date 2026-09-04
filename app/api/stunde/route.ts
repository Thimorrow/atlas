import { NextResponse } from "next/server";
import { expandDay } from "@/lib/calendar-expand";
import { listAssignments } from "@/lib/assignment-store";
import { listSubjects, isUuid, type SubjectDTO } from "@/lib/subject-store";
import { listSubjectLessonNotes } from "@/lib/lesson-notes";
import { findNextLessonDate } from "@/lib/next-lesson";
import {
  cockpitMode,
  defaultLesson,
  lessonProgress,
  lokalesDatum,
  lokaleUhrzeit,
  minutesLeft,
  minutesUntil,
  pickLiveLesson,
} from "@/lib/jetzt-stunde";
import { isExamPageType, type AssignmentDTO } from "@/lib/assignments-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fach zur Schulstunde: identische Regel wie in app/api/morgen/route.ts.
function subjectFor(subjects: SubjectDTO[], title: string): SubjectDTO | null {
  return subjects.find((s) => s.untisSubject === title) ?? subjects.find((s) => s.name === title) ?? null;
}

export type StundeLessonDTO = {
  refId: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  status: "regular" | "cancelled" | "substituted";
  room: string | null;
  teacher: string | null;
  subjectId: string | null;
  subjectColor: string | null;
  subjectName: string | null;
  hasNote: boolean;
  hasAssignment: boolean;
};

export type StundeResponse = {
  today: string;
  nowHM: string;
  modus: "live" | "pause" | "vor" | "nach" | "frei";
  tag: StundeLessonDTO[];
  liveRefId: string | null;
  selected: (StundeLessonDTO & { minutesLeft: number; minutesUntil: number; progress: number }) | null;
  faellig: AssignmentDTO[];
  demnaechst: AssignmentDTO[];
  naechstePruefung: { id: string; title: string; type: string; dueDate: string; tageBis: number } | null;
  letzteNotiz: { date: string; startTime: string; body: string } | null;
  naechsterTermin: string | null;
};

// GET /api/stunde?block=<schoolBlockId optional>
//
// Das Stunden-Cockpit: immer nutzbar, egal ob gerade eine Stunde laeuft,
// Pause ist, vor/nach der Schule oder gar kein Unterricht heute ansteht
// (siehe lib/jetzt-stunde.ts: cockpitMode). Ohne ?block folgt die Auswahl
// automatisch der Uhrzeit (defaultLesson); mit ?block bleibt eine einmal
// gewaehlte Stunde beim naechsten Laden stehen.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const blockParam = url.searchParams.get("block");
  if (blockParam !== null && !isUuid(blockParam)) {
    return NextResponse.json({ error: "block ist keine gueltige id." }, { status: 400 });
  }

  const today = lokalesDatum();
  const nowHM = lokaleUhrzeit();

  const [day, subjects] = await Promise.all([
    expandDay(today).then((r) => r.days[0]),
    listSubjects("active"),
  ]);

  const tag: StundeLessonDTO[] = (day?.events ?? []).map((ev) => {
    const s = subjectFor(subjects, ev.title);
    return {
      refId: ev.refId,
      date: today,
      startTime: ev.startTime,
      endTime: ev.endTime,
      title: ev.title,
      status: ev.status,
      room: ev.room,
      teacher: ev.teacher,
      subjectId: s?.id ?? null,
      subjectColor: s?.color ?? null,
      subjectName: s?.name ?? null,
      hasNote: ev.hasNote,
      hasAssignment: ev.hasAssignment,
    };
  });

  const modus = cockpitMode(tag, nowHM);
  const liveRefId = pickLiveLesson(tag, nowHM)?.refId ?? null;

  const fromBlock = blockParam ? tag.find((ev) => ev.refId === blockParam) : undefined;
  const selectedBase = fromBlock ?? defaultLesson(tag, nowHM);

  const selected: StundeResponse["selected"] = selectedBase
    ? {
        ...selectedBase,
        minutesLeft: selectedBase.endTime ? minutesLeft(selectedBase.endTime, nowHM) : 0,
        minutesUntil: minutesUntil(selectedBase.startTime, nowHM),
        progress: selectedBase.endTime ? lessonProgress(selectedBase.startTime, selectedBase.endTime, nowHM) : 0,
      }
    : null;

  let faellig: AssignmentDTO[] = [];
  let demnaechst: AssignmentDTO[] = [];
  let naechstePruefung: StundeResponse["naechstePruefung"] = null;
  let letzteNotiz: StundeResponse["letzteNotiz"] = null;
  let naechsterTermin: string | null = null;

  if (selected?.subjectId) {
    const subject = subjects.find((s) => s.id === selected.subjectId)!;

    const [open, notes, termin] = await Promise.all([
      listAssignments({ includeCompleted: false, subjectId: subject.id }),
      listSubjectLessonNotes({ id: subject.id, untisSubject: subject.untisSubject, name: subject.name }),
      findNextLessonDate(selected.refId),
    ]);

    faellig = open.filter((a) => a.dueDate !== null && a.dueDate <= today);
    demnaechst = open
      .filter((a) => a.dueDate !== null && a.dueDate > today)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
      .slice(0, 5);

    const exam = open
      .filter((a) => isExamPageType(a.type) && a.dueDate !== null && a.dueDate >= today)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];
    if (exam?.dueDate) {
      const tageBis = Math.round(
        (new Date(`${exam.dueDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
      );
      naechstePruefung = { id: exam.id, title: exam.title, type: exam.type, dueDate: exam.dueDate, tageBis };
    }

    // Juengste Stundennotiz VOR dem gewaehlten Block: an einem frueheren Tag,
    // oder am gleichen Tag mit frueherer Startzeit -- listSubjectLessonNotes
    // liefert schon absteigend sortiert (Datum, dann Startzeit), der erste
    // Treffer ist deshalb der juengste.
    const before = notes.find(
      (n) => n.date < today || (n.date === today && n.startTime < selected.startTime),
    );
    if (before) letzteNotiz = { date: before.date, startTime: before.startTime, body: before.body };

    naechsterTermin = termin;
  }

  return NextResponse.json({
    today,
    nowHM,
    modus,
    tag,
    liveRefId,
    selected,
    faellig,
    demnaechst,
    naechstePruefung,
    letzteNotiz,
    naechsterTermin,
  } satisfies StundeResponse);
}
