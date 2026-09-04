// Stundennotizen: genau ein freies Textfeld je konkreter Schulstunde
// (school_blocks-Zeile). Anders als subject_notes gibt es hier keine Liste
// und keinen Titel -- die Zeile existiert nur, solange Text drinsteht.

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { lessonNotes, schoolBlocks, subjects } from "@/lib/db/schema";

// Ueber diese Laenge hinaus ist eine Stundennotiz keine schnelle Notiz mehr --
// die Grenze schuetzt vor kaputten Requests, nicht vor legitimem langen Text.
export const MAX_BODY_LEN = 20000;

export type LessonNoteDTO = {
  id: string;
  schoolBlockId: string;
  body: string;
  updatedAt: string;
};

function toDTO(row: { id: string; schoolBlockId: string; body: string; updatedAt: Date }): LessonNoteDTO {
  return {
    id: row.id,
    schoolBlockId: row.schoolBlockId,
    body: row.body,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getLessonNote(schoolBlockId: string): Promise<LessonNoteDTO | null> {
  const [row] = await db
    .select()
    .from(lessonNotes)
    .where(eq(lessonNotes.schoolBlockId, schoolBlockId));
  return row ? toDTO(row) : null;
}

// Fach zur Stunde aufloesen -- nur fuer die Fach-Chronik, kein Fehler wenn es
// (noch) keins gibt. Gleiche Reihenfolge wie subjectFor im Stundenplan
// (app/page.tsx): erst der exakte Untis-Wert, sonst der Anzeigename. Ohne den
// Namens-Fallback blieb subjectId bei manuell angelegten Faechern (deren
// untisSubject null ist, Match nur ueber den Namen) dauerhaft null, und die
// Notiz tauchte nie im Fachdetail auf.
export async function subjectIdFor(blockSubject: string): Promise<string | null> {
  const [byUntis] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.untisSubject, blockSubject));
  if (byUntis) return byUntis.id;

  const [byName] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.name, blockSubject));
  return byName?.id ?? null;
}

// Upsert auf schoolBlockId: ein leerer (nach trim) Body loescht die Notiz statt
// eine leere Zeile stehen zu lassen -- "Notiz schreiben" bleibt geruestlos, es
// gibt keinen expliziten Loeschen-Knopf.
export async function saveLessonNote(
  schoolBlockId: string,
  body: string,
): Promise<LessonNoteDTO | null> {
  const trimmed = body.trim();
  if (!trimmed) {
    await deleteLessonNote(schoolBlockId);
    return null;
  }

  const [block] = await db.select().from(schoolBlocks).where(eq(schoolBlocks.id, schoolBlockId));
  if (!block) return null;

  const subjectId = await subjectIdFor(block.subject);

  const [row] = await db
    .insert(lessonNotes)
    .values({ schoolBlockId, subjectId, date: block.date, body })
    .onConflictDoUpdate({
      target: lessonNotes.schoolBlockId,
      set: { body, subjectId, date: block.date, updatedAt: new Date() },
    })
    .returning();
  return toDTO(row);
}

export async function deleteLessonNote(schoolBlockId: string): Promise<void> {
  await db.delete(lessonNotes).where(eq(lessonNotes.schoolBlockId, schoolBlockId));
}

export async function schoolBlockExists(id: string): Promise<boolean> {
  const [row] = await db.select({ id: schoolBlocks.id }).from(schoolBlocks).where(eq(schoolBlocks.id, id));
  return !!row;
}

// Fuer expandRange (Kalender): nur die Block-ids, die eine Notiz haben -- kein
// N+1, ein einziges Query fuer die ganze Spanne.
export async function lessonNoteBlockIds(blockIds: string[]): Promise<Set<string>> {
  if (blockIds.length === 0) return new Set();
  const rows = await db
    .select({ schoolBlockId: lessonNotes.schoolBlockId })
    .from(lessonNotes)
    .where(inArray(lessonNotes.schoolBlockId, blockIds));
  return new Set(rows.map((r) => r.schoolBlockId));
}

export type SubjectLessonNoteDTO = {
  id: string;
  schoolBlockId: string;
  date: string;
  startTime: string; // HH:MM
  body: string;
  updatedAt: string;
};

const hm = (t: string) => t.slice(0, 5);

// Stundennotizen eines Fachs, neuste zuerst. Join auf school_blocks fuer die
// Startzeit -- die date-Spalte an der Notiz ist denormalisiert und reicht fuer
// den Chronik-Header nicht, gesucht wird auch Uhrzeit.
//
// subjectId an der Notiz kann null sein, wenn die Notiz entstand, bevor es
// das Fach gab (subjectIdFor findet zu diesem Zeitpunkt noch nichts). Solche
// Notizen sollen trotzdem auftauchen, sobald ihr school_blocks.subject zum
// Fach passt -- der Aufrufer uebergibt dafuer untisSubject/name mit, ein
// zweites Query dafuer entfaellt (die Bedingung haengt einfach mit or() an
// den bestehenden Join).
export async function listSubjectLessonNotes(
  subject: { id: string; untisSubject: string | null; name: string },
  limit = 50,
): Promise<SubjectLessonNoteDTO[]> {
  const matchNames = [...new Set([subject.untisSubject, subject.name].filter((v): v is string => !!v))];
  const orphanMatch =
    matchNames.length > 0 ? and(isNull(lessonNotes.subjectId), inArray(schoolBlocks.subject, matchNames)) : undefined;

  const rows = await db
    .select({
      id: lessonNotes.id,
      schoolBlockId: lessonNotes.schoolBlockId,
      date: lessonNotes.date,
      body: lessonNotes.body,
      updatedAt: lessonNotes.updatedAt,
      startTime: schoolBlocks.startTime,
    })
    .from(lessonNotes)
    .innerJoin(schoolBlocks, eq(lessonNotes.schoolBlockId, schoolBlocks.id))
    .where(orphanMatch ? or(eq(lessonNotes.subjectId, subject.id), orphanMatch) : eq(lessonNotes.subjectId, subject.id))
    .orderBy(desc(lessonNotes.date), desc(schoolBlocks.startTime))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    schoolBlockId: r.schoolBlockId,
    date: r.date,
    startTime: hm(r.startTime),
    body: r.body,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

// --- Validierung ---------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseLessonNoteBody(input: unknown): Parsed<string> {
  if (typeof input !== "string") return { ok: false, error: "body muss ein Text sein." };
  if (input.length > MAX_BODY_LEN)
    return { ok: false, error: `Die Notiz darf hoechstens ${MAX_BODY_LEN} Zeichen lang sein.` };
  return { ok: true, value: input };
}
