CREATE TABLE IF NOT EXISTS "microsoft_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" text DEFAULT 'only' NOT NULL,
	"display_name" text,
	"email" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "onenote_section_id" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "onenote_section_name" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "microsoft_accounts_singleton_uq" ON "microsoft_accounts" USING btree ("singleton");