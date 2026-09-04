// Reine Logik fuer die Morgen-Ansicht (/morgen): welcher Tag ist gemeint, und
// was von den offenen Aufgaben gehoert dorthin. Bewusst ohne DB-Import, damit
// sie ohne Datenbank testbar ist -- gleiches Muster wie lib/assignments-view.ts.

import {
  addDays,
  compareInGroup,
  isExamPageType,
  localISO,
  type AssignmentDTO,
} from "@/lib/assignments-view";

// --- Zieltag -------------------------------------------------------------

export type TargetDay = {
  date: string; // YYYY-MM-DD
  isTomorrow: boolean; // true = der Kalendertag direkt nach heute
};

// "Morgen" ist die Vorbelegung. Hat der Kalendertag danach keine Schulstunden
// (Wochenende, Ferien, beweglicher Ferientag), springt die Suche auf den
// naechsten Tag, an dem `hasLessons` etwas findet. `hasLessons` bekommt seinen
// Bereich vom Aufrufer vorgerechnet (Datenbankzugriff bleibt in der Route),
// hier wird nur noch geprueft und gezaehlt.
//
// Findet sich innerhalb von maxLookaheadDays kein Schultag (z.B. Sommerferien
// ohne importierten Plan), bleibt es bei "morgen" -- die Seite zeigt dann
// ehrlich, dass nichts geplant ist, statt beliebig weit in die Zukunft zu
// suchen.
export function pickTargetDay(
  todayISO: string,
  hasLessons: (dateISO: string) => boolean,
  maxLookaheadDays = 14,
): TargetDay {
  const tomorrow = addDays(todayISO, 1);
  if (hasLessons(tomorrow)) return { date: tomorrow, isTomorrow: true };
  for (let i = 2; i <= maxLookaheadDays; i++) {
    const candidate = addDays(todayISO, i);
    if (hasLessons(candidate)) return { date: candidate, isTomorrow: false };
  }
  return { date: tomorrow, isTomorrow: true };
}

// --- Fokus-Zieltag ---------------------------------------------------------

// Der Fokus zeigt heute, solange heute noch Unterricht laeuft oder ansteht,
// sonst den naechsten Schultag ab morgen. todayRemaining rechnet der Aufrufer
// aus den Events des Tages (mind. ein nicht-entfallenes Event endet nach
// Jetzt) -- hier bleibt es eine reine, DB-freie Entscheidung wie pickTargetDay.
// Es gibt bewusst keinen manuellen Heute/Morgen-Schalter: ein View oder Woche.
export function pickFocusDay(
  todayISO: string,
  hasLessons: (dateISO: string) => boolean,
  todayRemaining: boolean,
  maxLookaheadDays = 14,
): TargetDay {
  if (todayRemaining) return { date: todayISO, isTomorrow: false };
  return pickTargetDay(todayISO, hasLessons, maxLookaheadDays);
}

const WEEKDAYS_FULL = [
  "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag",
];
const MONTHS = [
  "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function weekdayOf(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

// "Morgen" wenn der Zieltag wirklich der naechste Kalendertag ist, "Heute"
// wenn explizit der heutige Tag angefragt wurde, sonst ausgeschrieben
// "Montag, 7. September" -- der Fall, in dem die Seite selbst erklaeren muss,
// welcher Tag gemeint ist.
export function targetDayLabel(target: TargetDay, todayISO: string): string {
  if (target.date === todayISO) return "Heute";
  if (target.isTomorrow) return "Morgen";
  const d = Number(target.date.slice(8, 10));
  const m = Number(target.date.slice(5, 7)) - 1;
  return `${WEEKDAYS_FULL[weekdayOf(target.date)]}, ${d}. ${MONTHS[m]}`;
}

// --- Aufgaben bis zum Zieltag ----------------------------------------------

// Offene Aufgaben mit Faelligkeit bis inklusive dem Zieltag -- Ueberfaelliges
// (Faelligkeit vor heute) zaehlt ausdruecklich dazu. Sortiert: zuerst nach
// Faelligkeit (das Ueberfaellige und Heutige zuerst), innerhalb eines Tages
// wie ueberall sonst (Pruefung vor Hausaufgabe, dann Fach, dann Titel).
//
// Pruefungen, die genau am Zieltag anstehen, fehlen hier bewusst: die stehen
// schon oben in der grossen Pruefungskarte (examsOnTarget) -- ohne den
// Ausschluss taeuchte dieselbe Klassenarbeit zweimal auf der Seite auf, einmal
// gross und einmal als Zeile zwischen den Hausaufgaben. Eine ueberfaellige
// Pruefung (Faelligkeit vor dem Zieltag) bleibt dagegen in der Liste -- sie
// hat keine eigene Karte, dafuer ist sie ja schon vorbei.
export function dueUntilTarget(
  items: AssignmentDTO[],
  targetISO: string,
  todayISO: string = localISO(),
): AssignmentDTO[] {
  void todayISO; // nur fuer die Default-Signatur, die Filterung braucht targetISO allein
  return items
    .filter((it) => !it.completedAt && it.dueDate && it.dueDate <= targetISO)
    .filter((it) => !(it.dueDate === targetISO && isExamPageType(it.type)))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || compareInGroup(a, b));
}

// Pruefungen (Klassenarbeit/Test/Referat), die genau am Zieltag anstehen --
// das ist die wichtigste Information des Tages und steht separat oben.
export function examsOnTarget(items: AssignmentDTO[], targetISO: string): AssignmentDTO[] {
  return items
    .filter((it) => !it.completedAt && it.dueDate === targetISO && isExamPageType(it.type))
    .sort(compareInGroup);
}
