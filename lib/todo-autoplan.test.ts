import { describe, expect, it } from "vitest";
import type { TodoInstance } from "@/lib/todos-view";
import { planWeek, type FreeSlot } from "@/lib/todo-autoplan";

// --- Test-Factory ------------------------------------------------------------

function inst(partial: Partial<TodoInstance> & { todoId: string; title: string; date: string }): TodoInstance {
  return {
    notes: null,
    color: null,
    priority: "none",
    recurring: false,
    rrule: null,
    dueDate: partial.date,
    done: false,
    overdue: false,
    streak: 0,
    scheduledTime: null,
    estMinutes: null,
    ...partial,
  };
}

function slot(date: string, start: string, end: string): FreeSlot {
  const toMin = (t: string) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
  return { date, startTime: start, endTime: end, minutes: toMin(end) - toMin(start) };
}

const DAY = "2026-06-30";

describe("planWeek", () => {
  it("plant mit 30 min Pause oben -- Start = Slot-Anfang + 30", () => {
    const out = planWeek(
      { [DAY]: [inst({ todoId: "a", title: "A", date: DAY })] },
      { [DAY]: [slot(DAY, "09:00", "12:00")] },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ todoId: "a", date: DAY, startTime: "09:30", endTime: "10:00" });
  });

  it("braucht 30 min Puffer oben + unten -- 30-min-Aufgabe passt NICHT in 60-min-Luecke", () => {
    const out = planWeek(
      { [DAY]: [inst({ todoId: "a", title: "A", date: DAY, estMinutes: 30 })] },
      { [DAY]: [slot(DAY, "09:00", "10:00")] }, // braucht 30+30+30 = 90 min
    );
    expect(out).toHaveLength(0);
  });

  it("respektiert die Dauer (estMinutes) -- zu kleine Luecke = kein Vorschlag", () => {
    const out = planWeek(
      { [DAY]: [inst({ todoId: "a", title: "A", date: DAY, estMinutes: 60 })] },
      { [DAY]: [slot(DAY, "09:00", "09:30")] },
    );
    expect(out).toHaveLength(0);
  });

  it("haelt 30 min Pause zwischen zwei Aufgaben", () => {
    // 09:00-11:30 (150 min) = Pause30 + 30 + Pause30 + 30 + Pause30
    const out = planWeek(
      {
        [DAY]: [
          inst({ todoId: "a", title: "A", date: DAY, estMinutes: 30 }),
          inst({ todoId: "b", title: "B", date: DAY, estMinutes: 30 }),
        ],
      },
      { [DAY]: [slot(DAY, "09:00", "11:30")] },
    );
    expect(out.map((s) => [s.todoId, s.startTime, s.endTime])).toEqual([
      ["a", "09:30", "10:00"], // 30 Pause -> A -> 30 Pause ->
      ["b", "10:30", "11:00"], // B -> 30 Pause -> Slot-Ende 11:30
    ]);
  });

  it("priorisiert high vor none", () => {
    const out = planWeek(
      {
        [DAY]: [
          inst({ todoId: "low", title: "Z-low", date: DAY, priority: "none", estMinutes: 30 }),
          inst({ todoId: "high", title: "A-high", date: DAY, priority: "high", estMinutes: 30 }),
        ],
      },
      { [DAY]: [slot(DAY, "09:00", "10:30")] }, // nur Platz fuer EINE (30+30+30)
    );
    expect(out).toHaveLength(1);
    expect(out[0].todoId).toBe("high");
  });

  it("legt heute nichts in die Vergangenheit (minStartMin)", () => {
    const out = planWeek(
      { [DAY]: [inst({ todoId: "a", title: "A", date: DAY, estMinutes: 30 })] },
      { [DAY]: [slot(DAY, "08:00", "12:00")] },
      { minStartISO: DAY, minStartMin: 10 * 60 }, // jetzt = 10:00
    );
    expect(out[0].startTime).toBe("10:00");
  });

  it("ignoriert bereits terminierte und erledigte Aufgaben", () => {
    const out = planWeek(
      {
        [DAY]: [
          inst({ todoId: "timed", title: "T", date: DAY, scheduledTime: "09:00" }),
          inst({ todoId: "done", title: "D", date: DAY, done: true }),
        ],
      },
      { [DAY]: [slot(DAY, "09:00", "12:00")] },
    );
    expect(out).toHaveLength(0);
  });

  it("plant eine wiederkehrende Aufgabe nur EINMAL (am fruehesten Tag)", () => {
    const d2 = "2026-07-01";
    const r = (date: string) =>
      inst({ todoId: "rec", title: "Habit", date, recurring: true, rrule: "FREQ=DAILY", estMinutes: 30 });
    const out = planWeek(
      { [DAY]: [r(DAY)], [d2]: [r(d2)] },
      { [DAY]: [slot(DAY, "09:00", "11:00")], [d2]: [slot(d2, "09:00", "11:00")] },
    );
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe(DAY);
  });
});
