CREATE TYPE "public"."teacher_title" AS ENUM('herr', 'frau');--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "teacher_title" "teacher_title" DEFAULT 'herr' NOT NULL;
