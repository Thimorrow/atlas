ALTER TABLE "manual_events" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "manual_events" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "manual_events" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;