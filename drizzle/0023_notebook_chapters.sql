CREATE TABLE "notebook_chapters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subject_id" uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notebook_chapters_subject_created_idx" ON "notebook_chapters" ("subject_id", "created_at");
--> statement-breakpoint
ALTER TABLE "notebook_pages" ADD COLUMN "chapter_id" uuid REFERENCES "notebook_chapters"("id") ON DELETE SET NULL;
