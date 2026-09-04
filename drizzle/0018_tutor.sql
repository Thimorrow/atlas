CREATE TYPE "public"."tutor_message_role" AS ENUM('user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."tutor_modus" AS ENUM('lernen', 'probe');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tutor_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"modus" "tutor_modus" DEFAULT 'lernen' NOT NULL,
	"card_id" uuid,
	"checkliste" jsonb,
	"ergebnis" jsonb,
	"karten_angelegt" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tutor_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "tutor_message_role" NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"tool_name" text,
	"tool_args" jsonb,
	"tool_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_topic_id_study_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."study_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_card_id_study_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."study_cards"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_conversation_id_tutor_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."tutor_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tutor_conversations_topic_created_idx" ON "tutor_conversations" USING btree ("topic_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tutor_messages_conversation_created_idx" ON "tutor_messages" USING btree ("conversation_id","created_at");