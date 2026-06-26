CREATE TYPE "public"."routine_type" AS ENUM('fixed', 'flexible_goal');--> statement-breakpoint
CREATE TYPE "public"."school_block_status" AS ENUM('regular', 'cancelled', 'substituted');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "manual_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"type" "routine_type" NOT NULL,
	"color" text,
	"weekday" integer,
	"start_time" time,
	"end_time" time,
	"open_ended" boolean DEFAULT false NOT NULL,
	"target_per_week" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "school_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"untis_lesson_id" text NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"subject" text NOT NULL,
	"room" text,
	"teacher" text,
	"status" "school_block_status" DEFAULT 'regular' NOT NULL,
	"substitution_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "school_blocks_untis_date_uq" ON "school_blocks" USING btree ("untis_lesson_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "school_blocks_date_idx" ON "school_blocks" USING btree ("date");