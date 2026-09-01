// Geteilte Typen + reine Gruppier-/Sortierlogik fuer das Aufgaben-Modul.
// Bewusst ohne DB-Import: laeuft im Client, im Server-Component und im Test.

export type AssignmentType = "homework" | "exam" | "test" | "presentation" | "other";

// Serialisierte Form, wie sie ueber /api/assignments geht (Timestamps als ISO).
export type AssignmentDTO = {
  id: string;
  subjectId: string | null;
  subjectName: string | null;
  subjectColor: string | null;
  type: AssignmentType;
  title: string;
  notes: string | null;
  dueDate: string | null; // YYYY-MM-DD
  completedAt: string | null; // ISO oder null = offen
};

export const ASSIGNMENT_TYPES: AssignmentType[] = [
  "homework",
  "exam",
  "test",
  "presentation",
  "other",
];

export const TYPE_LABEL: Record<AssignmentType, string> = {
  homework: "Hausaufgabe",
  exam: "Klassenarbeit",
  test: "Test",
  presentation: "Referat",
  other: "Sonstiges",
};

// exam und test sind Pruefungen: sie stehen innerhalb ihrer Gruppe vorn und
// werden im Stundenplan als Ring statt als gefuellter Punkt gezeichnet.
export function isExam(t: AssignmentType): boolean {
  return t === "exam" || t === "test";
}

// --- Datum (lokal, kein UTC-Drift) ------------------------------------------
// Bewusst identisch zu lib/todos-view.ts (b34dab2): eine Aufgabe am Abend darf
// nicht faelschlich als ueberfaellig gelten, weil toISOString auf UTC springt.

export function localISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localISO(d);
}

// 0 = Montag ... 6 = Sonntag
export function weekdayOf(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00`).getTime();
  const b = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// Sonntag der laufenden Woche (Woche = Mo..So), inklusive.
export function endOfWeek(todayISO: string): string {
  return addDays(todayISO, 6 - weekdayOf(todayISO));
}

// --- Gruppierung -------------------------------------------------------------

export type GroupKey = "overdue" | "today" | "tomorrow" | "week" | "later" | "undated";

export const GROUP_ORDER: GroupKey[] = [
  "overdue",
  "today",
  "tomorrow",
  "week",
  "later",
  "undated",
];

export const GROUP_LABEL: Record<GroupKey, string> = {
  overdue: "Überfällig",
  today: "Heute",
  tomorrow: "Morgen",
  week: "Diese Woche",
  later: "Später",
  undated: "Ohne Datum",
};

export function groupOf(dueDate: string | null, todayISO: string): GroupKey {
  if (!dueDate) return "undated";
  if (dueDate < todayISO) return "overdue";
  if (dueDate === todayISO) return "today";
  if (dueDate === addDays(todayISO, 1)) return "tomorrow";
  if (dueDate <= endOfWeek(todayISO)) return "week";
  return "later";
}

// Innerhalb einer Gruppe: Pruefungen zuerst, dann nach Fach, dann nach Titel.
// Bei "Später" zusaetzlich das Datum voran, sonst stuende der uebernaechste
// Monat ueber der naechsten Woche.
export function compareInGroup(a: AssignmentDTO, b: AssignmentDTO): number {
  const examDiff = Number(isExam(b.type)) - Number(isExam(a.type));
  if (examDiff !== 0) return examDiff;
  const subjectDiff = (a.subjectName ?? "￿").localeCompare(b.subjectName ?? "￿", "de");
  if (subjectDiff !== 0) return subjectDiff;
  return a.title.localeCompare(b.title, "de");
}

export type AssignmentGroup = { key: GroupKey; label: string; items: AssignmentDTO[] };

// Offene Aufgaben in die sechs Gruppen einsortieren. Leere Gruppen fallen weg,
// die Reihenfolge ist immer GROUP_ORDER.
export function groupAssignments(
  items: AssignmentDTO[],
  todayISO: string = localISO(),
): AssignmentGroup[] {
  const buckets = new Map<GroupKey, AssignmentDTO[]>();
  for (const it of items) {
    if (it.completedAt) continue;
    const key = groupOf(it.dueDate, todayISO);
    const list = buckets.get(key);
    if (list) list.push(it);
    else buckets.set(key, [it]);
  }
  return GROUP_ORDER.filter((k) => (buckets.get(k)?.length ?? 0) > 0).map((key) => {
    const items = buckets.get(key)!;
    // "Später" laeuft chronologisch, alle anderen Gruppen haben ohnehin nur
    // einen Tag (bzw. gar kein Datum) und sortieren rein inhaltlich.
    items.sort(
      key === "later" || key === "overdue" || key === "week"
        ? (a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || compareInGroup(a, b)
        : compareInGroup,
    );
    return { key, label: GROUP_LABEL[key], items };
  });
}

// "seit gestern" / "3 Tage überfällig" -- fuer den Ueberfaellig-Block.
export function overdueLabel(dueISO: string, todayISO: string = localISO()): string {
  const days = daysBetween(dueISO, todayISO);
  if (days <= 0) return "überfällig";
  if (days === 1) return "seit gestern";
  return `${days} Tage überfällig`;
}

const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

// Datums-Label an der Zeile: "heute" / "morgen" / "Di., 15. Juli".
export function dueLabel(dueISO: string | null, todayISO: string = localISO()): string | null {
  if (!dueISO) return null;
  if (dueISO === todayISO) return "heute";
  if (dueISO === addDays(todayISO, 1)) return "morgen";
  if (dueISO === addDays(todayISO, -1)) return "gestern";
  const d = Number(dueISO.slice(8, 10));
  const m = Number(dueISO.slice(5, 7)) - 1;
  return `${WEEKDAYS_SHORT[weekdayOf(dueISO)]}., ${d}. ${MONTHS[m]}`;
}

// Erledigte der letzten 30 Tage, neueste zuerst -- fuer "Erledigte zeigen".
export function recentlyCompleted(
  items: AssignmentDTO[],
  todayISO: string = localISO(),
): AssignmentDTO[] {
  const cutoff = addDays(todayISO, -30);
  return items
    .filter((it) => it.completedAt && it.completedAt.slice(0, 10) >= cutoff)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
}
