import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolBlocks, type NewSchoolBlock } from "@/lib/db/schema";
import { fetchTimetable } from "./client";
import { lessonToSchoolBlock, normalizeSubject, type UntisLesson } from "./adapter";
import { reconcileSubjects, type SubjectReconcileResult } from "@/lib/subject-store";

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

// Die Fachnamen werden beim Import normalisiert (normalizeSubject im Adapter).
// Zeilen, die vor einer neuen Regel geschrieben wurden, tragen aber weiterhin
// den alten Untis-Namen, und ein Re-Sync erwischt nur das aktuelle Fenster --
// "Informatik/ang. Mathematik" blieb deshalb in alten Wochen stehen, waehrend
// neue Wochen schon "Informatik" hiessen. Zwei Namen fuer dasselbe Fach heisst
// aber auch zwei Faecher in der Liste. Also einmal pro Abgleich ueber die
// vorhandenen Namen gehen und die nachziehen, die sich heute anders schreiben.
//
// Der Unique-Index steht auf (untis_lesson_id, date), das Umbenennen kann also
// nicht kollidieren.
export async function normalizeStoredSubjects(): Promise<number> {
  const rows = await db.selectDistinct({ subject: schoolBlocks.subject }).from(schoolBlocks);
  const veraltet = rows.map((r) => r.subject).filter((s) => normalizeSubject(s) !== s);

  for (const alt of veraltet) {
    await db
      .update(schoolBlocks)
      .set({ subject: normalizeSubject(alt), updatedAt: sql`now()` })
      .where(eq(schoolBlocks.subject, alt));
  }

  return veraltet.length;
}

export type SyncResult = {
  fetched: number;
  upserted: number;
  renamed: number;
  subjects: SubjectReconcileResult;
  schoolyear: Awaited<ReturnType<typeof fetchTimetable>>["schoolyear"];
  window: Awaited<ReturnType<typeof fetchTimetable>>["window"];
  hinweis: string | null;
};

// Holt den Stundenplan fuer [start, end] und upsertet ihn idempotent. Der
// tatsaechlich abgefragte Zeitraum kann enger sein als der gewuenschte, weil
// Untis nicht ueber Schuljahresgrenzen hinweg antwortet.
//
// Im selben Zug wird die Faecherliste nachgezogen: neue Faecher anlegen, Lehrer
// und Raum aus dem Stundenplan uebernehmen, Faecher ohne Stunden ausraeumen.
// Das gehoert hierher und nicht in eine eigene Schaltflaeche -- die Faecher
// sind eine Ableitung des Stundenplans, kein zweiter Datenbestand, den jemand
// von Hand synchron halten muesste.
export async function syncUntis(start: Date, end: Date): Promise<SyncResult> {
  const { lessons, schoolyear, window, hinweis } = await fetchTimetable(start, end);
  const rows = lessons.map((l) => lessonToSchoolBlock(l as unknown as UntisLesson));
  const upserted = await upsertSchoolBlocks(rows);
  const renamed = await normalizeStoredSubjects();
  const subjects = await reconcileSubjects();
  return { fetched: lessons.length, upserted, renamed, subjects, schoolyear, window, hinweis };
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
