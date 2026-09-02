// Faecher, Fach-Notizen und die daran haengenden Lesequeries.
//
// subjects ist die einzige Stelle, an der ein Untis-Fach zu einem "echten"
// Fach der App wird: ensureSubjectForUntis legt es still an, sobald eine
// Aufgabe darauf zeigt. Abgewaehlte Faecher werden archiviert, nie geloescht,
// sonst legt der naechste Sync sie wieder an.

import { and, asc, eq, gte, isNull, isNotNull, sql, getTableColumns } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  schoolBlocks,
  subjectNotes,
  subjects,
  type NewSubject,
  type NewSubjectNote,
  type Subject,
  type SubjectNote,
} from "@/lib/db/schema";
import { SUBJECT_COLORS, defaultColorFor } from "@/lib/subject-colors";
import { ORAL_WEIGHT_PRESETS } from "@/lib/grades";

// --- DTOs --------------------------------------------------------------------

export type SubjectDTO = {
  id: string;
  name: string;
  untisSubject: string | null;
  teacher: string | null;
  room: string | null;
  color: string | null; // Token aus SUBJECT_COLORS
  onenoteSectionId: string | null;
  onenoteSectionName: string | null; // "Notizbuch / Abschnitt", nur zur Anzeige
  oralWeight: number; // Anteil muendlich am Fachschnitt, in Prozent
  archivedAt: string | null; // ISO
  openAssignments: number;
  noteCount: number;
};

export type NoteDTO = {
  id: string;
  subjectId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type LessonDTO = {
  id: string;
  date: string;
  startTime: string; // HH:MM
  endTime: string | null; // HH:MM
  room: string | null;
  teacher: string | null;
  status: "regular" | "cancelled" | "substituted";
  substitutionText: string | null;
};

export type SubjectScope = "active" | "archived" | "all";

// --- Lesen -------------------------------------------------------------------

// Zaehler als korrelierte Subqueries statt einer Runde pro Fach (kein N+1).
// Bewusst ausgeschriebene Spaltennamen: eingesetzte Drizzle-Spalten rendern in
// dieser Position ohne Tabellen-Praefix, "id" wuerde dann im Subselect auf die
// falsche Tabelle zeigen.
const openAssignmentsSql = sql<number>`(
  select count(*) from assignments
  where assignments.subject_id = subjects.id and assignments.completed_at is null
)`.mapWith(Number);

const noteCountSql = sql<number>`(
  select count(*) from subject_notes where subject_notes.subject_id = subjects.id
)`.mapWith(Number);

type SubjectRow = Subject & { openAssignments: number; noteCount: number };

function toSubjectDTO(row: SubjectRow): SubjectDTO {
  return {
    id: row.id,
    name: row.name,
    untisSubject: row.untisSubject,
    teacher: row.teacher,
    room: row.room,
    color: row.color,
    onenoteSectionId: row.onenoteSectionId,
    onenoteSectionName: row.onenoteSectionName,
    oralWeight: row.oralWeight,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    openAssignments: row.openAssignments,
    noteCount: row.noteCount,
  };
}

export async function listSubjects(scope: SubjectScope = "active"): Promise<SubjectDTO[]> {
  const base = db
    .select({
      ...getTableColumns(subjects),
      openAssignments: openAssignmentsSql,
      noteCount: noteCountSql,
    })
    .from(subjects);

  const rows =
    scope === "all"
      ? await base.orderBy(asc(subjects.name))
      : await base
          .where(
            scope === "archived" ? isNotNull(subjects.archivedAt) : isNull(subjects.archivedAt),
          )
          .orderBy(asc(subjects.name));

  return rows.map(toSubjectDTO);
}

export async function getSubject(id: string): Promise<SubjectDTO | undefined> {
  const [row] = await db
    .select({
      ...getTableColumns(subjects),
      openAssignments: openAssignmentsSql,
      noteCount: noteCountSql,
    })
    .from(subjects)
    .where(eq(subjects.id, id));
  return row ? toSubjectDTO(row) : undefined;
}

const hm = (t: string | null): string | null => (t ? t.slice(0, 5) : null);

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Die naechsten Termine des Fachs aus dem Stundenplan. Ohne untisSubject wird
// der Fachname als Untis-Wert probiert -- manuelle Faecher heissen meist gleich.
export async function upcomingLessons(
  subject: Pick<Subject, "name" | "untisSubject">,
  limit = 5,
): Promise<LessonDTO[]> {
  const key = subject.untisSubject ?? subject.name;
  const rows = await db
    .select()
    .from(schoolBlocks)
    .where(and(eq(schoolBlocks.subject, key), gte(schoolBlocks.date, todayISO())))
    .orderBy(asc(schoolBlocks.date), asc(schoolBlocks.startTime))
    .limit(limit);

  return rows.map((b) => ({
    id: b.id,
    date: b.date,
    startTime: hm(b.startTime)!,
    endTime: hm(b.endTime),
    room: b.room,
    teacher: b.teacher,
    status: b.status,
    substitutionText: b.substitutionText,
  }));
}

// Alle Untis-Faecher, die im Stundenplan vorkommen -- Vorlage fuer das Setup.
// subject ist NOT NULL, die Liste ist also genau dann leer, wenn es ueberhaupt
// keine Stunden gibt.
export async function candidateSubjects(): Promise<{
  candidates: string[];
  hasBlocks: boolean;
}> {
  const rows = await db
    .selectDistinct({ subject: schoolBlocks.subject })
    .from(schoolBlocks)
    .orderBy(asc(schoolBlocks.subject));
  const candidates = rows.map((r) => r.subject);
  return { candidates, hasBlocks: candidates.length > 0 };
}

// --- Schreiben ---------------------------------------------------------------

export async function createSubject(data: NewSubject): Promise<Subject> {
  const [row] = await db.insert(subjects).values(data).returning();
  return row;
}

export async function updateSubject(
  id: string,
  patch: Partial<NewSubject>,
): Promise<Subject | undefined> {
  const [row] = await db
    .update(subjects)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(subjects.id, id))
    .returning();
  return row;
}

export async function deleteSubject(id: string): Promise<boolean> {
  const rows = await db
    .delete(subjects)
    .where(eq(subjects.id, id))
    .returning({ id: subjects.id });
  return rows.length > 0;
}

// Fach zu einem Untis-Wert holen und, falls es keins gibt, still anlegen.
// Ein archiviertes Fach wird zurueckgegeben, aber NICHT reaktiviert: wer es
// abgewaehlt hat, will es nicht durch eine Aufgabe zurueckbekommen.
export async function ensureSubjectForUntis(untisSubject: string): Promise<Subject> {
  const key = untisSubject.trim();
  const [existing] = await db.select().from(subjects).where(eq(subjects.untisSubject, key));
  if (existing) return existing;

  const [created] = await db
    .insert(subjects)
    .values({ name: key, untisSubject: key, color: defaultColorFor(key) })
    .onConflictDoNothing({ target: subjects.untisSubject })
    .returning();
  if (created) return created;

  // Parallel angelegt -- die Zeile des anderen Laufs gewinnt.
  const [raced] = await db.select().from(subjects).where(eq(subjects.untisSubject, key));
  return raced;
}

// Setup: ausgewaehlte Faecher aktiv, der Rest archiviert. Idempotent ueber
// untis_subject, ein zweiter Lauf aendert an bestehenden Faechern nichts.
export async function setupSubjects(selected: string[], all: string[]): Promise<SubjectDTO[]> {
  const selectedSet = new Set(selected);
  const names = Array.from(new Set([...all, ...selected]));
  const now = new Date();

  if (names.length > 0) {
    await db
      .insert(subjects)
      .values(
        names.map((name) => ({
          name,
          untisSubject: name,
          color: defaultColorFor(name),
          archivedAt: selectedSet.has(name) ? null : now,
        })),
      )
      .onConflictDoNothing({ target: subjects.untisSubject });
  }

  return listSubjects("all");
}

// --- Notizen -----------------------------------------------------------------

function toNoteDTO(row: SubjectNote): NoteDTO {
  return {
    id: row.id,
    subjectId: row.subjectId,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listNotes(subjectId: string): Promise<NoteDTO[]> {
  const rows = await db
    .select()
    .from(subjectNotes)
    .where(eq(subjectNotes.subjectId, subjectId))
    .orderBy(sql`${subjectNotes.updatedAt} desc`);
  return rows.map(toNoteDTO);
}

export async function getNote(id: string): Promise<NoteDTO | undefined> {
  const [row] = await db.select().from(subjectNotes).where(eq(subjectNotes.id, id));
  return row ? toNoteDTO(row) : undefined;
}

export async function createNote(data: NewSubjectNote): Promise<NoteDTO> {
  const [row] = await db.insert(subjectNotes).values(data).returning();
  return toNoteDTO(row);
}

export async function updateNote(
  id: string,
  patch: Partial<NewSubjectNote>,
): Promise<NoteDTO | undefined> {
  const [row] = await db
    .update(subjectNotes)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(subjectNotes.id, id))
    .returning();
  return row ? toNoteDTO(row) : undefined;
}

export async function deleteNote(id: string): Promise<boolean> {
  const rows = await db
    .delete(subjectNotes)
    .where(eq(subjectNotes.id, id))
    .returning({ id: subjectNotes.id });
  return rows.length > 0;
}

// --- Validierung -------------------------------------------------------------
// Nimmt unbekannten JSON-Body, gibt typisierte Daten oder eine deutsche
// Fehlermeldung fuer die 400-Antwort.

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const COLOR_TOKENS = SUBJECT_COLORS.map((c) => c.token as string);

export function isObj(b: unknown): b is Record<string, unknown> {
  return typeof b === "object" && b !== null && !Array.isArray(b);
}

export function nonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// Route-Params vorab pruefen: Postgres wirft bei kaputter UUID einen Fehler,
// eine unbekannte id soll aber 404 geben, nie 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

// Die Gewichtung muendlich/schriftlich nimmt nur die Presets an: alles andere
// waere eine Einstellung, die der Nutzer nie wieder findet.
export function parseOralWeight(v: unknown): Parsed<number> {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  if (typeof n !== "number" || !(ORAL_WEIGHT_PRESETS as readonly number[]).includes(n))
    return { ok: false, error: `Gewichtung muss ${ORAL_WEIGHT_PRESETS.join(" oder ")} sein.` };
  return { ok: true, value: n };
}

// null loescht die Farbe, alles andere muss ein Token aus SUBJECT_COLORS sein.
function parseColor(v: unknown): Parsed<string | null> {
  if (v === null) return { ok: true, value: null };
  if (typeof v !== "string" || !COLOR_TOKENS.includes(v))
    return { ok: false, error: "Farbe ist kein gültiger Farbwert." };
  return { ok: true, value: v };
}

// Optionales Textfeld: null oder leerer String raeumen es weg.
function optionalText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export function parseNewSubject(body: unknown): Parsed<NewSubject> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  if (!nonEmptyStr(body.name)) return { ok: false, error: "Name darf nicht leer sein." };

  const value: NewSubject = { name: body.name.trim() };

  if (body.teacher !== undefined) value.teacher = optionalText(body.teacher);
  if (body.room !== undefined) value.room = optionalText(body.room);
  if (body.untisSubject !== undefined) value.untisSubject = optionalText(body.untisSubject);

  if (body.color !== undefined) {
    const c = parseColor(body.color);
    if (!c.ok) return c;
    value.color = c.value;
  } else {
    value.color = defaultColorFor(value.name);
  }

  return { ok: true, value };
}

export function parseSubjectPatch(body: unknown): Parsed<Partial<NewSubject>> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  const patch: Partial<NewSubject> = {};

  if (body.name !== undefined) {
    if (!nonEmptyStr(body.name)) return { ok: false, error: "Name darf nicht leer sein." };
    patch.name = body.name.trim();
  }
  if (body.teacher !== undefined) patch.teacher = optionalText(body.teacher);
  if (body.room !== undefined) patch.room = optionalText(body.room);

  if (body.color !== undefined) {
    const c = parseColor(body.color);
    if (!c.ok) return c;
    patch.color = c.value;
  }

  // OneNote-Ziel: id und Anzeigename gehoeren zusammen, null loest die
  // Verknuepfung. Nur eines von beiden zu setzen ergaebe eine Zeile, die auf
  // einen Abschnitt zeigt, den die Oberflaeche nicht benennen kann.
  if (body.onenoteSectionId !== undefined) {
    if (body.onenoteSectionId === null) {
      patch.onenoteSectionId = null;
      patch.onenoteSectionName = null;
    } else if (nonEmptyStr(body.onenoteSectionId) && nonEmptyStr(body.onenoteSectionName)) {
      patch.onenoteSectionId = body.onenoteSectionId.trim();
      patch.onenoteSectionName = body.onenoteSectionName.trim();
    } else {
      return { ok: false, error: "Der OneNote-Abschnitt ist unvollständig." };
    }
  }

  // Gewichtung muendlich/schriftlich. Die erlaubten Werte stehen bei den Noten
  // (lib/grades.ts), damit Rechnung und Eingabe nicht auseinanderlaufen.
  if (body.oralWeight !== undefined) {
    const w = parseOralWeight(body.oralWeight);
    if (!w.ok) return w;
    patch.oralWeight = w.value;
  }

  // "now" archiviert, null reaktiviert -- der Client muss keine Uhrzeit kennen.
  if (body.archivedAt !== undefined) {
    if (body.archivedAt === null) {
      patch.archivedAt = null;
    } else if (body.archivedAt === "now") {
      patch.archivedAt = new Date();
    } else {
      return { ok: false, error: "archivedAt muss null oder \"now\" sein." };
    }
  }

  return { ok: true, value: patch };
}

export function parseNewNote(body: unknown, subjectId: string): Parsed<NewSubjectNote> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  if (!nonEmptyStr(body.title)) return { ok: false, error: "Titel darf nicht leer sein." };
  return {
    ok: true,
    value: {
      subjectId,
      title: body.title.trim(),
      body: body.body === undefined || body.body === null ? "" : String(body.body),
    },
  };
}

export function parseNotePatch(body: unknown): Parsed<Partial<NewSubjectNote>> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  const patch: Partial<NewSubjectNote> = {};
  if (body.title !== undefined) {
    if (!nonEmptyStr(body.title)) return { ok: false, error: "Titel darf nicht leer sein." };
    patch.title = body.title.trim();
  }
  if (body.body !== undefined) patch.body = body.body === null ? "" : String(body.body);
  return { ok: true, value: patch };
}

// { selected: string[], all: string[] } fuer das Setup.
export function parseSetupBody(body: unknown): Parsed<{ selected: string[]; all: string[] }> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  const asNames = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null;
    if (!v.every((x) => nonEmptyStr(x))) return null;
    return (v as string[]).map((x) => x.trim());
  };
  const selected = asNames(body.selected ?? []);
  const all = asNames(body.all ?? []);
  if (!selected || !all)
    return { ok: false, error: "selected und all müssen Listen von Fachnamen sein." };
  return { ok: true, value: { selected, all } };
}
