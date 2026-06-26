import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolBlocks, type NewSchoolBlock } from "@/lib/db/schema";
import { fetchTimetable } from "./client";
import { lessonToSchoolBlock, type UntisLesson } from "./adapter";

// Idempotenter Upsert in school_blocks (Unique-Key untis_lesson_id + date).
// Re-Sync ueberschreibt geaenderte Stunden, erzeugt keine Duplikate.
export async function upsertSchoolBlocks(rows: NewSchoolBlock[]): Promise<number> {
  if (rows.length === 0) return 0;

  await db
    .insert(schoolBlocks)
    .values(rows)
    .onConflictDoUpdate({
      target: [schoolBlocks.untisLessonId, schoolBlocks.date],
      set: {
        startTime: sql`excluded.start_time`,
        endTime: sql`excluded.end_time`,
        subject: sql`excluded.subject`,
        room: sql`excluded.room`,
        teacher: sql`excluded.teacher`,
        status: sql`excluded.status`,
        substitutionText: sql`excluded.substitution_text`,
        updatedAt: sql`now()`,
      },
    });

  return rows.length;
}

// Holt den Stundenplan fuer [start, end] und upsertet ihn idempotent.
export async function syncUntis(start: Date, end: Date) {
  const lessons = await fetchTimetable(start, end);
  const rows = lessons.map((l) => lessonToSchoolBlock(l as unknown as UntisLesson));
  const upserted = await upsertSchoolBlocks(rows);
  return { fetched: lessons.length, upserted };
}

// Rollendes Default-Fenster: vergangene Woche bis 3 Wochen voraus.
export function defaultSyncWindow(): { start: Date; end: Date } {
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const end = new Date();
  end.setDate(end.getDate() + 21);
  return { start, end };
}
