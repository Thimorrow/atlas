CREATE TABLE IF NOT EXISTS "lesson_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_block_id" uuid NOT NULL,
	"subject_id" uuid,
	"date" date NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_school_block_id_school_blocks_id_fk" FOREIGN KEY ("school_block_id") REFERENCES "public"."school_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lesson_notes_school_block_uq" ON "lesson_notes" USING btree ("school_block_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lesson_notes_subject_date_idx" ON "lesson_notes" USING btree ("subject_id","date");