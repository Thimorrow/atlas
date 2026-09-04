// Aufgaben (Hausaufgaben, Klassenarbeiten, Referate ...) mit dem gejointen
// Fach. Die Gruppierung liegt bewusst in lib/assignments-view.ts -- hier steht
// nur, was aus der DB kommt.

import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignments,
  subjects,
  type NewAssignment,
} from "@/lib/db/schema";
import {
  ASSIGNMENT_TYPES,
  type AssignmentDTO,
  type AssignmentType,
} from "@/lib/assignments-view";
import { normalizeSubject } from "@/lib/untis/adapter";
import {
  ensureSubjectForUntis,
  isObj,
  nonEmptyStr,
  type Parsed,
} from "@/lib/subject-store";

// --- Lesen -------------------------------------------------------------------

const dtoColumns = {
  id: assignments.id,
  subjectId: assignments.subjectId,
  subjectName: subjects.name,
  subjectColor: subjects.color,
  type: assignments.type,
  title: assignments.title,
  notes: assignments.notes,
  dueDate: assignments.dueDate,
  completedAt: assignments.completedAt,
};

type Row = {
  id: string;
  subjectId: string | null;
  subjectName: string | null;
  subjectColor: string | null;
  type: AssignmentType;
  title: string;
  notes: string | null;
  dueDate: string | null;
  completedAt: Date | null;
};

function toDTO(row: Row): AssignmentDTO {
  return {
    id: row.id,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    subjectColor: row.subjectColor,
    type: row.type,
    title: row.title,
    notes: row.notes,
    dueDate: row.dueDate,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

// Offene Aufgaben immer vollstaendig; Erledigte nur die letzten 30 Tage, sonst
// waechst die Liste ewig weiter.
export async function listAssignments(
  opts: { includeCompleted?: boolean; subjectId?: string } = {},
): Promise<AssignmentDTO[]> {
  const open = isNull(assignments.completedAt);
  const scope = opts.includeCompleted
    ? or(open, gte(assignments.completedAt, daysAgo(30)))
    : open;

  const where = opts.subjectId
    ? and(scope, eq(assignments.subjectId, opts.subjectId))
    : scope;

  const rows = await db
    .select(dtoColumns)
    .from(assignments)
    .leftJoin(subjects, eq(assignments.subjectId, subjects.id))
    .where(where)
    .orderBy(
      // Offene zuerst, danach die zuletzt Erledigten.
      sql`${assignments.completedAt} is not null`,
      desc(assignments.completedAt),
      sql`${assignments.dueDate} asc nulls last`,
      asc(assignments.title),
    );

  return rows.map(toDTO);
}

// Fuer den Stundenplan (lib/calendar-expand.ts): welche Schulstunden haben
// eine offene Aufgabe, die genau an ihnen faellig ist? Es gibt keine direkte
// Verknuepfung zwischen Aufgabe und Schulstunde (kein schoolBlockId an
// assignments) -- der Treffer entsteht ueber Datum + Fach, genau wie eine
// Aufgabe heute schon im Tages-Datum landet (DayDueRow). Ein Query fuer die
// ganze uebergebene Spanne statt eins pro Block.
export async function assignmentDueBlockIds(
  blocks: { id: string; date: string; subject: string }[],
): Promise<Set<string>> {
  if (blocks.length === 0) return new Set();
  const dates = [...new Set(blocks.map((b) => b.date))];

  const rows = await db
    .select({
      dueDate: assignments.dueDate,
      untisSubject: subjects.untisSubject,
      subjectName: subjects.name,
    })
    .from(assignments)
    .innerJoin(subjects, eq(assignments.subjectId, subjects.id))
    .where(and(isNull(assignments.completedAt), inArray(assignments.dueDate, dates)));

  // Datum -> Menge moeglicher (normalisierter) Fachnamen an diesem Tag.
  const subjectsPerDate = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.dueDate) continue;
    const set = subjectsPerDate.get(r.dueDate) ?? new Set<string>();
    if (r.untisSubject) set.add(normalizeSubject(r.untisSubject));
    if (r.subjectName) set.add(normalizeSubject(r.subjectName));
    subjectsPerDate.set(r.dueDate, set);
  }

  const out = new Set<string>();
  for (const b of blocks) {
    if (subjectsPerDate.get(b.date)?.has(normalizeSubject(b.subject))) out.add(b.id);
  }
  return out;
}

export async function getAssignment(id: string): Promise<AssignmentDTO | undefined> {
  const [row] = await db
    .select(dtoColumns)
    .from(assignments)
    .leftJoin(subjects, eq(assignments.subjectId, subjects.id))
    .where(eq(assignments.id, id));
  return row ? toDTO(row) : undefined;
}

// --- Schreiben ---------------------------------------------------------------

export async function createAssignment(data: NewAssignment): Promise<AssignmentDTO> {
  const [row] = await db.insert(assignments).values(data).returning({ id: assignments.id });
  return (await getAssignment(row.id))!;
}

export async function updateAssignment(
  id: string,
  patch: Partial<NewAssignment>,
): Promise<AssignmentDTO | undefined> {
  const [row] = await db
    .update(assignments)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(assignments.id, id))
    .returning({ id: assignments.id });
  return row ? getAssignment(row.id) : undefined;
}

export async function deleteAssignment(id: string): Promise<boolean> {
  const rows = await db
    .delete(assignments)
    .where(eq(assignments.id, id))
    .returning({ id: assignments.id });
  return rows.length > 0;
}

// Abhaken ist idempotent: der zweite Aufruf laesst completedAt stehen und gibt
// die Aufgabe unveraendert zurueck, statt zu meckern.
export async function completeAssignment(id: string): Promise<AssignmentDTO | undefined> {
  await db
    .update(assignments)
    .set({ completedAt: new Date(), updatedAt: sql`now()` })
    .where(and(eq(assignments.id, id), isNull(assignments.completedAt)));
  return getAssignment(id);
}

export async function uncompleteAssignment(id: string): Promise<AssignmentDTO | undefined> {
  const [row] = await db
    .update(assignments)
    .set({ completedAt: null, updatedAt: sql`now()` })
    .where(eq(assignments.id, id))
    .returning({ id: assignments.id });
  return row ? getAssignment(row.id) : undefined;
}

// --- Validierung -------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseType(v: unknown): Parsed<AssignmentType> {
  if (typeof v !== "string" || !ASSIGNMENT_TYPES.includes(v as AssignmentType))
    return { ok: false, error: "Typ ist kein gueltiger Aufgabentyp." };
  return { ok: true, value: v as AssignmentType };
}

function parseDueDate(v: unknown): Parsed<string | null> {
  if (v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || !DATE_RE.test(v))
    return { ok: false, error: "Faelligkeitsdatum muss im Format JJJJ-MM-TT sein." };
  return { ok: true, value: v };
}

function parseSubjectId(v: unknown): Parsed<string | null> {
  if (v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || !UUID_RE.test(v))
    return { ok: false, error: "subjectId ist keine gueltige Fach-ID." };
  return { ok: true, value: v };
}

// untisSubject legt das Fach still an, wenn es noch keins gibt -- deshalb ist
// das Parsen hier async.
export async function parseNewAssignment(body: unknown): Promise<Parsed<NewAssignment>> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  if (!nonEmptyStr(body.title)) return { ok: false, error: "Titel darf nicht leer sein." };

  const value: NewAssignment = { title: body.title.trim() };

  if (body.type !== undefined) {
    const t = parseType(body.type);
    if (!t.ok) return t;
    value.type = t.value;
  }

  if (body.dueDate !== undefined) {
    const d = parseDueDate(body.dueDate);
    if (!d.ok) return d;
    value.dueDate = d.value;
  }

  if (body.notes !== undefined)
    value.notes = body.notes === null ? null : String(body.notes);

  if (body.subjectId !== undefined) {
    const s = parseSubjectId(body.subjectId);
    if (!s.ok) return s;
    value.subjectId = s.value;
  }

  if (!value.subjectId && nonEmptyStr(body.untisSubject)) {
    const subject = await ensureSubjectForUntis(body.untisSubject);
    value.subjectId = subject.id;
  }

  return { ok: true, value };
}

export async function parseAssignmentPatch(
  body: unknown,
): Promise<Parsed<Partial<NewAssignment>>> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  const patch: Partial<NewAssignment> = {};

  if (body.title !== undefined) {
    if (!nonEmptyStr(body.title)) return { ok: false, error: "Titel darf nicht leer sein." };
    patch.title = body.title.trim();
  }

  if (body.type !== undefined) {
    const t = parseType(body.type);
    if (!t.ok) return t;
    patch.type = t.value;
  }

  if (body.dueDate !== undefined) {
    const d = parseDueDate(body.dueDate);
    if (!d.ok) return d;
    patch.dueDate = d.value;
  }
  // Native Clients (explicitNulls=false) koennen null nicht explizit senden:
  // clearDueDate=true loescht die Faelligkeit, auch ohne dueDate-Feld.
  if (body.clearDueDate === true) patch.dueDate = null;

  if (body.notes !== undefined) patch.notes = body.notes === null ? null : String(body.notes);

  if (body.subjectId !== undefined) {
    const s = parseSubjectId(body.subjectId);
    if (!s.ok) return s;
    patch.subjectId = s.value;
  }
  // Wie oben: clearSubject=true entkoppelt zu Allgemein (null).
  if (body.clearSubject === true) patch.subjectId = null;

  if (patch.subjectId == null && nonEmptyStr(body.untisSubject)) {
    const subject = await ensureSubjectForUntis(body.untisSubject);
    patch.subjectId = subject.id;
  }

  if (body.completedAt !== undefined) {
    if (body.completedAt !== null)
      return { ok: false, error: "completedAt laesst sich nur ueber /complete setzen." };
    patch.completedAt = null;
  }

  return { ok: true, value: patch };
}
