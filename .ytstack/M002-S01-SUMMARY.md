---
milestone: M002
slice: S01
project: Atlas
completed: 2026-06-29T16:40:00Z
status: done
---

# M002-S01 -- Summary

**Was:** Komplette Datenschicht + API fuer das To-Dos-Modul (Habit x Todo-Hybrid).
RRULE-basierte Wiederholung, separates Completion-Log, "Heute"-Expansion -- ohne UI.

## Neue Dateien

- `lib/todo-store.ts` -- CRUD (`listTodos`/`createTodo`/`updateTodo`/`deleteTodo`),
  Completion-Toggle (`completeTodo` idempotent via onConflictDoNothing / `uncompleteTodo`),
  Loader (`listCompletions`/`listAllCompletions`), Validierung (`parseNewTodo`/
  `parseTodoPatch`/`parseCompletionDate`) + `validateRrule` (rrule.js, FREQ-Pflicht,
  RRULE:-Praefix wird entfernt).
- `lib/todo-expand.ts` -- `occurrencesInRange` (rrule.js, alles UTC-Mitternacht -> kein
  TZ-Drift), `buildTodayView` (pure: 3 Sektionen overdue/today/completed) + `getTodayView`
  (Loader). Einmalige Aufgaben: done = mind. 1 Completion; ueberfaellig wenn dueDate < heute.
  Wiederkehrend: nur heutiges Vorkommen, verpasste Tage erzeugen KEIN Overdue.
- `app/api/todos/route.ts` (GET Liste, POST), `app/api/todos/today/route.ts`
  (GET ?date=, Heute-Ansicht), `app/api/todos/[id]/route.ts` (PATCH, DELETE),
  `app/api/todos/[id]/complete/route.ts` (POST/DELETE Toggle, date im Body).
- `lib/todo.test.ts` -- 17 Tests (RRULE-Expansion, alle Heute-Faelle, Validierung, DB-Smoke).

## Geaenderte Dateien

- `lib/db/schema.ts` -- `todoPriority`-Enum, Tabellen `todos` (nullable `rrule`, `due_date`
  als Faelligkeit/Anker, kalender-ready `scheduled_time`/`est_minutes`, `archived_at`) +
  `todo_completions` (UNIQUE(todo_id,date), FK ON DELETE cascade) + Typen.
- `drizzle/0002_next_living_tribunal.sql` -- Migration, auf Neon-Dev angewendet.
- `package.json` -- Dependency `rrule`.

## Entscheidungen / Notizen

- `due_date` ist doppelt belegt: einmalig = Faelligkeit, wiederkehrend = DTSTART-Anker
  (Phase z.B. bei "alle 2 Tage"); Fallback-Anker = `createdAt`.
- Einmalige Aufgabe ohne Datum = "irgendwann", immer in Heute sichtbar.
- Archivieren bewusst noch nicht verdrahtet (Spalte da, Delete reicht fuer v1).

## Verifikation

`tsc --noEmit` 0 Fehler; `vitest run` 36/36 gruen (17 neu, inkl. DB-Smoke gegen Neon);
`npm run build` gruen (alle 4 Routen registriert). HTTP-Smoke gegen localhost:3000: POST
habit + einmalig -> 201; invalid rrule -> 400; /today zeigt overdue (einmalig 28.06.) +
today (habit); abhaken -> habit wandert in completed, today leer; DELETE -> 200 (Completion
per Cascade weg). Smoke-Daten aufgeraeumt.

## Naechster Schritt

S02: "Heute"-Ansicht + Sidebar-Modul (zwischen Kalender und Nachrichten). Frontend liest
`GET /api/todos/today?date=<lokal heute>`; Abhaken via Completion-Toggle.
