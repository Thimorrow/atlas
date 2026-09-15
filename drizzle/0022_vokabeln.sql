CREATE TABLE IF NOT EXISTS "vokabeln" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sprache" text NOT NULL CHECK ("sprache" IN ('latein', 'englisch')),
  "abschnitt" text NOT NULL,
  "wort" text NOT NULL,
  "deutsch" text NOT NULL,
  "box" integer DEFAULT 1 NOT NULL CHECK ("box" BETWEEN 1 AND 6),
  "revision" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vokabeln_eintrag_uq" ON "vokabeln" ("sprache", "abschnitt", "wort", "deutsch");
