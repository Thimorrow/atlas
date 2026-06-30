---
milestone: M002
slice: S01
project: Atlas
created: 2026-06-29T16:24:49Z
status: done
task_count: 5
completed_tasks: 5
---

# M002-S01 -- Slice Plan

**Goal:** Datenschicht + API fuer To-Dos steht: `todos` + `todo_completions` in Neon,
RRULE-Expansion auf einen Datumsbereich, CRUD + Abhaken/Enthaken -- alles getestet, ohne UI.

## Tasks

- [x] T01 -- Drizzle-Schema `todos` (id, title, notes?, color, priority?, `rrule` text NULL, `due_date` date NULL, `scheduled_time` time NULL, `est_minutes` int NULL, archived_at, created_at) + `todo_completions` (id, todo_id FK, date, created_at, UNIQUE(todo_id,date)) in `lib/db/schema.ts`; Migration generieren (`drizzle-kit generate`) + auf Neon-Dev anwenden (`drizzle-kit migrate`)
- [x] T02 -- `lib/todo-store.ts`: `parseNewTodo`/`parseTodoPatch` (RRULE via rrule.js validieren, einmalig = rrule null + due_date, gegenseitige Plausibilitaet) + CRUD-Funktionen (list/create/update/archive)
- [x] T03 -- `lib/todo-expand.ts`: Datumsbereich-Expansion -- einmalige (due_date) + wiederkehrende (`rrule.between`) zu Tages-Instanzen mergen, Completion-Log joinen (done-Flag pro Tag), `overdue`-Flag nur fuer einmalige; verpasste Habits erzeugen KEINE Overdue-Instanz
- [x] T04 -- API-Routen: `/api/todos` (GET Liste + ?date=heute, POST, PATCH, DELETE) + Completion-Toggle (POST/DELETE auf `/api/todos/[id]/complete` mit date)
- [x] T05 -- Vitest (`lib/todo.test.ts`): "alle 2 Tage" (`FREQ=DAILY;INTERVAL=2`) liefert korrekte Tage; Abhaken legt Completion an + Enthaken entfernt sie; ueberfaellige einmalige Aufgabe bleibt overdue; verpasste Habit ist nicht overdue

## Done when

All tasks marked `[x]` and verified via `ytstack:summarize-task`. `tsc --noEmit` clean,
`vitest run` gruen, Migration auf Neon-Dev angewendet.

## Notes

- Default-Entscheidungen (korrigierbar): flache To-Do-Liste, **keine** Listen/Tags in v1;
  keine Subtasks in v1.
- An bestehendes Muster `manual_events`/`routines` in `lib/db/schema.ts` +
  `lib/calendar-store.ts` / `lib/calendar-expand.ts` anlehnen.
- `rrule` als npm-Dependency hinzufuegen.
- color: gleiche OKLCH-Palette wie Events (`lib/event-colors.ts`) wiederverwenden.
