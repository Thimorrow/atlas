import { RRule } from "rrule";
import type { Todo, TodoCompletion } from "@/lib/db/schema";
import { listAllCompletions, listTodos } from "@/lib/todo-store";

// Eine konkrete To-Do-Instanz an einem Tag (aus einmaliger oder wiederkehrender
// Aufgabe abgeleitet).
export type TodoInstance = {
  todoId: string;
  title: string;
  notes: string | null;
  color: string | null;
  priority: Todo["priority"];
  recurring: boolean;
  rrule: string | null;
  date: string; // YYYY-MM-DD -- der Tag, fuer den diese Instanz steht
  dueDate: string | null; // einmalig: gesetzte Deadline (null = ohne); wiederkehrend: Anker
  done: boolean;
  overdue: boolean; // nur einmalige Aufgaben, faellig in der Vergangenheit, offen
  streak: number; // wiederkehrend: aktuelle ununterbrochene Kette (0 sonst)
  scheduledTime: string | null; // kalender-ready (HH:MM), noch ungenutzt
  estMinutes: number | null;
};

// Die "Heute"-Standardansicht: drei Sektionen.
export type TodayView = {
  date: string;
  overdue: TodoInstance[]; // ueberfaellige einmalige Aufgaben
  today: TodoInstance[]; // heute faellige/aktive Aufgaben (offen)
  completed: TodoInstance[]; // heute abgehakt
};

// --- Datums-Helfer (date-only, UTC -> kein TZ-Drift) -------------------------

function parseISO(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00Z`);
}
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
const hm = (t: string | null): string | null => (t ? t.slice(0, 5) : null);

// Vorkommen einer RRULE in [startISO, endISO] (inklusiv) als Datums-Strings.
// Anker = dtstart (Phase der Wiederholung, z.B. welcher Tag bei "alle 2 Tage").
// Alles in UTC-Mitternacht, damit rrule.js keinen Zeitzonen-Drift erzeugt.
export function occurrencesInRange(
  rruleBody: string,
  anchorISO: string,
  startISO: string,
  endISO: string,
): string[] {
  const opts = RRule.parseString(rruleBody);
  opts.dtstart = parseISO(anchorISO);
  const rule = new RRule(opts);
  return rule
    .between(parseISO(startISO), parseISO(endISO), true)
    .map(toISO);
}

// Anker fuer eine wiederkehrende Aufgabe: explizites dueDate, sonst Erstelltag.
function anchorOf(t: Todo): string {
  if (t.dueDate) return t.dueDate;
  return toISO(t.createdAt);
}

function toInstance(
  t: Todo,
  date: string,
  done: boolean,
  overdue: boolean,
  streak = 0,
): TodoInstance {
  return {
    todoId: t.id,
    title: t.title,
    notes: t.notes,
    color: t.color,
    priority: t.priority,
    recurring: t.rrule !== null,
    rrule: t.rrule,
    date,
    dueDate: t.dueDate,
    done,
    overdue,
    streak,
    scheduledTime: hm(t.scheduledTime),
    estMinutes: t.estMinutes,
  };
}

// Aktuelle Streak einer wiederkehrenden Aufgabe: zaehlt die geplanten Vorkommen
// rueckwaerts ab heute, solange jedes erledigt ist. Ist heute geplant aber noch
// offen, bricht das den Streak NICHT -- es zaehlt die Kette bis gestern.
function computeStreak(
  rrule: string,
  anchorISO: string,
  todayISO: string,
  doneByDay: Set<string>,
): number {
  const occ = occurrencesInRange(rrule, anchorISO, anchorISO, todayISO);
  let streak = 0;
  for (let i = occ.length - 1; i >= 0; i--) {
    const day = occ[i];
    if (doneByDay.has(day)) streak++;
    else if (day === todayISO) continue; // heute noch offen -> Kette laeuft weiter
    else break;
  }
  return streak;
}

// --- Heute-Ansicht -----------------------------------------------------------

export function buildTodayView(
  todayISO: string,
  todos: Todo[],
  completions: TodoCompletion[],
): TodayView {
  // Erledigt-heute (datumsgenau) + jemals-erledigt (fuer einmalige Aufgaben) +
  // alle Erledigungs-Tage pro Aufgabe (fuer den Streak).
  const doneToday = new Set<string>();
  const everDone = new Set<string>();
  const daysByTodo = new Map<string, Set<string>>();
  for (const c of completions) {
    everDone.add(c.todoId);
    if (c.date === todayISO) doneToday.add(c.todoId);
    let s = daysByTodo.get(c.todoId);
    if (!s) daysByTodo.set(c.todoId, (s = new Set()));
    s.add(c.date);
  }
  const EMPTY: Set<string> = new Set();

  const overdue: TodoInstance[] = [];
  const today: TodoInstance[] = [];
  const completed: TodoInstance[] = [];

  for (const t of todos) {
    if (t.rrule !== null) {
      // Wiederkehrend: nur das heutige Vorkommen zaehlt. Verpasste Tage erzeugen
      // KEINE Overdue-Instanz (Habit-Verhalten -> nur Streak bricht).
      const occ = occurrencesInRange(t.rrule, anchorOf(t), todayISO, todayISO);
      if (occ.length === 0) continue;
      const done = doneToday.has(t.id);
      const streak = computeStreak(t.rrule, anchorOf(t), todayISO, daysByTodo.get(t.id) ?? EMPTY);
      (done ? completed : today).push(toInstance(t, todayISO, done, false, streak));
    } else {
      // Einmalig: done = es existiert ueberhaupt eine Erledigung.
      const done = everDone.has(t.id);
      if (done) {
        // Nur in der Heute-Ansicht zeigen, wenn HEUTE abgehakt; sonst weg.
        if (doneToday.has(t.id)) completed.push(toInstance(t, todayISO, true, false));
        continue;
      }
      if (!t.dueDate) {
        today.push(toInstance(t, todayISO, false, false)); // "irgendwann" -> immer sichtbar
      } else if (t.dueDate < todayISO) {
        overdue.push(toInstance(t, t.dueDate, false, true));
      } else if (t.dueDate === todayISO) {
        today.push(toInstance(t, todayISO, false, false));
      }
      // dueDate in der Zukunft -> heute nicht zeigen.
    }
  }

  const byTime = (a: TodoInstance, b: TodoInstance) =>
    (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99") ||
    a.title.localeCompare(b.title);
  overdue.sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  today.sort(byTime);
  completed.sort(byTime);

  return { date: todayISO, overdue, today, completed };
}

// Bequemer Lader: zieht Aufgaben + Erledigungen und baut die Heute-Ansicht.
export async function getTodayView(todayISO: string): Promise<TodayView> {
  const [todos, completions] = await Promise.all([
    listTodos(),
    listAllCompletions(),
  ]);
  return buildTodayView(todayISO, todos, completions);
}

// --- Range-Ansicht (Kalender-Integration) ------------------------------------
// Pro Tag NUR Aufgaben, die KONKRET dort liegen: einmalige mit dueDate===Tag,
// wiederkehrende mit RRULE-Vorkommen am Tag. Datumslose ("irgendwann") und
// overdue-Carryover bleiben aussen vor -- sonst wuerde das Wochen-Raster
// zugemuellt. done = es existiert eine Erledigung fuer (Aufgabe, Tag).
export type RangeView = Record<string, TodoInstance[]>; // key = YYYY-MM-DD

export function buildRangeView(
  startISO: string,
  endISO: string,
  todos: Todo[],
  completions: TodoCompletion[],
): RangeView {
  const doneByDay = new Set<string>(); // `${todoId}|${date}`
  for (const c of completions) doneByDay.add(`${c.todoId}|${c.date}`);
  const isDone = (id: string, day: string) => doneByDay.has(`${id}|${day}`);

  const days: RangeView = {};
  const push = (day: string, inst: TodoInstance) => {
    if (day < startISO || day > endISO) return;
    (days[day] ??= []).push(inst);
  };

  for (const t of todos) {
    if (t.rrule !== null) {
      const occ = occurrencesInRange(t.rrule, anchorOf(t), startISO, endISO);
      for (const day of occ) push(day, toInstance(t, day, isDone(t.id, day), false));
    } else if (t.dueDate) {
      push(t.dueDate, toInstance(t, t.dueDate, isDone(t.id, t.dueDate), false));
    }
    // datumslose Aufgaben: kein konkreter Kalendertag -> nicht im Raster.
  }

  const byTime = (a: TodoInstance, b: TodoInstance) =>
    (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99") ||
    a.title.localeCompare(b.title);
  for (const day of Object.keys(days)) days[day].sort(byTime);
  return days;
}

// Bequemer Lader fuer die Range-Ansicht.
export async function getRangeView(startISO: string, endISO: string): Promise<RangeView> {
  const [todos, completions] = await Promise.all([
    listTodos(),
    listAllCompletions(),
  ]);
  return buildRangeView(startISO, endISO, todos, completions);
}
