CREATE TYPE "public"."study_card_source" AS ENUM('manuell', 'notizen', 'datei', 'lehrplan');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"source" "study_card_source" DEFAULT 'manuell' NOT NULL,
	"source_ref" text,
	"box" integer DEFAULT 0 NOT NULL,
	"due" date NOT NULL,
	"reviews" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"correct" boolean NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_cards" ADD CONSTRAINT "study_cards_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_reviews" ADD CONSTRAINT "study_reviews_card_id_study_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."study_cards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_reviews" ADD CONSTRAINT "study_reviews_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_cards_subject_due_idx" ON "study_cards" USING btree ("subject_id","due");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_reviews_subject_reviewed_idx" ON "study_reviews" USING btree ("subject_id","reviewed_at");