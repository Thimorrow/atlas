---
milestone: M001
slice: S03
task: T03
project: Atlas
completed: 2026-06-27T19:02:27Z
status: done
---

# M001-S03-T03 -- Summary

**Was:** Datenmodell + API erweitert, damit eigene Eintraege Farbe, Ort und einen
Ganztag-Modus tragen koennen. Reine Datenschicht (Voraussetzung fuer Sheet-UI T04).

## Aenderungen

- `lib/db/schema.ts` -- `manual_events`: `color`, `location`, `all_day` (bool, default
  false). `routines`: `location`, `all_day` (color war schon da). Additiv, start/end
  bleiben notNull.
- `drizzle/0001_fine_random.sql` -- 5 additive `ADD COLUMN`. Auf Neon-Dev-DB angewendet
  (`drizzle-kit migrate`).
- `lib/calendar-store.ts` -- `parseNewManualEvent`/`parseManualEventPatch` +
  `parseNewRoutine`/`parseRoutinePatch` nehmen `color`/`location`/`allDay`. Ganztag:
  start/end werden auf Platzhalter `00:00`/`23:59` gesetzt (Spalten sind notNull),
  Zeit-Pflicht entfaellt bei `allDay:true`.
- `lib/calendar-expand.ts` -- `CalendarEvent` um `location?` + `allDay?`. `manualToEvent`
  liest jetzt `e.color` (vorher hart null), `location`, `allDay`; `routineToEvent` reicht
  `location` + `allDay` durch.
- `lib/calendar-freeslots.ts` -- `isBusy`: Ganztags-Events blockieren keine Luecke
  (sonst wuerden die Platzhalter-Zeiten den ganzen Tag belegen).
- `lib/calendar.test.ts` -- Faelle: Farbe + Ort kommen durch die Expansion an;
  Ganztag-Event hat `allDay:true` und blockiert keine freie Luecke.

## Verifikation

`npx drizzle-kit generate` -> 0001 erzeugt; `npx tsc --noEmit` -> 0 Fehler;
`npx vitest run` -> 19/19 gruen.

## Hinweis fuer T04

Frontend liest `ev.color` (statt der harten SRC-Quellenfarbe), `ev.location` als
Unterinfo und `ev.allDay` -> dezenter Ganztag-Balken statt Zeitblock.
