---
milestone: M002
project: Atlas
created: 2026-06-29T16:24:49Z
size: M
---

# M002 -- Context

## Goal

Atlas hat ein eigenes **To-Dos-Modul** (Habit-Tracker x To-Do-Hybrid): einmalige und
wiederkehrende Aufgaben anlegen und in einer "Heute"-Standardansicht abhaken -- standalone,
vom Datenmodell bis zum Frontend komplett. (Kalender-Integration kommt bewusst spaeter.)

## Exit criteria

1. Neue Tabellen in Neon via Drizzle-Migration: `todos` (nullable `rrule`, `due_date`,
   kalender-ready Spalten `scheduled_time`/`est_minutes`) + `todo_completions`
   (todo_id + date, UNIQUE pro Tag).
2. CRUD-API gegen `/api/todos` (anlegen/bearbeiten/loeschen) + Abhaken/Enthaken
   (Completion-Log toggeln).
3. Sidebar-Eintrag **zwischen Kalender und Nachrichten**; "Heute"-Standardansicht zeigt
   faellige einmalige Aufgaben + heute-faellige wiederkehrende Aufgaben, abhakbar.
4. Wiederkehrende Aufgaben via RRULE (rrule.js), inkl. "alle 2 Tage". Verpasste Habits =
   nur "nicht erledigt" (Streak bricht, nicht ueberfaellig); einmalige Aufgaben bleiben
   ueberfaellig sichtbar.

## Decisions locked in discuss phase

- 2026-06-29: Recurrence als **RRULE-String** (RFC 5545) speichern, via `rrule.js`; kein
  Eigenformat. Begruendung: Standard, zukunftssicher, deckt "alle 2 Tage"/Wochentage,
  passt spaeter nahtlos in den Kalender. (Deep-Research, 102 Agenten, 5 Quellen einstimmig.)
- 2026-06-29: Instanzen **nicht** vorgenerieren -- on-demand via `rrule.between(heute)`.
- 2026-06-29: Erledigungen in separatem **Completion-Log** (`todo_completions`), nicht als
  Instanz-Zeilen. Abhaken = Zeile rein, Enthaken = Zeile raus.
- 2026-06-29: Hybrid Habit/einmalig = eine `todos`-Tabelle mit **nullable `rrule`** (null =
  einmalig, gesetzt = Habit/wiederkehrend).
- 2026-06-29: Verpasste Habits brechen nur den Streak (nicht ueberfaellig); einmalige
  Aufgaben bleiben ueberfaellig sichtbar bis erledigt.
- 2026-06-29: Streaks via SQL Gaps-and-Islands -- Schema trackt automatisch; UI-Anzeige
  nur, wenn sie sauber wird, sonst weglassen.
- 2026-06-29: Bestehender Kalender (`routines`) bleibt unangetastet; Harmonisierung auf
  RRULE optional spaeter bei der Kalender-Integration.

## Open questions

- Listen/Tags/Gruppen fuer To-Dos? (Default bisher: flach. Bei Slicing entscheiden.)
- Subtasks/Checklisten? (Default: nein, spaeter.)
- Genaue "Heute"-Sektionierung (Ueberfaellig / Heute / Erledigt) -- in S02 festlegen.
