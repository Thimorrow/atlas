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
  timestamp,
  integer,
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

// Praktische Typen fuer den Rest der App.
export type SchoolBlock = typeof schoolBlocks.$inferSelect;
export type NewSchoolBlock = typeof schoolBlocks.$inferInsert;

// ---------------------------------------------------------------------------
// M003 -- Schul-Module: Faecher, Notizen, Aufgaben, Dateien.
//
// subjects spiegelt die Untis-Faecher (untis_subject = exakter Untis-Wert,
// UNIQUE solange nicht null), kann aber auch manuell befuellt werden (AG etc.).
// Abwaehlen = archivedAt setzen statt loeschen, sonst legt der naechste Sync
// das Fach still wieder an.
// ---------------------------------------------------------------------------

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    untisSubject: text("untis_subject"),
    teacher: text("teacher"),
    room: text("room"),
    color: text("color"),
    // Ziel-Abschnitt in OneNote. Der Name steht mit in der Zeile, damit die
    // Oberflaeche "Notizbuch / Abschnitt" anzeigen kann, ohne dafuer jedes Mal
    // die Graph-API zu fragen.
    onenoteSectionId: text("onenote_section_id"),
    onenoteSectionName: text("onenote_section_name"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("subjects_untis_subject_uq").on(t.untisSubject)],
);

export const subjectNotes = pgTable(
  "subject_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("subject_notes_subject_updated_idx").on(t.subjectId, t.updatedAt)],
);

// Typ steuert ausschliesslich Darstellung und Gewicht -- kein eigenes Modell,
// weil Hausaufgabe und Klassenarbeit sich alle Felder teilen.
export const assignmentType = pgEnum("assignment_type", [
  "homework",
  "exam",
  "test",
  "presentation",
  "other",
]);

export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // set null statt cascade: ein geloeschtes Fach macht seine Aufgaben zu
    // "Allgemein", es loescht sie nicht mit.
    subjectId: uuid("subject_id").references(() => subjects.id, {
      onDelete: "set null",
    }),
    type: assignmentType("type").notNull().default("homework"),
    title: text("title").notNull(),
    notes: text("notes"),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("assignments_due_date_idx").on(t.dueDate),
    index("assignments_subject_idx").on(t.subjectId),
  ],
);

// Metadaten zu Vercel-Blob-Uploads. Der Blob selbst liegt bei Vercel, hier
// steht nur, wo er liegt (url) und wie er sich loeschen laesst (pathname).
export const subjectFiles = pgTable("subject_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  pathname: text("pathname").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Microsoft-Anbindung (OneNote).
//
// Atlas ist eine Ein-Personen-App, es gibt also hoechstens EINE Verbindung.
// Statt das im Code zu hoffen, erzwingt es hier eine Spalte mit fixem Wert und
// einem Unique-Index: eine zweite Anmeldung ueberschreibt die erste, sie legt
// keine zweite Zeile an.
//
// access_token und refresh_token liegen verschluesselt (AES-256-GCM, siehe
// lib/microsoft.ts). In der Datenbank steht also kein Token, mit dem sich
// jemand als der Nutzer bei Microsoft ausgeben koennte.
// ---------------------------------------------------------------------------

export const microsoftAccounts = pgTable(
  "microsoft_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    singleton: text("singleton").notNull().default("only"),
    displayName: text("display_name"),
    email: text("email"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("microsoft_accounts_singleton_uq").on(t.singleton)],
);

export type MicrosoftAccount = typeof microsoftAccounts.$inferSelect;
export type NewMicrosoftAccount = typeof microsoftAccounts.$inferInsert;

export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
export type SubjectNote = typeof subjectNotes.$inferSelect;
export type NewSubjectNote = typeof subjectNotes.$inferInsert;
export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
export type AssignmentType = Assignment["type"];
export type SubjectFile = typeof subjectFiles.$inferSelect;
export type NewSubjectFile = typeof subjectFiles.$inferInsert;
