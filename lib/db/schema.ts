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
  doublePrecision,
  jsonb,
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

// Untis liefert zu einem Lehrer nur Kuerzel und Nachname, kein Geschlecht.
// Die Anrede steht deshalb am Fach und wird dort von Hand gesetzt. "Herr" ist
// die Vorbelegung, weil eine gewaehlt werden muss -- geraten wird nicht.
export const teacherTitle = pgEnum("teacher_title", ["herr", "frau"]);

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    untisSubject: text("untis_subject"),
    teacher: text("teacher"),
    teacherTitle: teacherTitle("teacher_title").notNull().default("herr"),
    room: text("room"),
    // Der zuletzt von Untis gesehene Rohwert. teacher und room sind der
    // Anzeigename und duerfen von Hand geaendert werden -- ueberschrieben
    // werden sie nur, solange sie noch genau dem entsprechen, was Untis zuletzt
    // lieferte. Ohne dieses Gedaechtnis sammelt der naechste Sync jede
    // Handeingabe wieder ein, und bei Lehrern, zu denen Untis nur ein Kuerzel
    // kennt, ist die Handeingabe der einzige Weg zu einem lesbaren Namen.
    untisTeacher: text("untis_teacher"),
    untisRoom: text("untis_room"),
    color: text("color"),
    // Ziel-Abschnitt in OneNote. Der Name steht mit in der Zeile, damit die
    // Oberflaeche "Notizbuch / Abschnitt" anzeigen kann, ohne dafuer jedes Mal
    // die Graph-API zu fragen.
    onenoteSectionId: text("onenote_section_id"),
    onenoteSectionName: text("onenote_section_name"),
    // Anteil der muendlichen Noten am Fachschnitt in Prozent. Steht am Fach,
    // weil die Verordnung sie je Fach festlegt (Hauptfach oft 40:60).
    oralWeight: integer("oral_weight").notNull().default(50),
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

// Eine Stundennotiz haengt an genau EINER konkreten Schulstunde (school_blocks-
// Zeile), nicht am Fach -- deshalb der eigene unique Index auf schoolBlockId
// statt einer Liste wie bei subject_notes. subjectId ist rein denormalisiert
// (aufgeloest ueber subjects.untisSubject beim Anlegen): die Fach-Chronik in
// der Detailseite soll ohne Join auf school_blocks sortieren koennen, und ein
// geloeschtes Fach soll die Notiz nicht mitreissen (set null statt cascade).
export const lessonNotes = pgTable(
  "lesson_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolBlockId: uuid("school_block_id")
      .notNull()
      .references(() => schoolBlocks.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lesson_notes_school_block_uq").on(t.schoolBlockId),
    index("lesson_notes_subject_date_idx").on(t.subjectId, t.date),
  ],
);

export type LessonNote = typeof lessonNotes.$inferSelect;
export type NewLessonNote = typeof lessonNotes.$inferInsert;

// Meldungen pro konkreter Schulstunde -- strukturell die Zwillingsschwester von
// lessonNotes (gleiche school_block_id-Bindung, gleiche subject_id/date-
// Denormalisierung fuer die Fach-Chronik). Der entscheidende Unterschied: eine
// erfasste 0 ist ein echter Datenpunkt (Stunde da gewesen, nie gemeldet) und
// wird NICHT wie eine leere Notiz automatisch geloescht -- die Zeile
// verschwindet nur durch ein explizites DELETE. Der Nenner des Meldungsschnitts
// sind genau die Zeilen, die hier stehen.
export const lessonParticipations = pgTable(
  "lesson_participations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolBlockId: uuid("school_block_id")
      .notNull()
      .references(() => schoolBlocks.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lesson_participations_school_block_uq").on(t.schoolBlockId),
    index("lesson_participations_subject_date_idx").on(t.subjectId, t.date),
  ],
);

export type LessonParticipation = typeof lessonParticipations.$inferSelect;
export type NewLessonParticipation = typeof lessonParticipations.$inferInsert;

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

// Muendlich oder schriftlich -- mehr Arten braucht die Oberstufe nicht, und
// nur an diesen beiden haengt die Gewichtung des Fachschnitts.
export const gradeKind = pgEnum("grade_kind", ["oral", "written"]);

// Eine Note in Punkten (0-15). Die Note 1-6 wird nie gespeichert, sondern immer
// aus den Punkten gerechnet (lib/grades.ts) -- sonst koennten beide Werte
// auseinanderlaufen.
export const grades = pgTable(
  "grades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    kind: gradeKind("kind").notNull().default("written"),
    points: integer("points").notNull(),
    label: text("label").notNull(),
    date: date("date").notNull(),
    // Gewicht der einzelnen Note innerhalb ihrer Gruppe: 1 = einfach,
    // 2 = doppelt. 0 nimmt sie aus der Rechnung, ohne sie zu loeschen.
    weight: doublePrecision("weight").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("grades_subject_date_idx").on(t.subjectId, t.date)],
);

export type Grade = typeof grades.$inferSelect;
export type NewGrade = typeof grades.$inferInsert;
export type GradeKind = Grade["kind"];

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

// ---------------------------------------------------------------------------
// Atlas-Bot -- Gedaechtnis der Chat-Gespraeche.
//
// bot_conversations traegt nur den Rahmen (Titel fuer die Verlaufsliste),
// bot_messages die eigentliche Chronik. tool_name/tool_args/tool_result
// bleiben null bei normalen Text-Nachrichten und sind nur bei role "tool"
// befuellt -- so laesst sich morgens nachlesen, welches Werkzeug mit welchen
// Argumenten lief und was es zurueckgab.
// ---------------------------------------------------------------------------

export const botMessageRole = pgEnum("bot_message_role", ["user", "assistant", "tool"]);

export const botConversations = pgTable("bot_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const botMessages = pgTable(
  "bot_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => botConversations.id, { onDelete: "cascade" }),
    role: botMessageRole("role").notNull(),
    content: text("content").notNull().default(""),
    toolName: text("tool_name"),
    toolArgs: jsonb("tool_args"),
    toolResult: jsonb("tool_result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bot_messages_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

export type BotConversation = typeof botConversations.$inferSelect;
export type NewBotConversation = typeof botConversations.$inferInsert;
export type BotMessage = typeof botMessages.$inferSelect;
export type NewBotMessage = typeof botMessages.$inferInsert;
export type BotMessageRole = BotMessage["role"];

export type Subject = typeof subjects.$inferSelect;
export type TeacherTitle = Subject["teacherTitle"];
export type NewSubject = typeof subjects.$inferInsert;
export type SubjectNote = typeof subjectNotes.$inferSelect;
export type NewSubjectNote = typeof subjectNotes.$inferInsert;
export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
export type AssignmentType = Assignment["type"];
export type SubjectFile = typeof subjectFiles.$inferSelect;
export type NewSubjectFile = typeof subjectFiles.$inferInsert;
