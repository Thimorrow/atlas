CREATE TABLE IF NOT EXISTS "study_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"checklist_file_id" uuid,
	"checklist_text" text DEFAULT '' NOT NULL,
	"minutes_weekday" integer DEFAULT 30 NOT NULL,
	"minutes_weekend" integer DEFAULT 60 NOT NULL,
	"exam_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_plans_assignment_id_unique" UNIQUE("assignment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_plan_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"topic_id" uuid,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"pages" text,
	"file_ids" jsonb DEFAULT '[]' NOT NULL,
	"minutes_estimate" integer NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"confidence_source" text DEFAULT 'ohne_test' NOT NULL,
	"confidence_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cards_state" text DEFAULT 'offen' NOT NULL,
	CONSTRAINT "study_plan_points_confidence_check" CHECK ("confidence" between 0 and 100),
	CONSTRAINT "study_plan_points_confidence_source_check" CHECK ("confidence_source" in ('diagnose','karten','fazit','selbst','ohne_test')),
	CONSTRAINT "study_plan_points_cards_state_check" CHECK ("cards_state" in ('offen','fertig','fehler'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_plan_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"point_id" uuid NOT NULL,
	"question" text NOT NULL,
	"expected" text NOT NULL,
	"answer" text,
	"verdict" text,
	"feedback" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_plan_checks_verdict_check" CHECK ("verdict" in ('richtig','teilweise','falsch'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"point_id" uuid,
	"date" date NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"phase" text NOT NULL,
	"minutes" integer NOT NULL,
	"done_at" timestamp with time zone,
	"result" integer,
	CONSTRAINT "study_plan_items_phase_check" CHECK ("phase" in ('lernen','ueben','probe','simulation')),
	CONSTRAINT "study_plan_items_result_check" CHECK ("result" between 0 and 100)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_checklist_file_id_subject_files_id_fk" FOREIGN KEY ("checklist_file_id") REFERENCES "public"."subject_files"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_plan_points" ADD CONSTRAINT "study_plan_points_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_plan_points" ADD CONSTRAINT "study_plan_points_topic_id_study_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."study_topics"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_plan_checks" ADD CONSTRAINT "study_plan_checks_point_id_study_plan_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."study_plan_points"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_point_id_study_plan_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."study_plan_points"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_plan_points_plan_idx" ON "study_plan_points" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_plan_points_topic_idx" ON "study_plan_points" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_plan_checks_point_idx" ON "study_plan_checks" USING btree ("point_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_plan_items_plan_date_idx" ON "study_plan_items" USING btree ("plan_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_plan_items_point_idx" ON "study_plan_items" USING btree ("point_id");

--> statement-breakpoint
ALTER TABLE "tutor_conversations" ALTER COLUMN "topic_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "tutor_conversations" ADD COLUMN IF NOT EXISTS "item_id" uuid;
--> statement-breakpoint
ALTER TABLE "tutor_conversations" ADD COLUMN IF NOT EXISTS "assignment_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_item_id_study_plan_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."study_plan_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
