---
milestone: M002
slice: S03
project: Atlas
created: 2026-06-29T16:24:49Z
status: done
task_count: 4
completed_tasks: 4
---

# M002-S03 -- Slice Plan

**Goal:** Wiederkehrende Aufgaben sind voll nutzbar -- Wiederholung im Composer einstellen
(RRULE), Ueberfaellig-Verhalten final korrekt, Streaks dezent angezeigt (wenn sauber).

## Tasks

- [x] T01 -- Wiederholungs-UI im Composer: Presets (taeglich, alle 2 Tage, bestimmte Wochentage, woechentlich) -> RRULE-String bauen; gewaehlte Regel menschenlesbar anzeigen ("Alle 2 Tage")
- [x] T02 -- Ueberfaellig-Verhalten finalisieren: einmalige Aufgaben bleiben in Ueberfaellig sichtbar bis erledigt; verpasste Habits erscheinen NICHT als ueberfaellig (nur Streak-Bruch) -- in der Heute-Ansicht korrekt durchgezogen
- [x] T03 -- Streak-Berechnung (SQL Gaps-and-Islands ueber `todo_completions`) + dezente Anzeige (z.B. "5") pro Habit -- nur einbauen, wenn es sauber aussieht, sonst bewusst weglassen
- [x] T04 -- Verifikation end-to-end (anlegen wiederkehrend, mehrere Tage simulieren/abhaken, Streak + Overdue pruefen) + `ytstack:reassess-roadmap`

## Done when

All tasks marked `[x]` and verified via `ytstack:summarize-task`. Wiederkehrende Aufgabe
laesst sich anlegen, taucht an den richtigen Tagen auf, Streak/Overdue verhalten sich wie
in M002-CONTEXT festgelegt.

## Notes

- Streak ist explizit "nice to have, wenn sauber" -- kein Blocker fuers Milestone-Exit.
- RRULE-Presets bewusst klein halten (Sids reale Faelle: taeglich, alle 2 Tage, Wochentage).
  Volles RRULE-Parsing kann rrule.js, UI muss aber nicht jeden Edge-Case anbieten.
