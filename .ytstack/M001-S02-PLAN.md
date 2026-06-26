---
milestone: M001
slice: S02
project: Atlas
created: 2026-06-26T14:10:19Z
status: done
task_count: 4
completed_tasks: 4
---

# M001-S02 -- Slice Plan

**Goal:** Feste und flexible Routinen sowie manuelle Events lassen sich anlegen/
bearbeiten und liegen als First-Class-Events im Store; freie Luecken werden korrekt
berechnet.

## Tasks

- [x] T01 -- CRUD-Backend + API-Routen fuer Routine (fixed: Tag/Zeit/optional offenes Ende; flexible_goal: Ziel-Anzahl pro Woche) und ManualEvent (/api/routines, /api/events). [lib/calendar-store.ts + 4 Routen, live verifiziert: POST/GET/PATCH/DELETE + 400/404, build gruen]
- [x] T02 -- Wochen-Expansion: feste Routinen + manuelle Events zu konkreten Event-Instanzen einer Woche expandieren; flexible Ziele als Target (erledigt/offen) liefern. [lib/calendar-expand.ts + /api/calendar?view=week|day, live verifiziert: 7 Tage Mo-So mit echten Untis-Stunden + Routine + manuellem Event]
- [x] T03 -- Freie-Luecken-Berechnung: aus SchoolBlocks (ohne cancelled) + festen Routinen + manuellen Events die FreeSlots eines Tages / der Woche ableiten. [lib/calendar-freeslots.ts, live verifiziert: plausible Slots + Entfall 30.06. erzeugt freie Luecke]
- [x] T04 -- Integrationstest: feste Routine + flexible-goal + manuelles Event anlegen; Wochen-Expansion + Freie-Luecken korrekt (eine cancelled Untis-Stunde erzeugt eine freie Luecke). [lib/calendar.test.ts: 15 Tests gruen, build gruen]

## Done when

All tasks marked `[x]` and verified via `ytstack:summarize-task`.

## Notes

- Flexible-goal-Routinen werden hier nur gespeichert + als Target angezeigt. Die
  automatische Platzierung in freie Slots ist Modul 2 (Auto-Planer), nicht dieser Slice.
- FreeSlot wird berechnet, nicht persistiert (abgeleiteter Zustand).
