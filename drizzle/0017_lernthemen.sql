CREATE TYPE "public"."study_card_kind" AS ENUM('wissen', 'vokabel', 'aufgabe');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"assignment_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_cards" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "study_cards" ADD COLUMN "kind" "study_card_kind" DEFAULT 'wissen' NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "lernart" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_topics" ADD CONSTRAINT "study_topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_topics" ADD CONSTRAINT "study_topics_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_topics_subject_idx" ON "study_topics" USING btree ("subject_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_cards" ADD CONSTRAINT "study_cards_topic_id_study_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."study_topics"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_cards_topic_idx" ON "study_cards" USING btree ("topic_id");