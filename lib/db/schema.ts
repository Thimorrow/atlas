// Atlas Event-Datenmodell (M001-S01-T02).
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

// Prioritaet einer To-Do-Aufgabe. none = ohne.
export const todoPriority = pgEnum("todo_priority", ["none", "low", "medium", "high"]);

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

// To-Dos (M002): Habit-Tracker x To-Do-Hybrid.
//
// rrule = null  -> einmalige Aufgabe; dueDate ist die (optionale) Faelligkeit.
// rrule gesetzt -> wiederkehrende Aufgabe/Habit (RFC-5545 RRULE-String, z.B.
//   "FREQ=DAILY;INTERVAL=2"); dueDate dient dann als Start-Anker (DTSTART).
//   Konkrete Vorkommen werden NICHT gespeichert, sondern on-demand expandiert.
// Erledigungen liegen separat in todo_completions (eine Zeile pro Tag).
// scheduledTime/estMinutes sind kalender-ready Platzhalter (noch ungenutzt).
export const todos = pgTable(
  "todos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    notes: text("notes"),
    color: text("color"),
    priority: todoPriority("priority").notNull().default("none"),
    rrule: text("rrule"), // null = einmalig; sonst RFC-5545 RRULE
    dueDate: date("due_date"), // einmalig: Faelligkeit; wiederkehrend: Start-Anker
    scheduledTime: time("scheduled_time"), // kalender-ready (ungenutzt)
    estMinutes: integer("est_minutes"), // kalender-ready (ungenutzt)
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("todos_due_date_idx").on(t.dueDate)],
);

// Erledigungs-Log: eine Zeile pro abgehakter (Aufgabe, Tag). Wiederkehrende
// Aufgaben sind pro Tag erledigt; einmalige gelten als erledigt, sobald
// ueberhaupt eine Zeile existiert. UNIQUE verhindert Doppel-Haken.
export const todoCompletions = pgTable(
  "todo_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    todoId: uuid("todo_id")
      .notNull()
      .references(() => todos.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("todo_completions_todo_date_uq").on(t.todoId, t.date),
    index("todo_completions_date_idx").on(t.date),
  ],
);

// Praktische Typen fuer den Rest der App.
export type SchoolBlock = typeof schoolBlocks.$inferSelect;
export type NewSchoolBlock = typeof schoolBlocks.$inferInsert;
export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
export type TodoCompletion = typeof todoCompletions.$inferSelect;
export type NewTodoCompletion = typeof todoCompletions.$inferInsert;
