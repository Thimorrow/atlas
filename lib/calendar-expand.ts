import { and, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolBlocks, type SchoolBlock } from "@/lib/db/schema";
import { normalizeSubject } from "@/lib/untis/adapter";
import { lessonNoteBlockIds } from "@/lib/lesson-notes";
import { assignmentDueBlockIds } from "@/lib/assignment-store";

// Eine konkrete Event-Instanz an einem Tag (aus einer Untis-Stunde abgeleitet).
// Zeiten als HH:MM.
export type CalendarEvent = {
  source: "school";
  refId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string | null;
  title: string;
  status: SchoolBlock["status"];
  room: string | null;
  teacher: string | null;
  hasNote: boolean;
  hasAssignment: boolean;
};

export type ExpandedDay = {
  date: string;
  weekday: number; // 0 = Montag ... 6 = Sonntag
  events: CalendarEvent[];
};

export type ExpandedRange = {
  start: string;
  end: string;
  days: ExpandedDay[];
};

// --- Datums-Helfer (date-only Strings, UTC -> kein TZ-Drift) -----------------

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISO(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00Z`);
}

// Ob ein Datum wirklich existiert, nicht nur wie eines aussieht. JS nimmt den
// 30. Februar klaglos an und macht daraus den 2. Maerz; beim 99. Tag des
// 13. Monats wirft es dagegen erst beim spaeteren toISOString(). Beide Faelle
// sollen frueh und gleich behandelt werden.
export function isRealDate(dateISO: string): boolean {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateISO;
}

// 0 = Montag ... 6 = Sonntag (JS getUTCDay: 0=So -> verschieben).
function weekdayOf(dateISO: string): number {
  return (parseISO(dateISO).getUTCDay() + 6) % 7;
}

function isoWeekRange(dateISO: string): { start: string; end: string } {
  const d = parseISO(dateISO);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - weekdayOf(dateISO));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: toISO(monday), end: toISO(sunday) };
}

function eachDay(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const end = parseISO(endISO);
  for (let d = parseISO(startISO); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(toISO(d));
  }
  return out;
}

const hm = (t: string | null): string | null => (t ? t.slice(0, 5) : null);

// --- Mapping -----------------------------------------------------------------

function schoolToEvent(b: SchoolBlock, notedBlockIds: Set<string>, dueBlockIds: Set<string>): CalendarEvent {
  return {
    source: "school",
    refId: b.id,
    date: b.date,
    startTime: hm(b.startTime)!,
    endTime: hm(b.endTime),
    title: normalizeSubject(b.subject),
    status: b.status,
    room: b.room,
    teacher: b.teacher,
    hasNote: notedBlockIds.has(b.id),
    hasAssignment: dueBlockIds.has(b.id),
  };
}

// --- Expansion ---------------------------------------------------------------

// Expandiert einen inklusiven Datumsbereich zu konkreten Event-Instanzen pro Tag.
export async function expandRange(startISO: string, endISO: string): Promise<ExpandedRange> {
  const blocks = await db
    .select()
    .from(schoolBlocks)
    .where(and(gte(schoolBlocks.date, startISO), lte(schoolBlocks.date, endISO)));

  // Zwei zusaetzliche Queries fuer die ganze Spanne statt eins pro Block --
  // sonst waere das ein N+1 bei jedem Wochenwechsel.
  const notedBlockIds = await lessonNoteBlockIds(blocks.map((b) => b.id));
  const dueBlockIds = await assignmentDueBlockIds(
    blocks.map((b) => ({ id: b.id, date: b.date, subject: b.subject })),
  );

  const days: ExpandedDay[] = eachDay(startISO, endISO).map((date) => {
    const weekday = weekdayOf(date);
    const dayEvents: CalendarEvent[] = blocks
      .filter((b) => b.date === date)
      .map((b) => schoolToEvent(b, notedBlockIds, dueBlockIds));
    dayEvents.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return { date, weekday, events: dayEvents };
  });

  return { start: startISO, end: endISO, days };
}

// ISO-Woche (Mo..So) um ein beliebiges Datum herum.
export function expandWeek(dateISO: string): Promise<ExpandedRange> {
  const { start, end } = isoWeekRange(dateISO);
  return expandRange(start, end);
}

// Einzelner Tag (fuer die Tagesansicht).
export function expandDay(dateISO: string): Promise<ExpandedRange> {
  return expandRange(dateISO, dateISO);
}
