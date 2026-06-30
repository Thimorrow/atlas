---
milestone: M002
slice: S02
project: Atlas
created: 2026-06-29T16:24:49Z
status: planned
task_count: 5
completed_tasks: 5
---

# M002-S02 -- Slice Plan

**Goal:** To-Dos als eigenes Sidebar-Modul zwischen Kalender und Nachrichten mit
"Heute"-Standardansicht: faellige Aufgaben sehen, abhaken, einmalige Aufgaben anlegen/bearbeiten.

## Tasks

- [x] T01 -- Sidebar/Nav: To-Dos-Eintrag **zwischen Kalender und Nachrichten** + Route `/todos` (Icon via better-icons, aktiver Zustand wie bestehende Nav)
- [x] T02 -- "Heute"-Seite `/todos`: Sektionen **Ueberfaellig / Heute / Erledigt**, Liste aus `/api/todos?date=heute` rendern, Leerzustand ("nichts faellig")
- [x] T03 -- Abhaken-Interaktion: Checkbox toggelt Completion (optimistic update gegen Toggle-API), erledigte wandern live in die Erledigt-Sektion; press-scale/Haken-Motion
- [x] T04 -- Einmalige Aufgabe anlegen + bearbeiten/loeschen: schlanker Composer (Titel, optional Datum, Farbe, Notiz), POST/PATCH/DELETE `/api/todos`; Klick auf Aufgabe oeffnet Edit
- [x] T05 -- Polish: Motion + reduced-motion-Gate konsistent zum Kalender, text-wrap, einheitliche press-scale (0.96)

## Done when

All tasks marked `[x]` and verified via `ytstack:summarize-task`. Auf localhost: Aufgabe
anlegen -> erscheint in Heute; abhaken -> wandert in Erledigt; reload haelt Zustand.

## Notes

- Heute-Sektionierung Default: Ueberfaellig / Heute / Erledigt (korrigierbar).
- Composer kann das bestehende `event-sheet`-Muster als Vorlage nehmen (Slide-in), aber
  schlanker -- To-Dos brauchen keine Von-Bis-Zeit in v1.
- Wiederkehrende Aufgaben anlegen kommt in S03; hier erstmal nur einmalige.
