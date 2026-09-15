CREATE TABLE "notebook_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "title" text DEFAULT 'Neue Seite' NOT NULL,
  "paper" text DEFAULT 'lined' NOT NULL CHECK ("paper" IN ('blank', 'lined', 'grid')),
  "content" jsonb DEFAULT '{"strokes":[],"blocks":[]}'::jsonb NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notebook_pages_subject_created_idx" ON "notebook_pages" ("subject_id", "created_at");
