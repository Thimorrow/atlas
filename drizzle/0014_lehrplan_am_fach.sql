-- Lehrplan am Fach: was in diesem Fach in diesem Schuljahr dran ist.
--
-- Vorbelegt aus lib/lehrplan/ (Kernlehrplan NRW G9, Klasse 10), danach von
-- Hand aenderbar -- deshalb eine Spalte am Fach und keine abgeleitete Sicht:
-- was der Schueler korrigiert, muss den naechsten Sync ueberleben.
--
-- curriculum_source haelt fest, woher der Text stammt, damit die Oberflaeche
-- "aus dem Kernlehrplan" von "selbst geschrieben" unterscheiden kann, ohne den
-- Text zu raten.
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "curriculum" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "curriculum_source" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "curriculum_updated_at" timestamp with time zone;
