---
milestone: M002
slice: S03
project: Atlas
completed: 2026-06-29T17:20:00Z
status: implemented_pending_visual_acceptance
---

# M002-S03 -- Summary

**Was:** Wiederkehrende Aufgaben voll nutzbar -- Wiederholung im Composer einstellbar
(RRULE-Presets), Ueberfaellig-Verhalten final, Streak-Anzeige.

## Neue Dateien

- `lib/todo-recurrence.ts` -- Presets <-> RRULE: `buildRrule(mode, days)` (daily/every2/
  workdays/custom), `rruleToMode` (Vorbelegung beim Bearbeiten), `rruleToLabel`
  (deutsches Kurzlabel "Alle 2 Tage", "Mo, Mi, Fr", "Wochentags").

## Geaenderte Dateien

- `components/todo-sheet.tsx` -- "Einmalig | Wiederkehrend"-Segmented (layoutId-Pill);
  bei wiederkehrend Preset-Grid + Wochentag-Chips (custom). Anker (DTSTART) = heute beim
  Anlegen / Wechsel zu wiederkehrend, sonst unangetastet. rrule:null beim Zurueck-auf-einmalig.
- `lib/todo-expand.ts` -- `computeStreak` (rueckwaerts ueber die RRULE-Vorkommen ab heute;
  heute-offen bricht den Streak NICHT) + `streak`-Feld an `TodoInstance`. Ueberfaellig-
  Verhalten war schon in S01 korrekt (wiederkehrend nie overdue), hier end-to-end bestaetigt.
- `app/todos/page.tsx` -- dezente Streak-Anzeige (Flame + Zahl, amber) pro wiederkehrender
  Aufgabe; `streak` im Instance-Typ.
- `lib/todo.test.ts` -- +6 Tests (buildRrule/rruleToLabel/rruleToMode + 3 Streak-Faelle).

## Deviation vom Plan

- T03 sagte "SQL Gaps-and-Islands". Streak wird stattdessen in JS ueber die RRULE-
  Vorkommen berechnet -- sauberer (kein DB-Dialekt-Sonderweg), testbar, und korrekt fuer
  beliebige Muster ("alle 2 Tage" zaehlt nur geplante Tage). Bewusste Vereinfachung.

## Verifikation

`tsc --noEmit` 0 Fehler; `vitest run` 23/23 (todo) gruen; `npm run build` gruen.
HTTP-Smoke Streak: taegliche Habit, vorgestern+gestern erledigt, heute offen -> streak 2,
Sektion "heute"; heute abgehakt -> streak 3, Sektion "erledigt". Smoke-Daten aufgeraeumt.

OFFEN: visuelle Abnahme der To-Dos-UI (Composer-Recurrence, Streak-Optik, Heute-Ansicht)
durch den User auf localhost:3000/todos.

## Naechster Schritt

Visuelle Abnahme. Danach M002 abgeschlossen. Spaeter: Kalender-Integration (To-Dos mit
Uhrzeit/Dauer in freie Slots) + ggf. Vercel-Deploy von M001+M002.
