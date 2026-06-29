// Atlas Event-Datenmodell (M001-S01-T02).
//
// Drei Tabellen + zwei Enums. FreeSlot wird NICHT gespeichert, sondern aus
// SchoolBlocks (ohne cancelled) + Routinen + manuellen Events berechnet (S02-T03).
//
// Untis ist eine reine Importquelle: school_blocks werden per (untis_lesson_id, date)
// idempotent geupsertet, damit ein Re-Sync keine Duplikate erzeugt.

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  date,
  time,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Status einer Schulstunde. cancelled = ausgefallen (-> freie Luecke),
// substituted = Vertretung/Raumaenderung.
export const schoolBlockStatus = pgEnum("school_block_status", [
  "regular",
  "cancelled",
  "substituted",
]);

// fixed   = feste Wochen-Regel (Tag + Zeit, optional offenes Ende).
// flexible_goal = "X mal pro Woche", Zeit offen (Auto-Platzierung ab Modul 2).
export const routineType = pgEnum("routine_type", ["fixed", "flexible_goal"]);

export const schoolBlocks = pgTable(
  "school_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    untisLessonId: text("untis_lesson_id").notNull(),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    subject: text("subject").notNull(),
    room: text("room"),
    teacher: text("teacher"),
    status: schoolBlockStatus("status").notNull().default("regular"),
    substitutionText: text("substitution_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("school_blocks_untis_date_uq").on(t.untisLessonId, t.date),
    index("school_blocks_date_idx").on(t.date),
  ],
);

export const routines = pgTable("routines", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  type: routineType("type").notNull(),
  color: text("color"),
  location: text("location"),
  // fixed-Felder:
  weekday: integer("weekday"), // 0 = Montag ... 6 = Sonntag
  startTime: time("start_time"),
  endTime: time("end_time"),
  openEnded: boolean("open_ended").notNull().default(false),
  allDay: boolean("all_day").notNull().default(false),
  // flexible_goal-Feld:
  targetPerWeek: integer("target_per_week"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const manualEvents = pgTable("manual_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  date: date("date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  color: text("color"),
  location: text("location"),
  allDay: boolean("all_day").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Praktische Typen fuer den Rest der App.
export type SchoolBlock = typeof schoolBlocks.$inferSelect;
export type NewSchoolBlock = typeof schoolBlocks.$inferInsert;
export type Routine = typeof routines.$inferSelect;
export type NewRoutine = typeof routines.$inferInsert;
export type ManualEvent = typeof manualEvents.$inferSelect;
export type NewManualEvent = typeof manualEvents.$inferInsert;
