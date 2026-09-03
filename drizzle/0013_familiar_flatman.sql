CREATE TABLE IF NOT EXISTS "lesson_participations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_block_id" uuid NOT NULL,
	"subject_id" uuid,
	"date" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_participations" ADD CONSTRAINT "lesson_participations_school_block_id_school_blocks_id_fk" FOREIGN KEY ("school_block_id") REFERENCES "public"."school_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_participations" ADD CONSTRAINT "lesson_participations_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lesson_participations_school_block_uq" ON "lesson_participations" USING btree ("school_block_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lesson_participations_subject_date_idx" ON "lesson_participations" USING btree ("subject_id","date");