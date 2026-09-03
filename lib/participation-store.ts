// Meldungen pro konkreter Schulstunde (school_blocks-Zeile). Strukturell die
// Zwillingsschwester von lib/lesson-notes.ts, mit einem Unterschied in der
// Loesch-Semantik: eine gespeicherte 0 ist ein echter Datenpunkt (Stunde da
// gewesen, nie gemeldet) und wird -- anders als eine leere Notiz -- NICHT
// automatisch geloescht. Die Zeile verschwindet nur durch ein explizites
// DELETE (deleteParticipation). Der Nenner des Meldungsschnitts sind genau
// die Zeilen, die hier stehen.

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { lessonParticipations, schoolBlocks } from "@/lib/db/schema";
import { subjectIdFor } from "@/lib/lesson-notes";
import { summarizeParticipation, type ParticipationSummary } from "@/lib/participation";

export type ParticipationDTO = {
  id: string;
  schoolBlockId: string;
  count: number;
  updatedAt: string;
};

function toDTO(row: { id: string; schoolBlockId: string; count: number; updatedAt: Date }): ParticipationDTO {
  return {
    id: row.id,
    schoolBlockId: row.schoolBlockId,
    count: row.count,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getParticipation(schoolBlockId: string): Promise<ParticipationDTO | null> {
  const [row] = await db
    .select()
    .from(lessonParticipations)
    .where(eq(lessonParticipations.schoolBlockId, schoolBlockId));
  return row ? toDTO(row) : null;
}

// Upsert auf schoolBlockId -- anders als saveLessonNote loescht count 0 NICHT,
// sie wird ganz normal gespeichert (siehe Dateikommentar oben).
export async function saveParticipation(schoolBlockId: string, count: number): Promise<ParticipationDTO | null> {
  const [block] = await db.select().from(schoolBlocks).where(eq(schoolBlocks.id, schoolBlockId));
  if (!block) return null;

  const subjectId = await subjectIdFor(block.subject);

  const [row] = await db
    .insert(lessonParticipations)
    .values({ schoolBlockId, subjectId, date: block.date, count })
    .onConflictDoUpdate({
      target: lessonParticipations.schoolBlockId,
      set: { count, subjectId, date: block.date, updatedAt: new Date() },
    })
    .returning();
  return toDTO(row);
}

export async function deleteParticipation(schoolBlockId: string): Promise<void> {
  await db.delete(lessonParticipations).where(eq(lessonParticipations.schoolBlockId, schoolBlockId));
}

// Fuer expandRange (Kalender): Zaehlstand je Block-id fuer die ganze Spanne in
// einem Query -- kein N+1, wie lessonNoteBlockIds.
export async function participationCounts(blockIds: string[]): Promise<Map<string, number>> {
  if (blockIds.length === 0) return new Map();
  const rows = await db
    .select({ schoolBlockId: lessonParticipations.schoolBlockId, count: lessonParticipations.count })
    .from(lessonParticipations)
    .where(inArray(lessonParticipations.schoolBlockId, blockIds));
  return new Map(rows.map((r) => [r.schoolBlockId, r.count]));
}

export type SubjectParticipationEntryDTO = {
  schoolBlockId: string;
  date: string;
  startTime: string; // HH:MM
  count: number;
};

export type SubjectParticipationDTO = {
  summary: ParticipationSummary;
  recent: SubjectParticipationEntryDTO[];
};

const hm = (t: string) => t.slice(0, 5);

// Meldungsschnitt und juengste erfasste Stunden eines Fachs. Gleiche
// Waisen-Behandlung wie listSubjectLessonNotes: subjectId kann null sein
// (die Zeile entstand, bevor es das Fach gab), solche Zeilen zaehlen trotzdem
// mit, sobald ihr school_blocks.subject zu untisSubject/name passt.
//
// summary rechnet ueber ALLE erfassten Stunden, recent ist nur die gekappte
// Liste fuer die Anzeige -- deshalb zwei getrennte Queries statt eines
// limitierten, sonst wuerde der Schnitt mit begrenztem limit falsch.
export async function subjectParticipation(
  subject: { id: string; untisSubject: string | null; name: string },
  limit = 50,
): Promise<SubjectParticipationDTO> {
  const matchNames = [...new Set([subject.untisSubject, subject.name].filter((v): v is string => !!v))];
  const orphanMatch =
    matchNames.length > 0
      ? and(isNull(lessonParticipations.subjectId), inArray(schoolBlocks.subject, matchNames))
      : undefined;
  const where = orphanMatch
    ? or(eq(lessonParticipations.subjectId, subject.id), orphanMatch)
    : eq(lessonParticipations.subjectId, subject.id);

  const allRows = await db
    .select({ count: lessonParticipations.count })
    .from(lessonParticipations)
    .innerJoin(schoolBlocks, eq(lessonParticipations.schoolBlockId, schoolBlocks.id))
    .where(where);

  const summary = summarizeParticipation(allRows.map((r) => r.count));

  const recentRows = await db
    .select({
      schoolBlockId: lessonParticipations.schoolBlockId,
      date: lessonParticipations.date,
      count: lessonParticipations.count,
      startTime: schoolBlocks.startTime,
    })
    .from(lessonParticipations)
    .innerJoin(schoolBlocks, eq(lessonParticipations.schoolBlockId, schoolBlocks.id))
    .where(where)
    .orderBy(desc(lessonParticipations.date), desc(schoolBlocks.startTime))
    .limit(limit);

  return {
    summary,
    recent: recentRows.map((r) => ({
      schoolBlockId: r.schoolBlockId,
      date: r.date,
      startTime: hm(r.startTime),
      count: r.count,
    })),
  };
}
