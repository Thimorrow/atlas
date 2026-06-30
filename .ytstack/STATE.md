---
project: Atlas
slug: Atlas
last_updated: 2026-06-30T00:00:00Z
current_milestone: M002
active_slice: S04
active_task: T01
---

# State

**Status:** M002 Backend fertig & verifiziert (S01: `todos`+`todo_completions` auf Neon,
RRULE-Expansion, CRUD + Completion-Toggle, "Heute"-API, Streak-Logik). **Frontend bewusst
geloescht** -- erste Design-Umsetzung (Hero-Ring/Karten) gefiel dem User nicht, wird neu
gedacht. Geloescht: `app/todos/`, `components/todo-sheet.tsx`, `components/ui/badge.tsx`,
Sidebar-Eintrag. **Behalten** (Backend + reine Logik): `lib/todo-store.ts`,
`lib/todo-expand.ts`, `lib/todo-recurrence.ts`, `app/api/todos/**`, `lib/todo.test.ts`
(42/42 gruen). M001 (Kalender) funktional fertig bis auf zurueckgestellten Vercel-Deploy.

## Next action

**S04 (neu): Todos subtil im Kalender.** User-Wunsch: Aufgaben sollen im Kalender (M001)
auftauchen, aber SUBTIL -- "nicht als KOMPLETT eigener Eintrag ... echt subtil". Plan:
`M002-S04-T01-PLAN.md` (Range-Endpoint + Einweb in Heute-Agenda als schlanke Checkbox-Zeile
+ dezente Punkte im Wochen-Raster; nur konkret terminierte Aufgaben). S02-Frontend
(`app/todos/`) wurde inzwischen neu gebaut und liegt vor. Backend-API steht:
`GET /api/todos/today?date=`, `POST/PATCH/DELETE /api/todos`, `POST/DELETE /api/todos/[id]/complete`.

## Open decisions

- Modul 2 (Nachrichten) bewusst noch nicht durchgeplant, kommt nach dem Kalender.
- Routinen-Modell: feste Wochen-Regeln vs. flexible "X mal pro Woche"-Ziele (relevant ab Auto-Fill).
- Persistenz konkret: Supabase vs. Neon (beides Postgres, im Milestone festzurren).

## Recent summaries

(Latest 3 T##-SUMMARY.md entries will appear here.)
