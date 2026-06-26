---
milestone: M001
slice: S02
task: T04
project: Atlas
completed: 2026-06-26T17:45:00Z
status: done
---

# M001-S02-T04 -- Summary

**Was gemacht:** Integrationstest fuer S02 (`lib/calendar.test.ts`).
- Pure Unit-Tests fuer `freeSlotsForDay`: cancelled = frei, min-Filter (5-min-Luecke
  faellt raus), offene Routine blockiert bis dayEnd, Fenster/min ueberschreibbar.
- Integrationstest gegen Neon: Sentinel-Tag D=2099-01-07 (weekday berechnet); 2
  school_blocks (regular + cancelled) via `upsertSchoolBlocks`, feste Routine
  (weekday=Wochentag(D)), flexible_goal, manuelles Event via Store angelegt. Nach
  `attachFreeSlots(await expandWeek(D))`: Tag D enthaelt Routine + manuelles Event +
  2 Schul-Events (eines cancelled); flexible_goal liegt in `flexibleGoals`, NICHT auf der
  Timeline; FreeSlots decken die cancelled-Stunde ab, nicht die regulaere/das Event.
  beforeAll/afterAll raeumen auf.

**Verifikation (bestanden):**
- `npm test` -> 15 passed (3 Files: adapter 6 + sync 3 + calendar 6).
- `npm run build` -> gruen.

**Notizen:**
- Integrationstest haengt an Neon; pure freeSlots-Tests bleiben offline gruen.
- Damit ist die komplette Backend-Logik von Modul 1 fertig (Untis-Sync + eigener
  Event-Store + Routinen/Events + Wochen-/Tages-Expansion + Free-Slots), API-seitig
  ueber /api/calendar, /api/routines, /api/events, /api/sync/untis erreichbar.
