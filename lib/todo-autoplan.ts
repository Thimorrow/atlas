// Auto-Planer: legt offene, noch nicht terminierte Aufgaben in die freien Luecken
// des Kalenders und schlaegt Uhrzeiten vor. Pure Logik (kein Fetch/DOM) -> testbar.
// scheduledTime ist GLOBAL pro Aufgabe -> jede Aufgabe bekommt EINEN Vorschlag
// (an ihrem fruehesten passenden Tag), nicht einen pro Tag.

import type { TodoInstance } from "@/lib/todos-view";

export type FreeSlot = { date: string; startTime: string; endTime: string; minutes: number };

export type PlanSuggestion = {
  todoId: string;
  title: string;
  color: string | null;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  minutes: number;
};

// Standard-Dauer, wenn die Aufgabe keine Schaetzung hat.
const DEFAULT_DUR = 30;

// Pflicht-Pause ueber UND unter jeder Aufgabe: 30 min Abstand zum Slot-Anfang
// (= vorheriger Termin), 30 min zwischen zwei Aufgaben, 30 min zum Slot-Ende
// (= naechster Termin). Aufgaben liegen damit NIE direkt an einem Termin und nie
// in einem Termin (sie liegen ohnehin nur in den freien Luecken).
const PAUSE = 30;

const PRIO: Record<TodoInstance["priority"], number> = { high: 0, medium: 1, low: 2, none: 3 };

function toMin(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}
function fromMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function planWeek(
  todosByDay: Record<string, TodoInstance[]>,
  freeByDay: Record<string, FreeSlot[]>,
  opts?: { minStartISO?: string; minStartMin?: number },
): PlanSuggestion[] {
  // Kandidaten je todoId einsammeln (un-terminiert, offen) + ihre Tage (sortiert).
  const byId = new Map<string, { todo: TodoInstance; days: string[] }>();
  for (const day of Object.keys(todosByDay).sort()) {
    for (const t of todosByDay[day]) {
      if (t.done || t.scheduledTime) continue;
      const cur = byId.get(t.todoId);
      if (cur) cur.days.push(day);
      else byId.set(t.todoId, { todo: t, days: [day] });
    }
  }

  const candidates = [...byId.values()].sort(
    (a, b) => PRIO[a.todo.priority] - PRIO[b.todo.priority] || a.todo.title.localeCompare(b.todo.title),
  );

  // Veraenderbare Luecken pro Tag. `cursor` = fruehestmoeglicher Start der naechsten
  // Aufgabe in dieser Luecke; `fresh` = noch keine Aufgabe drin (dann gilt 30 min
  // Abstand zum Slot-Anfang, sonst steckt der 30-min-Abstand schon im cursor).
  const slotsByDay: Record<string, { cursor: number; e: number; fresh: boolean }[]> = {};
  for (const day of Object.keys(freeByDay)) {
    slotsByDay[day] = (freeByDay[day] ?? [])
      .map((f) => ({ cursor: toMin(f.startTime), e: toMin(f.endTime), fresh: true }))
      .sort((a, b) => a.cursor - b.cursor);
  }

  const out: PlanSuggestion[] = [];
  for (const { todo, days } of candidates) {
    const dur = todo.estMinutes ?? DEFAULT_DUR;
    let placed = false;
    for (const day of days) {
      if (placed) break;
      const floor = opts?.minStartISO === day ? (opts.minStartMin ?? 0) : 0;
      for (const slot of slotsByDay[day] ?? []) {
        // Erste Aufgabe der Luecke: 30 min nach dem vorherigen Termin. Danach
        // steckt die 30-min-Pause schon im cursor (= Ende voriger Aufgabe + 30).
        const required = slot.fresh ? slot.cursor + PAUSE : slot.cursor;
        const start = Math.max(required, floor);
        // 30 min Pause auch unter der Aufgabe -> 30 min vor dem naechsten Termin.
        if (start + dur + PAUSE <= slot.e) {
          out.push({
            todoId: todo.todoId,
            title: todo.title,
            color: todo.color,
            date: day,
            startTime: fromMin(start),
            endTime: fromMin(start + dur),
            minutes: dur,
          });
          slot.cursor = start + dur + PAUSE; // Aufgabe + Pause verbrauchen
          slot.fresh = false;
          placed = true;
          break;
        }
      }
    }
    // Passt nirgends -> kein Vorschlag (Aufgabe bleibt offen/ohne Zeit).
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}
