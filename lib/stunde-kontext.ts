// Das Stunden-Cockpit: reine Berechnung, egal ob gerade eine Stunde laeuft,
// Pause ist, vor/nach der Schule oder gar kein Unterricht heute ansteht
// (siehe lib/jetzt-stunde.ts: cockpitMode). Ohne blockId folgt die Auswahl
// automatisch der Uhrzeit (defaultLesson); mit blockId bleibt eine einmal
// gewaehlte Stunde beim naechsten Laden stehen.
//
// Ausgelagert aus app/api/stunde/route.ts, damit auch der Bot (lib/bot/tools.ts,
// lib/bot/context.ts) dieselbe Berechnung nutzen kann, ohne intern die eigene
// API-Route aufzurufen.

import { expandDay } from "@/lib/calendar-expand";
import { listAssignments } from "@/lib/assignment-store";
import { listSubjects, type SubjectDTO } from "@/lib/subject-store";
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
import { lernenFuerTag, type LernenFuerTagEintrag } from "@/lib/lernplan-store";

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
  // Offene Aufgaben des Fachs ohne Faelligkeit (nie Pruefungen).
  ohneTermin: AssignmentDTO[];
  demnaechst: AssignmentDTO[];
  naechstePruefung: { id: string; title: string; type: string; dueDate: string; tageBis: number } | null;
  letzteNotiz: { date: string; startTime: string; body: string } | null;
  naechsterTermin: string | null;
  lernen: LernenFuerTagEintrag[];
};

// blockId: optional, muss vom Aufrufer schon als gueltige uuid geprueft sein
// (siehe app/api/stunde/route.ts) -- hier keine erneute Validierung.
export async function ladeStundeKontext(blockId?: string | null): Promise<StundeResponse> {
  const today = lokalesDatum();
  const nowHM = lokaleUhrzeit();

  const [day, subjects, lernen] = await Promise.all([
    expandDay(today).then((r) => r.days[0]),
    listSubjects("active"),
    lernenFuerTag(today),
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

  const fromBlock = blockId ? tag.find((ev) => ev.refId === blockId) : undefined;
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
  let ohneTermin: AssignmentDTO[] = [];
  let demnaechst: AssignmentDTO[] = [];
  let naechstePruefung: StundeResponse["naechstePruefung"] = null;
  let letzteNotiz: StundeResponse["letzteNotiz"] = null;
  let naechsterTermin: string | null = null;

  // Alle offenen Aufgaben einmal laden: die des Fachs UND die ohne Fach
  // ("Allgemein", z.B. Sportzeug mitbringen). Letztere haengen an keiner
  // Stunde und wuerden im Cockpit sonst nie auftauchen, obwohl sie heute
  // faellig sind.
  const alleOffenen = selected ? await listAssignments({ includeCompleted: false }) : [];
  const allgemeinFaellig = alleOffenen.filter(
    (a) => a.subjectId === null && a.dueDate !== null && a.dueDate <= today && !isExamPageType(a.type),
  );

  if (selected?.subjectId) {
    const subject = subjects.find((s) => s.id === selected.subjectId)!;

    const [notes, termin] = await Promise.all([
      listSubjectLessonNotes({ id: subject.id, untisSubject: subject.untisSubject, name: subject.name }),
      findNextLessonDate(selected.refId),
    ]);
    const open = alleOffenen.filter((a) => a.subjectId === subject.id);

    // "Faellig jetzt" sind Hausaufgaben, die abgehakt werden koennen. Eine
    // Pruefung hakt man nicht ab -- sie steht als Zeile im Kopf (naechstePruefung),
    // sonst stuende dieselbe Arbeit zweimal auf der Seite.
    faellig = open.filter((a) => a.dueDate !== null && a.dueDate <= today && !isExamPageType(a.type));
    // Offen, aber ohne Termin: gehoert trotzdem zu diesem Fach und wird am
    // ehesten hier erledigt.
    ohneTermin = open.filter((a) => a.dueDate === null && !isExamPageType(a.type));
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

  // Fachlose faellige Aufgaben immer dazu, egal welche Stunde gewaehlt ist --
  // ueberfaelliges zuerst, dann nach Datum.
  faellig = [...faellig, ...allgemeinFaellig].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  return {
    today,
    nowHM,
    modus,
    tag,
    liveRefId,
    selected,
    faellig,
    ohneTermin,
    demnaechst,
    naechstePruefung,
    letzteNotiz,
    naechsterTermin,
    lernen,
  };
}
