-- untis_teacher / untis_room merken, was Untis zuletzt lieferte. Nur solange
-- teacher bzw. room noch genau damit uebereinstimmen, darf der Abgleich sie
-- ueberschreiben -- sonst hat jemand von Hand eingegriffen und das bleibt.
--
-- Ein DO-Block statt zweier ALTER TABLE, weil die Spalten und die einmalige
-- Uebernahme zusammengehoeren: die vorhandenen Werte stammen alle aus Untis,
-- ohne die Uebernahme gaelten sie ab sofort als Handeingaben und froeren ein.
-- Der Block laeuft nur, wenn es die Spalte noch nicht gibt. /api/admin/migrate
-- ist absichtlich beliebig oft aufrufbar, und ein zweiter Lauf ohne diese
-- Bedingung wuerde jede echte Handeingabe wieder mit dem Untis-Wert ueberbuegeln.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subjects' AND column_name = 'untis_teacher'
  ) THEN
    ALTER TABLE "subjects" ADD COLUMN "untis_teacher" text;
    ALTER TABLE "subjects" ADD COLUMN "untis_room" text;
    UPDATE "subjects" SET "untis_teacher" = "teacher", "untis_room" = "room";
  END IF;
END $$;
