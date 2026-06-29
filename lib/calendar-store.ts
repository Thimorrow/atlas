import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  routines,
  manualEvents,
  type NewRoutine,
  type Routine,
  type NewManualEvent,
  type ManualEvent,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// CRUD -- Routinen
// ---------------------------------------------------------------------------

export async function listRoutines(): Promise<Routine[]> {
  return db.select().from(routines);
}

export async function createRoutine(data: NewRoutine): Promise<Routine> {
  const [row] = await db.insert(routines).values(data).returning();
  return row;
}

export async function updateRoutine(
  id: string,
  patch: Partial<NewRoutine>,
): Promise<Routine | undefined> {
  const [row] = await db
    .update(routines)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(routines.id, id))
    .returning();
  return row;
}

export async function deleteRoutine(id: string): Promise<boolean> {
  const rows = await db
    .delete(routines)
    .where(eq(routines.id, id))
    .returning({ id: routines.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// CRUD -- Manuelle Events
// ---------------------------------------------------------------------------

export async function listManualEvents(): Promise<ManualEvent[]> {
  return db.select().from(manualEvents);
}

export async function createManualEvent(data: NewManualEvent): Promise<ManualEvent> {
  const [row] = await db.insert(manualEvents).values(data).returning();
  return row;
}

export async function updateManualEvent(
  id: string,
  patch: Partial<NewManualEvent>,
): Promise<ManualEvent | undefined> {
  const [row] = await db
    .update(manualEvents)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(manualEvents.id, id))
    .returning();
  return row;
}

export async function deleteManualEvent(id: string): Promise<boolean> {
  const rows = await db
    .delete(manualEvents)
    .where(eq(manualEvents.id, id))
    .returning({ id: manualEvents.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Validierung -- nimmt unbekannten JSON-Body, gibt typisierte Insert-Daten
// oder einen Fehlertext zurueck. Routen bleiben dadurch duenn.
// ---------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/; // HH:MM oder HH:MM:SS
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

// Ganztags-Events haben keine echte Uhrzeit. Da start/end in der DB notNull sind,
// stecken wir Platzhalter rein; Rendering + FreeSlots ignorieren allDay-Events.
const ALL_DAY_START = "00:00";
const ALL_DAY_END = "23:59";

function isObj(b: unknown): b is Record<string, unknown> {
  return typeof b === "object" && b !== null && !Array.isArray(b);
}
function nonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function parseNewRoutine(body: unknown): Parsed<NewRoutine> {
  if (!isObj(body)) return { ok: false, error: "body must be an object" };
  if (!nonEmptyStr(body.title)) return { ok: false, error: "title is required" };
  if (body.type !== "fixed" && body.type !== "flexible_goal")
    return { ok: false, error: "type must be 'fixed' or 'flexible_goal'" };

  const value: NewRoutine = { title: body.title.trim(), type: body.type };

  if (body.color !== undefined) {
    if (!nonEmptyStr(body.color)) return { ok: false, error: "color must be a string" };
    value.color = body.color;
  }
  if (body.location !== undefined) value.location = body.location === null ? null : String(body.location);

  if (body.type === "fixed") {
    if (!Number.isInteger(body.weekday) || (body.weekday as number) < 0 || (body.weekday as number) > 6)
      return { ok: false, error: "weekday must be an integer 0..6 (0=Mon)" };
    const allDay = body.allDay === true;
    value.weekday = body.weekday as number;
    value.allDay = allDay;
    if (allDay) {
      value.startTime = ALL_DAY_START;
      value.endTime = ALL_DAY_END;
      value.openEnded = false;
    } else {
      if (!nonEmptyStr(body.startTime) || !TIME_RE.test(body.startTime))
        return { ok: false, error: "startTime must be HH:MM (or set allDay:true)" };
      const openEnded = body.openEnded === true;
      if (!openEnded && (!nonEmptyStr(body.endTime) || !TIME_RE.test(body.endTime)))
        return { ok: false, error: "endTime must be HH:MM (or set openEnded:true)" };
      value.startTime = body.startTime;
      value.endTime = openEnded ? null : (body.endTime as string);
      value.openEnded = openEnded;
    }
  } else {
    if (!Number.isInteger(body.targetPerWeek) || (body.targetPerWeek as number) < 1)
      return { ok: false, error: "targetPerWeek must be an integer >= 1" };
    value.targetPerWeek = body.targetPerWeek as number;
  }

  return { ok: true, value };
}

export function parseRoutinePatch(body: unknown): Parsed<Partial<NewRoutine>> {
  if (!isObj(body)) return { ok: false, error: "body must be an object" };
  const patch: Partial<NewRoutine> = {};

  if (body.title !== undefined) {
    if (!nonEmptyStr(body.title)) return { ok: false, error: "title must be a non-empty string" };
    patch.title = body.title.trim();
  }
  if (body.color !== undefined) patch.color = body.color === null ? null : String(body.color);
  if (body.location !== undefined) patch.location = body.location === null ? null : String(body.location);
  if (body.allDay !== undefined) {
    if (typeof body.allDay !== "boolean") return { ok: false, error: "allDay must be boolean" };
    patch.allDay = body.allDay;
    if (body.allDay) {
      patch.startTime = ALL_DAY_START;
      patch.endTime = ALL_DAY_END;
      patch.openEnded = false;
    }
  }
  if (body.weekday !== undefined) {
    if (!Number.isInteger(body.weekday) || (body.weekday as number) < 0 || (body.weekday as number) > 6)
      return { ok: false, error: "weekday must be an integer 0..6" };
    patch.weekday = body.weekday as number;
  }
  if (body.startTime !== undefined) {
    if (!nonEmptyStr(body.startTime) || !TIME_RE.test(body.startTime))
      return { ok: false, error: "startTime must be HH:MM" };
    patch.startTime = body.startTime;
  }
  if (body.endTime !== undefined) {
    if (body.endTime !== null && (!nonEmptyStr(body.endTime) || !TIME_RE.test(body.endTime)))
      return { ok: false, error: "endTime must be HH:MM or null" };
    patch.endTime = body.endTime as string | null;
  }
  if (body.openEnded !== undefined) {
    if (typeof body.openEnded !== "boolean") return { ok: false, error: "openEnded must be boolean" };
    patch.openEnded = body.openEnded;
  }
  if (body.targetPerWeek !== undefined) {
    if (!Number.isInteger(body.targetPerWeek) || (body.targetPerWeek as number) < 1)
      return { ok: false, error: "targetPerWeek must be an integer >= 1" };
    patch.targetPerWeek = body.targetPerWeek as number;
  }

  return { ok: true, value: patch };
}

export function parseNewManualEvent(body: unknown): Parsed<NewManualEvent> {
  if (!isObj(body)) return { ok: false, error: "body must be an object" };
  if (!nonEmptyStr(body.title)) return { ok: false, error: "title is required" };
  if (!nonEmptyStr(body.date) || !DATE_RE.test(body.date))
    return { ok: false, error: "date must be YYYY-MM-DD" };

  const allDay = body.allDay === true;
  if (!allDay) {
    if (!nonEmptyStr(body.startTime) || !TIME_RE.test(body.startTime))
      return { ok: false, error: "startTime must be HH:MM (or set allDay:true)" };
    if (!nonEmptyStr(body.endTime) || !TIME_RE.test(body.endTime))
      return { ok: false, error: "endTime must be HH:MM (or set allDay:true)" };
  }

  const value: NewManualEvent = {
    title: body.title.trim(),
    date: body.date,
    startTime: allDay ? ALL_DAY_START : (body.startTime as string),
    endTime: allDay ? ALL_DAY_END : (body.endTime as string),
    allDay,
  };
  if (body.color !== undefined) value.color = body.color === null ? null : String(body.color);
  if (body.location !== undefined) value.location = body.location === null ? null : String(body.location);
  if (body.notes !== undefined) value.notes = body.notes === null ? null : String(body.notes);
  return { ok: true, value };
}

export function parseManualEventPatch(body: unknown): Parsed<Partial<NewManualEvent>> {
  if (!isObj(body)) return { ok: false, error: "body must be an object" };
  const patch: Partial<NewManualEvent> = {};

  if (body.title !== undefined) {
    if (!nonEmptyStr(body.title)) return { ok: false, error: "title must be a non-empty string" };
    patch.title = body.title.trim();
  }
  if (body.date !== undefined) {
    if (!nonEmptyStr(body.date) || !DATE_RE.test(body.date))
      return { ok: false, error: "date must be YYYY-MM-DD" };
    patch.date = body.date;
  }
  if (body.startTime !== undefined) {
    if (!nonEmptyStr(body.startTime) || !TIME_RE.test(body.startTime))
      return { ok: false, error: "startTime must be HH:MM" };
    patch.startTime = body.startTime;
  }
  if (body.endTime !== undefined) {
    if (!nonEmptyStr(body.endTime) || !TIME_RE.test(body.endTime))
      return { ok: false, error: "endTime must be HH:MM" };
    patch.endTime = body.endTime;
  }
  if (body.allDay !== undefined) {
    if (typeof body.allDay !== "boolean") return { ok: false, error: "allDay must be boolean" };
    patch.allDay = body.allDay;
    if (body.allDay) {
      patch.startTime = ALL_DAY_START;
      patch.endTime = ALL_DAY_END;
    }
  }
  if (body.color !== undefined) patch.color = body.color === null ? null : String(body.color);
  if (body.location !== undefined) patch.location = body.location === null ? null : String(body.location);
  if (body.notes !== undefined) patch.notes = body.notes === null ? null : String(body.notes);

  return { ok: true, value: patch };
}
