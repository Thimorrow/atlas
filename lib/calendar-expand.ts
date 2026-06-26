import { and, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  schoolBlocks,
  manualEvents,
  routines,
  type SchoolBlock,
  type ManualEvent,
  type Routine,
} from "@/lib/db/schema";
import { normalizeSubject } from "@/lib/untis/adapter";

// Eine konkrete Event-Instanz an einem Tag (aus Untis-Stunde, Routine oder
// manuellem Event abgeleitet). Zeiten als HH:MM.
export type CalendarEvent = {
  source: "school" | "routine" | "manual";
  refId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string | null; // null = offenes Ende (Routine)
  title: string;
  color: string | null;
  status?: SchoolBlock["status"]; // nur source=school
  openEnded?: boolean; // nur source=routine
  room?: string | null;
  teacher?: string | null;
  notes?: string | null;
};

// Flexibles Wochen-Ziel ("X mal pro Woche"). Keine Platzierung auf der Timeline.
export type FlexibleGoal = {
  routineId: string;
  title: string;
  color: string | null;
  targetPerWeek: number;
  done: number; // S02: keine Completion-Quelle -> 0 (Tracking kommt mit Modul 2)
  remaining: number;
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
  flexibleGoals: FlexibleGoal[];
};

// --- Datums-Helfer (date-only Strings, UTC -> kein TZ-Drift) -----------------

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISO(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00Z`);
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

function schoolToEvent(b: SchoolBlock): CalendarEvent {
  return {
    source: "school",
    refId: b.id,
    date: b.date,
    startTime: hm(b.startTime)!,
    endTime: hm(b.endTime),
    title: normalizeSubject(b.subject),
    color: null,
    status: b.status,
    room: b.room,
    teacher: b.teacher,
  };
}

function manualToEvent(e: ManualEvent): CalendarEvent {
  return {
    source: "manual",
    refId: e.id,
    date: e.date,
    startTime: hm(e.startTime)!,
    endTime: hm(e.endTime),
    title: e.title,
    color: null,
    notes: e.notes,
  };
}

function routineToEvent(r: Routine, date: string): CalendarEvent {
  return {
    source: "routine",
    refId: r.id,
    date,
    startTime: hm(r.startTime)!,
    endTime: r.openEnded ? null : hm(r.endTime),
    title: r.title,
    color: r.color,
    openEnded: r.openEnded,
  };
}

// --- Expansion ---------------------------------------------------------------

// Expandiert einen inklusiven Datumsbereich zu konkreten Event-Instanzen pro Tag.
export async function expandRange(startISO: string, endISO: string): Promise<ExpandedRange> {
  const [blocks, events, allRoutines] = await Promise.all([
    db
      .select()
      .from(schoolBlocks)
      .where(and(gte(schoolBlocks.date, startISO), lte(schoolBlocks.date, endISO))),
    db
      .select()
      .from(manualEvents)
      .where(and(gte(manualEvents.date, startISO), lte(manualEvents.date, endISO))),
    db.select().from(routines),
  ]);

  const fixed = allRoutines.filter((r) => r.type === "fixed");
  const flex = allRoutines.filter((r) => r.type === "flexible_goal");

  const days: ExpandedDay[] = eachDay(startISO, endISO).map((date) => {
    const weekday = weekdayOf(date);
    const dayEvents: CalendarEvent[] = [
      ...blocks.filter((b) => b.date === date).map(schoolToEvent),
      ...events.filter((e) => e.date === date).map(manualToEvent),
      ...fixed.filter((r) => r.weekday === weekday).map((r) => routineToEvent(r, date)),
    ];
    dayEvents.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return { date, weekday, events: dayEvents };
  });

  const flexibleGoals: FlexibleGoal[] = flex.map((r) => ({
    routineId: r.id,
    title: r.title,
    color: r.color,
    targetPerWeek: r.targetPerWeek ?? 0,
    done: 0,
    remaining: r.targetPerWeek ?? 0,
  }));

  return { start: startISO, end: endISO, days, flexibleGoals };
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
