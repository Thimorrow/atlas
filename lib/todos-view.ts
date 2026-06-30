// Geteilte Typen + Helfer fuer die To-Dos-Frontends (Version A "Stapel" und
// Version B "Fokus"). Die Typen spiegeln die Server-Form aus lib/todo-expand.ts;
// hier ohne DB-Import, damit der Client schlank bleibt.

export type TodoPriority = "none" | "low" | "medium" | "high";

// Eine konkrete To-Do-Instanz an einem Tag (vom Server geliefert).
export type TodoInstance = {
  todoId: string;
  title: string;
  notes: string | null;
  color: string | null;
  priority: TodoPriority;
  recurring: boolean;
  rrule: string | null;
  date: string; // YYYY-MM-DD -- der Tag, fuer den die Instanz steht
  dueDate: string | null; // einmalig: gesetzte Deadline (null = ohne); wiederkehrend: Anker
  done: boolean;
  overdue: boolean;
  streak: number;
  scheduledTime: string | null; // HH:MM oder null
  estMinutes: number | null;
};

export type TodayView = {
  date: string;
  overdue: TodoInstance[];
  today: TodoInstance[];
  completed: TodoInstance[];
};

// --- Datum (lokal, kein TZ-Drift) -------------------------------------------

export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localISO(d);
}
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const WEEKDAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const weekdayOf = (iso: string) => (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const monthOf = (iso: string) => Number(iso.slice(5, 7)) - 1;

// Kopf-Label fuer die Tag-Navigation: "Heute · Montag, 30. Juni" bzw. ohne
// "Heute"-Praefix, wenn ein anderer Tag angesteuert ist.
export function dayLabel(iso: string, todayISO: string): string {
  const base = `${WEEKDAYS_LONG[weekdayOf(iso)]}, ${dayNum(iso)}. ${MONTHS[monthOf(iso)]}`;
  if (iso === todayISO) return `Heute · ${base}`;
  if (iso === addDays(todayISO, 1)) return `Morgen · ${base}`;
  if (iso === addDays(todayISO, -1)) return `Gestern · ${base}`;
  return base;
}

// --- Faelligkeits-Label ------------------------------------------------------

// "2 Tage überfällig" / "seit gestern" -- relativ zum angezeigten Tag.
export function overdueLabel(instDate: string, viewDate: string): string {
  const a = new Date(`${instDate}T00:00:00`).getTime();
  const b = new Date(`${viewDate}T00:00:00`).getTime();
  const days = Math.round((b - a) / 86_400_000);
  if (days <= 0) return "überfällig";
  if (days === 1) return "seit gestern";
  return `${days} Tage überfällig`;
}

// Deadline-Label fuer einmalige Aufgaben mit gesetztem Faelligkeitstag, relativ
// zum angezeigten Tag: "Heute fällig" / "bis morgen" / "bis Di., 15. Juli".
const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export function dueLabel(dueISO: string, viewDate: string): string {
  if (dueISO === viewDate) return "Heute fällig";
  if (dueISO === addDays(viewDate, 1)) return "bis morgen";
  return `bis ${WEEKDAYS_SHORT[weekdayOf(dueISO)]}., ${dayNum(dueISO)}. ${MONTHS[monthOf(dueISO)]}`;
}

// --- Status-Satz (Version A) -------------------------------------------------
// Zaehlt RUNTER statt "x/y" -- macht die Restarbeit kleiner, nicht groesser.

export type StatusLine = {
  // Optionaler roter Vorsatz (nur bei Ueberfaelligem).
  overdue: number;
  // Hauptsatz.
  text: string;
  // true, wenn der Tag (heute) komplett leer abgeraeumt ist -> Flourish erlaubt.
  cleared: boolean;
};

export function buildStatus(view: TodayView, isToday: boolean): StatusLine {
  const open = view.overdue.length + view.today.length;
  const overdue = view.overdue.length;
  if (open === 0) {
    const cleared = view.completed.length > 0;
    return {
      overdue: 0,
      text: cleared
        ? isToday ? "Alles erledigt." : "Dieser Tag ist abgeräumt."
        : isToday ? "Nichts fällig heute." : "Nichts fällig an diesem Tag.",
      cleared: cleared && isToday,
    };
  }
  const todayOpen = view.today.length;
  // Zaehlt ALLE offenen (inkl. ueberfaellig), damit der Satz zur sichtbaren
  // Zeilenzahl passt. Komma statt Em-Dash (User-facing: keine Em-Dashes).
  const text =
    todayOpen > 0
      ? open === 1
        ? "Nur noch eine, dann bist du durch"
        : `Noch ${open}, dann bist du durch`
      : "Nur noch das Überfällige";
  return { overdue, text, cleared: false };
}

// Wohin ein wieder-geoeffnetes Item gehoert (Optimistic-Uncheck).
export function sectionFor(inst: TodoInstance, viewDate: string): "overdue" | "today" {
  if (!inst.recurring && !inst.overdue && inst.date < viewDate) return "overdue";
  return inst.overdue ? "overdue" : "today";
}

// RRULE -> menschenlesbare Kadenz ("täglich", "alle 2 Tage", "wöchentlich").
// Klein gehalten -- die haeufigen Faelle, sonst ein neutrales "wiederkehrend".
export function cadenceLabel(rrule: string | null): string | null {
  if (!rrule) return null;
  const freq = rrule.match(/FREQ=([A-Z]+)/i)?.[1]?.toUpperCase();
  const interval = Number(rrule.match(/INTERVAL=(\d+)/i)?.[1] ?? "1");
  if (freq === "DAILY") return interval === 1 ? "täglich" : `alle ${interval} Tage`;
  if (freq === "WEEKLY") return interval === 1 ? "wöchentlich" : `alle ${interval} Wochen`;
  if (freq === "MONTHLY") return interval === 1 ? "monatlich" : `alle ${interval} Monate`;
  return "wiederkehrend";
}

// Sortierung wie der Server: nach (geplanter) Zeit, dann Titel.
export function byTime(a: TodoInstance, b: TodoInstance): number {
  return (
    (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99") ||
    a.title.localeCompare(b.title)
  );
}
