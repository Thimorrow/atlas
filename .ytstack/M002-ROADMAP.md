---
milestone: M002
project: Atlas
size: M
created: 2026-06-29T16:24:49Z
status: planned
total_slices: 4
completed_slices: 1
---

# M002 Roadmap

**Goal:** Atlas hat ein eigenes To-Dos-Modul (Habit-Tracker x To-Do-Hybrid): einmalige und
wiederkehrende Aufgaben anlegen und in einer "Heute"-Standardansicht abhaken -- standalone,
vom Datenmodell bis zum Frontend komplett.

**Exit criteria:**
1. Neue Tabellen in Neon via Drizzle-Migration: `todos` (nullable `rrule`, `due_date`,
   kalender-ready `scheduled_time`/`est_minutes`) + `todo_completions` (UNIQUE pro Tag).
2. CRUD-API gegen `/api/todos` + Abhaken/Enthaken (Completion-Log toggeln).
3. Sidebar-Eintrag zwischen Kalender und Nachrichten; "Heute"-Ansicht zeigt faellige
   einmalige + heute-faellige wiederkehrende Aufgaben, abhakbar.
4. Wiederkehrende Aufgaben via RRULE (rrule.js); verpasste Habits brechen nur den Streak,
   einmalige bleiben ueberfaellig.

## Slices

Slice detail lives in per-slice `M002-S##-PLAN.md` files, created by `ytstack:slice-milestone`.

- [x] S01 -- Datenmodell + API (todos + todo_completions, Drizzle-Migration, RRULE-Expansion, CRUD + Toggle)
- [ ] S02 -- "Heute"-Ansicht + Sidebar-Modul (zwischen Kalender/Nachrichten, abhaken, einmalig anlegen)
- [ ] S03 -- Wiederkehrende Aufgaben (RRULE-UI) + Ueberfaellig-Verhalten + Streak-Politur
- [ ] S04 -- Kalender-Integration: Todos subtil im Kalender (Heute-Agenda + Wochen-Raster), nutzt `scheduled_time`

## Run order

Slices execute sequentially. After each slice, `ytstack:reassess-roadmap` checks if the plan still fits reality.

## How to update this file

- Flip slice checkbox `[ ]` -> `[x]` when its tasks are all `summarize-task`-confirmed
- Update `completed_slices` count
- On milestone completion, flip `status: planned` -> `status: done` and update global ROADMAP.md
