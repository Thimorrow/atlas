CREATE TYPE "public"."todo_priority" AS ENUM('none', 'low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "todo_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"color" text,
	"priority" "todo_priority" DEFAULT 'none' NOT NULL,
	"rrule" text,
	"due_date" date,
	"scheduled_time" time,
	"est_minutes" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "todo_completions" ADD CONSTRAINT "todo_completions_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "todo_completions_todo_date_uq" ON "todo_completions" USING btree ("todo_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "todo_completions_date_idx" ON "todo_completions" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "todos_due_date_idx" ON "todos" USING btree ("due_date");