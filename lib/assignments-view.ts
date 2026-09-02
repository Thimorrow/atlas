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

// --- Pruefungsplan (/pruefungen) ---------------------------------------------
// Eigene Sicht auf Aufgaben: nur Klassenarbeiten, Tests und Referate, sortiert
// nach Naehe statt in die sechs Aufgaben-Gruppen einsortiert.

export function isExamPageType(t: AssignmentType): boolean {
  return t === "exam" || t === "test" || t === "presentation";
}

// Vergangen = Faelligkeitsdatum vor heute. Eine Pruefung ohne Datum kann nicht
// "vorbei" sein, wenn kein Datum feststeht -- sie zaehlt als anstehend.
export function partitionExams(
  items: AssignmentDTO[],
  todayISO: string = localISO(),
): { upcoming: AssignmentDTO[]; past: AssignmentDTO[] } {
  const exams = items.filter((i) => isExamPageType(i.type));
  const upcoming: AssignmentDTO[] = [];
  const past: AssignmentDTO[] = [];
  for (const e of exams) {
    if (e.dueDate && e.dueDate < todayISO) past.push(e);
    else upcoming.push(e);
  }
  upcoming.sort(
    (a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿") || compareInGroup(a, b),
  );
  // Vergangene chronologisch rueckwaerts: die zuletzt geschriebene Arbeit
  // steht oben im aufklappbaren Rueckblick.
  past.sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? "") || compareInGroup(a, b));
  return { upcoming, past };
}

// "Heute" / "Morgen" / "in 5 Tagen" -- ehrliche Angabe, wie viel Zeit noch
// bleibt. Grossgeschrieben, weil es als eigener Chip steht, nicht mitten im
// Satz wie dueLabel.
export function daysUntilLabel(dueISO: string, todayISO: string = localISO()): string {
  const days = daysBetween(todayISO, dueISO);
  if (days <= 0) return "Heute";
  if (days === 1) return "Morgen";
  return `in ${days} Tagen`;
}

function dateOnlyLabel(iso: string): string {
  const d = Number(iso.slice(8, 10));
  const m = Number(iso.slice(5, 7)) - 1;
  return `${d}. ${MONTHS[m]}`;
}

// Wochentag+Datum ohne "heute"/"morgen"-Ersetzung -- fuer Zeilen, die den
// Abstand schon separat als Chip (daysUntilLabel) zeigen, damit die
// Information nicht doppelt in Worten steht.
export function weekdayDateLabel(dueISO: string): string {
  return `${WEEKDAYS_SHORT[weekdayOf(dueISO)]}., ${dateOnlyLabel(dueISO)}`;
}

export type ExamWeekGroup = {
  key: string; // ISO-Datum des Wochenmontags, "undated" fuer die Restgruppe
  label: string;
  items: AssignmentDTO[];
  crowded: boolean; // drei oder mehr Pruefungen in dieser Woche
};

// Gruppiert anstehende Pruefungen nach Kalenderwoche (Mo..So). Aufgaben ohne
// Datum landen in einer eigenen Gruppe am Ende. "crowded" markiert Wochen mit
// drei oder mehr Pruefungen -- die eigentliche Information, die eine reine
// chronologische Liste verschluckt.
export function groupExamsByWeek(
  items: AssignmentDTO[],
  todayISO: string = localISO(),
): ExamWeekGroup[] {
  const dated = items.filter((i) => i.dueDate);
  const undated = items.filter((i) => !i.dueDate);
  const buckets = new Map<string, AssignmentDTO[]>();
  for (const it of dated) {
    const start = addDays(it.dueDate!, -weekdayOf(it.dueDate!));
    const list = buckets.get(start);
    if (list) list.push(it);
    else buckets.set(start, [it]);
  }
  const todayWeekStart = addDays(todayISO, -weekdayOf(todayISO));
  const groups: ExamWeekGroup[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, group]) => {
      const sorted = [...group].sort(
        (a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || compareInGroup(a, b),
      );
      let label: string;
      if (weekStart === todayWeekStart) label = "Diese Woche";
      else if (weekStart === addDays(todayWeekStart, 7)) label = "Nächste Woche";
      else label = `Woche vom ${dateOnlyLabel(weekStart)}`;
      return { key: weekStart, label, items: sorted, crowded: sorted.length >= 3 };
    });
  if (undated.length > 0) {
    groups.push({
      key: "undated",
      label: "Ohne Datum",
      items: [...undated].sort(compareInGroup),
      crowded: false,
    });
  }
  return groups;
}

// Anzahl der Pruefungen aus `items`, die auf denselben Tag fallen -- fuer den
// Hinweis "2 Pruefungen an diesem Tag" direkt an der Zeile.
export function sameDayCount(items: AssignmentDTO[], dueDate: string | null): number {
  if (!dueDate) return 1;
  return items.filter((i) => i.dueDate === dueDate).length;
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
