import { and, eq, gte, lte, sql } from "drizzle-orm";
import { RRule } from "rrule";
import { db } from "@/lib/db";
import {
  todos,
  todoCompletions,
  type NewTodo,
  type Todo,
  type TodoCompletion,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// CRUD -- To-Dos
// ---------------------------------------------------------------------------

// Standardmaessig nur aktive (nicht archivierte) Aufgaben.
export async function listTodos(includeArchived = false): Promise<Todo[]> {
  if (includeArchived) return db.select().from(todos);
  return db.select().from(todos).where(sql`${todos.archivedAt} is null`);
}

export async function createTodo(data: NewTodo): Promise<Todo> {
  const [row] = await db.insert(todos).values(data).returning();
  return row;
}

export async function updateTodo(
  id: string,
  patch: Partial<NewTodo>,
): Promise<Todo | undefined> {
  const [row] = await db
    .update(todos)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(todos.id, id))
    .returning();
  return row;
}

export async function deleteTodo(id: string): Promise<boolean> {
  const rows = await db
    .delete(todos)
    .where(eq(todos.id, id))
    .returning({ id: todos.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Completion-Log -- abhaken pro Tag
// ---------------------------------------------------------------------------

export async function listCompletions(
  startISO: string,
  endISO: string,
): Promise<TodoCompletion[]> {
  return db
    .select()
    .from(todoCompletions)
    .where(
      and(
        gte(todoCompletions.date, startISO),
        lte(todoCompletions.date, endISO),
      ),
    );
}

// Alle Erledigungen einer Aufgabe (fuer einmalige Aufgaben: done = mind. 1 Zeile).
export async function listCompletionsFor(todoId: string): Promise<TodoCompletion[]> {
  return db
    .select()
    .from(todoCompletions)
    .where(eq(todoCompletions.todoId, todoId));
}

// Alle Erledigungen (Single-User -> Tabelle klein). Fuer die Heute-Ansicht, die
// "heute erledigt" (datumsgenau) und "einmalig ueberhaupt erledigt" braucht.
export async function listAllCompletions(): Promise<TodoCompletion[]> {
  return db.select().from(todoCompletions);
}

// Abhaken: idempotent (UNIQUE (todo_id, date) -> Doppel-Haken ignoriert).
export async function completeTodo(
  todoId: string,
  dateISO: string,
): Promise<TodoCompletion | undefined> {
  const [row] = await db
    .insert(todoCompletions)
    .values({ todoId, date: dateISO })
    .onConflictDoNothing()
    .returning();
  return row;
}

// Haken entfernen fuer (Aufgabe, Tag).
export async function uncompleteTodo(
  todoId: string,
  dateISO: string,
): Promise<boolean> {
  const rows = await db
    .delete(todoCompletions)
    .where(
      and(
        eq(todoCompletions.todoId, todoId),
        eq(todoCompletions.date, dateISO),
      ),
    )
    .returning({ id: todoCompletions.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Validierung -- nimmt unbekannten JSON-Body, gibt typisierte Daten oder Fehler.
// ---------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/; // HH:MM(:SS)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
const PRIORITIES = ["none", "low", "medium", "high"] as const;
type Priority = (typeof PRIORITIES)[number];

function isObj(b: unknown): b is Record<string, unknown> {
  return typeof b === "object" && b !== null && !Array.isArray(b);
}
function nonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// Validiert einen RRULE-String (RFC 5545) ueber rrule.js. Akzeptiert mit oder
// ohne "RRULE:"-Praefix; verlangt ein FREQ. Gibt den normalisierten reinen
// RRULE-Body (ohne Praefix) zurueck oder einen Fehler.
export function validateRrule(input: string): Parsed<string> {
  const body = input.trim().replace(/^RRULE:/i, "");
  if (!/\bFREQ=/i.test(body)) return { ok: false, error: "rrule must contain FREQ" };
  try {
    RRule.parseString(body);
  } catch {
    return { ok: false, error: "rrule is not a valid RFC-5545 rule" };
  }
  return { ok: true, value: body };
}

export function parseNewTodo(body: unknown): Parsed<NewTodo> {
  if (!isObj(body)) return { ok: false, error: "body must be an object" };
  if (!nonEmptyStr(body.title)) return { ok: false, error: "title is required" };

  const value: NewTodo = { title: body.title.trim() };

  if (body.notes !== undefined) value.notes = body.notes === null ? null : String(body.notes);
  if (body.color !== undefined) value.color = body.color === null ? null : String(body.color);

  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority as Priority))
      return { ok: false, error: "priority must be none|low|medium|high" };
    value.priority = body.priority as Priority;
  }

  if (body.rrule !== undefined && body.rrule !== null) {
    if (!nonEmptyStr(body.rrule)) return { ok: false, error: "rrule must be a string" };
    const r = validateRrule(body.rrule);
    if (!r.ok) return r;
    value.rrule = r.value;
  }

  if (body.dueDate !== undefined && body.dueDate !== null) {
    if (!nonEmptyStr(body.dueDate) || !DATE_RE.test(body.dueDate))
      return { ok: false, error: "dueDate must be YYYY-MM-DD" };
    value.dueDate = body.dueDate;
  }

  if (body.scheduledTime !== undefined && body.scheduledTime !== null) {
    if (!nonEmptyStr(body.scheduledTime) || !TIME_RE.test(body.scheduledTime))
      return { ok: false, error: "scheduledTime must be HH:MM" };
    value.scheduledTime = body.scheduledTime;
  }

  if (body.estMinutes !== undefined && body.estMinutes !== null) {
    if (!Number.isInteger(body.estMinutes) || (body.estMinutes as number) < 1)
      return { ok: false, error: "estMinutes must be an integer >= 1" };
    value.estMinutes = body.estMinutes as number;
  }

  return { ok: true, value };
}

export function parseTodoPatch(body: unknown): Parsed<Partial<NewTodo>> {
  if (!isObj(body)) return { ok: false, error: "body must be an object" };
  const patch: Partial<NewTodo> = {};

  if (body.title !== undefined) {
    if (!nonEmptyStr(body.title)) return { ok: false, error: "title must be a non-empty string" };
    patch.title = body.title.trim();
  }
  if (body.notes !== undefined) patch.notes = body.notes === null ? null : String(body.notes);
  if (body.color !== undefined) patch.color = body.color === null ? null : String(body.color);

  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority as Priority))
      return { ok: false, error: "priority must be none|low|medium|high" };
    patch.priority = body.priority as Priority;
  }

  if (body.rrule !== undefined) {
    if (body.rrule === null) {
      patch.rrule = null; // -> wird wieder einmalige Aufgabe
    } else {
      if (!nonEmptyStr(body.rrule)) return { ok: false, error: "rrule must be a string or null" };
      const r = validateRrule(body.rrule);
      if (!r.ok) return r;
      patch.rrule = r.value;
    }
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate === null) {
      patch.dueDate = null;
    } else {
      if (!nonEmptyStr(body.dueDate) || !DATE_RE.test(body.dueDate))
        return { ok: false, error: "dueDate must be YYYY-MM-DD or null" };
      patch.dueDate = body.dueDate;
    }
  }

  if (body.scheduledTime !== undefined) {
    if (body.scheduledTime === null) {
      patch.scheduledTime = null;
    } else {
      if (!nonEmptyStr(body.scheduledTime) || !TIME_RE.test(body.scheduledTime))
        return { ok: false, error: "scheduledTime must be HH:MM or null" };
      patch.scheduledTime = body.scheduledTime;
    }
  }

  if (body.estMinutes !== undefined) {
    if (body.estMinutes === null) {
      patch.estMinutes = null;
    } else {
      if (!Number.isInteger(body.estMinutes) || (body.estMinutes as number) < 1)
        return { ok: false, error: "estMinutes must be an integer >= 1 or null" };
      patch.estMinutes = body.estMinutes as number;
    }
  }

  return { ok: true, value: patch };
}

// Body fuer den Completion-Toggle: { date: "YYYY-MM-DD" }.
export function parseCompletionDate(body: unknown): Parsed<string> {
  if (!isObj(body)) return { ok: false, error: "body must be an object" };
  if (!nonEmptyStr(body.date) || !DATE_RE.test(body.date))
    return { ok: false, error: "date must be YYYY-MM-DD" };
  return { ok: true, value: body.date };
}
