import { afterAll, describe, expect, it } from "vitest";
import type { Todo, TodoCompletion } from "@/lib/db/schema";
import {
  buildTodayView,
  occurrencesInRange,
} from "@/lib/todo-expand";
import {
  completeTodo,
  createTodo,
  deleteTodo,
  listAllCompletions,
  parseNewTodo,
  uncompleteTodo,
  validateRrule,
} from "@/lib/todo-store";
import { buildRrule, rruleToLabel, rruleToMode } from "@/lib/todo-recurrence";

// --- Test-Factory ------------------------------------------------------------

function todo(partial: Partial<Todo> & { id: string; title: string }): Todo {
  return {
    notes: null,
    color: null,
    priority: "none",
    rrule: null,
    dueDate: null,
    scheduledTime: null,
    estMinutes: null,
    archivedAt: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...partial,
  };
}

function comp(todoId: string, date: string): TodoCompletion {
  return { id: `c-${todoId}-${date}`, todoId, date, createdAt: new Date() };
}

// --- occurrencesInRange ------------------------------------------------------

describe("occurrencesInRange", () => {
  it("'alle 2 Tage' liefert jeden zweiten Tag ab dem Anker", () => {
    const occ = occurrencesInRange(
      "FREQ=DAILY;INTERVAL=2",
      "2026-06-01",
      "2026-06-01",
      "2026-06-07",
    );
    expect(occ).toEqual(["2026-06-01", "2026-06-03", "2026-06-05", "2026-06-07"]);
  });

  it("taeglich liefert jeden Tag im Bereich", () => {
    const occ = occurrencesInRange("FREQ=DAILY", "2026-06-28", "2026-06-29", "2026-07-01");
    expect(occ).toEqual(["2026-06-29", "2026-06-30", "2026-07-01"]);
  });

  it("woechentlich trifft denselben Wochentag", () => {
    const occ = occurrencesInRange("FREQ=WEEKLY", "2026-06-29", "2026-06-29", "2026-07-12");
    expect(occ).toEqual(["2026-06-29", "2026-07-06"]);
  });
});

// --- buildTodayView ----------------------------------------------------------

const TODAY = "2026-06-29";

describe("buildTodayView", () => {
  it("taegliche Habit ohne Erledigung steht offen unter 'heute', nicht ueberfaellig", () => {
    const todos = [todo({ id: "h1", title: "Bett machen", rrule: "FREQ=DAILY" })];
    const v = buildTodayView(TODAY, todos, []);
    expect(v.today.map((i) => i.todoId)).toEqual(["h1"]);
    expect(v.overdue).toHaveLength(0);
    expect(v.today[0]).toMatchObject({ done: false, overdue: false, recurring: true });
  });

  it("'alle 2 Tage' an einem Nicht-Vorkommen-Tag taucht gar nicht auf", () => {
    // Anker gestern -> Vorkommen gestern/morgen, heute nicht.
    const todos = [
      todo({ id: "h2", title: "Aufraeumen", rrule: "FREQ=DAILY;INTERVAL=2", dueDate: "2026-06-28" }),
    ];
    const v = buildTodayView(TODAY, todos, []);
    expect([...v.today, ...v.overdue, ...v.completed]).toHaveLength(0);
  });

  it("heute abgehakte Habit landet in 'erledigt'", () => {
    const todos = [todo({ id: "h3", title: "Vokabeln", rrule: "FREQ=DAILY" })];
    const v = buildTodayView(TODAY, todos, [comp("h3", TODAY)]);
    expect(v.completed.map((i) => i.todoId)).toEqual(["h3"]);
    expect(v.today).toHaveLength(0);
  });

  it("verpasste Habit (gestern offen) ist heute NICHT ueberfaellig", () => {
    const todos = [todo({ id: "h4", title: "Joggen", rrule: "FREQ=DAILY" })];
    // keine Completion gestern -> Streak bricht, aber kein Overdue-Eintrag
    const v = buildTodayView(TODAY, todos, []);
    expect(v.overdue).toHaveLength(0);
    expect(v.today.map((i) => i.todoId)).toEqual(["h4"]);
  });

  it("einmalige Aufgabe mit Faelligkeit gestern ist ueberfaellig", () => {
    const todos = [todo({ id: "o1", title: "Hausaufgabe", dueDate: "2026-06-28" })];
    const v = buildTodayView(TODAY, todos, []);
    expect(v.overdue.map((i) => i.todoId)).toEqual(["o1"]);
    expect(v.overdue[0]).toMatchObject({ overdue: true, date: "2026-06-28" });
  });

  it("einmalige Aufgabe faellig heute steht unter 'heute'", () => {
    const todos = [todo({ id: "o2", title: "Anrufen", dueDate: TODAY })];
    const v = buildTodayView(TODAY, todos, []);
    expect(v.today.map((i) => i.todoId)).toEqual(["o2"]);
  });

  it("einmalige Aufgabe gestern erledigt taucht heute nicht mehr auf", () => {
    const todos = [todo({ id: "o3", title: "Paket holen", dueDate: "2026-06-28" })];
    const v = buildTodayView(TODAY, todos, [comp("o3", "2026-06-28")]);
    expect([...v.today, ...v.overdue, ...v.completed]).toHaveLength(0);
  });

  it("einmalige Aufgabe ohne Datum ist immer sichtbar", () => {
    const todos = [todo({ id: "o4", title: "Irgendwann lesen" })];
    const v = buildTodayView(TODAY, todos, []);
    expect(v.today.map((i) => i.todoId)).toEqual(["o4"]);
  });
});

// --- Streak ------------------------------------------------------------------

describe("buildTodayView -- Streak", () => {
  it("zaehlt aufeinanderfolgende erledigte Tage (heute erledigt)", () => {
    const todos = [todo({ id: "s1", title: "Lesen", rrule: "FREQ=DAILY", dueDate: "2026-06-01" })];
    const v = buildTodayView(TODAY, todos, [comp("s1", "2026-06-28"), comp("s1", TODAY)]);
    expect(v.completed[0]).toMatchObject({ todoId: "s1", streak: 2, done: true });
  });

  it("heute noch offen bricht den Streak nicht (zaehlt bis gestern)", () => {
    const todos = [todo({ id: "s2", title: "Lesen", rrule: "FREQ=DAILY", dueDate: "2026-06-01" })];
    const v = buildTodayView(TODAY, todos, [comp("s2", "2026-06-27"), comp("s2", "2026-06-28")]);
    expect(v.today[0]).toMatchObject({ todoId: "s2", streak: 2, done: false });
  });

  it("ohne Erledigungen ist der Streak 0", () => {
    const todos = [todo({ id: "s3", title: "Lesen", rrule: "FREQ=DAILY", dueDate: "2026-06-01" })];
    const v = buildTodayView(TODAY, todos, []);
    expect(v.today[0].streak).toBe(0);
  });
});

// --- todo-recurrence ---------------------------------------------------------

describe("buildRrule", () => {
  it("baut die Preset-Regeln", () => {
    expect(buildRrule("daily")).toBe("FREQ=DAILY");
    expect(buildRrule("every2")).toBe("FREQ=DAILY;INTERVAL=2");
    expect(buildRrule("workdays")).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(buildRrule("custom", ["FR", "MO", "WE"])).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(buildRrule("custom", [])).toBeNull();
  });
});

describe("rruleToLabel", () => {
  it("formatiert lesbar", () => {
    expect(rruleToLabel("FREQ=DAILY")).toBe("Jeden Tag");
    expect(rruleToLabel("FREQ=DAILY;INTERVAL=2")).toBe("Alle 2 Tage");
    expect(rruleToLabel("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("Wochentags");
    expect(rruleToLabel("FREQ=WEEKLY;BYDAY=MO,WE,FR")).toBe("Mo, Mi, Fr");
  });
});

describe("rruleToMode", () => {
  it("round-trip aus buildRrule", () => {
    expect(rruleToMode("FREQ=DAILY;INTERVAL=2")).toEqual({ mode: "every2", days: [] });
    expect(rruleToMode("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR").mode).toBe("workdays");
    expect(rruleToMode("FREQ=WEEKLY;BYDAY=TU,TH")).toEqual({ mode: "custom", days: ["TU", "TH"] });
  });
});

// --- validateRrule / parseNewTodo -------------------------------------------

describe("validateRrule", () => {
  it("akzeptiert gueltige Regel und entfernt RRULE:-Praefix", () => {
    const r = validateRrule("RRULE:FREQ=DAILY;INTERVAL=2");
    expect(r).toEqual({ ok: true, value: "FREQ=DAILY;INTERVAL=2" });
  });
  it("lehnt Regel ohne FREQ ab", () => {
    expect(validateRrule("INTERVAL=2").ok).toBe(false);
  });
});

describe("parseNewTodo", () => {
  it("nimmt minimale Aufgabe (nur Titel)", () => {
    const r = parseNewTodo({ title: "  Test  " });
    expect(r).toMatchObject({ ok: true, value: { title: "Test" } });
  });
  it("lehnt ungueltige rrule ab", () => {
    expect(parseNewTodo({ title: "x", rrule: "kaputt" }).ok).toBe(false);
  });
  it("lehnt ungueltiges Datum ab", () => {
    expect(parseNewTodo({ title: "x", dueDate: "29.06.2026" }).ok).toBe(false);
  });
});

// --- DB-Smoke: abhaken / enthaken -------------------------------------------

const cleanup: string[] = [];
afterAll(async () => {
  for (const id of cleanup) await deleteTodo(id);
});

describe("Completion-Log (DB)", () => {
  it("abhaken legt Completion an, enthaken entfernt sie", async () => {
    const t = await createTodo({ title: "Smoke-Todo", rrule: "FREQ=DAILY" });
    cleanup.push(t.id);

    await completeTodo(t.id, "2026-06-29");
    let comps = (await listAllCompletions()).filter((c) => c.todoId === t.id);
    expect(comps).toHaveLength(1);

    // Idempotent: zweites Abhaken legt keine zweite Zeile an.
    await completeTodo(t.id, "2026-06-29");
    comps = (await listAllCompletions()).filter((c) => c.todoId === t.id);
    expect(comps).toHaveLength(1);

    const removed = await uncompleteTodo(t.id, "2026-06-29");
    expect(removed).toBe(true);
    comps = (await listAllCompletions()).filter((c) => c.todoId === t.id);
    expect(comps).toHaveLength(0);
  });
});
