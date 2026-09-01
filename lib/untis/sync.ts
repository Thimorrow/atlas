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

// Holt den Stundenplan fuer [start, end] und upsertet ihn idempotent. Der
// tatsaechlich abgefragte Zeitraum kann enger sein als der gewuenschte, weil
// Untis nicht ueber Schuljahresgrenzen hinweg antwortet.
export async function syncUntis(start: Date, end: Date) {
  const { lessons, schoolyear, window, hinweis } = await fetchTimetable(start, end);
  const rows = lessons.map((l) => lessonToSchoolBlock(l as unknown as UntisLesson));
  const upserted = await upsertSchoolBlocks(rows);
  return { fetched: lessons.length, upserted, schoolyear, window, hinweis };
}

// Rollendes Default-Fenster: vergangene Woche bis 3 Wochen voraus.
export function defaultSyncWindow(): { start: Date; end: Date } {
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const end = new Date();
  end.setDate(end.getDate() + 21);
  return { start, end };
}

// Der Stand des letzten Abgleichs, aus der Datenbank statt aus dem Browser.
//
// Bisher merkte sich nur der Browser in localStorage, wann zuletzt abgeglichen
// wurde. Ein zweites Geraet erfuhr davon nie und stiess den Abgleich unnoetig
// erneut an. Das groesste updated_at in school_blocks weiss es dagegen fuer
// alle.
//
// lastError ist immer null: es gibt keine Tabelle, in der ein gescheiterter
// Abgleich festgehalten wuerde. Das Feld steht trotzdem im Vertrag, damit der
// Client es heute schon lesen kann und spaeter nichts umgebaut werden muss.
export type SyncState = {
  lastSyncedAt: string | null;
  blockCount: number;
  lastError: null;
};

export async function syncState(): Promise<SyncState> {
  const [row] = await db
    .select({
      last: sql<string | null>`max(${schoolBlocks.updatedAt})`,
      count: sql<number>`count(*)::int`,
    })
    .from(schoolBlocks);

  return {
    // Postgres liefert den Zeitstempel als String zurueck, nicht als Date --
    // deshalb der Umweg ueber new Date, damit hinten ein ISO-Wert mit Z steht.
    lastSyncedAt: row?.last ? new Date(row.last).toISOString() : null,
    blockCount: row?.count ?? 0,
    lastError: null,
  };
}
