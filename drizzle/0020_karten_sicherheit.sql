-- Bestehende Karten-Sicherheit auf denselben Maßstab wie readiness() bringen:
-- alle aktiven Karten zählen, ab Box 3 gilt die Karte als sicher.
UPDATE study_plan_points AS p
SET confidence = COALESCE((
  SELECT ROUND(AVG(LEAST(c.box, 3)) / 3 * 100)::integer
  FROM study_cards AS c
  WHERE c.topic_id = p.topic_id AND c.archived_at IS NULL
), 0)
WHERE p.confidence_source = 'karten';
