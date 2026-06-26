---
milestone: M001
slice: S02
task: T01
project: Atlas
completed: 2026-06-26T17:26:00Z
status: done
---

# M001-S02-T01 -- Summary

**Was gemacht:** CRUD-Backend + API-Routen fuer Routine und ManualEvent.
- `lib/calendar-store.ts`: reine Store-Funktionen ueber `db`
  (list/create/update/delete fuer routines + manual_events, `returning()`,
  `updatedAt: now()` beim Update) + Input-Parser (`parseNewRoutine`,
  `parseRoutinePatch`, `parseNewManualEvent`, `parseManualEventPatch`). Validierung:
  title non-empty, type-Enum, fixed -> weekday 0..6 + Zeit (HH:MM[:SS]) / openEnded,
  flexible_goal -> targetPerWeek>=1, date YYYY-MM-DD. Store ist testbar (fuer T04),
  Routen bleiben duenn.
- `app/api/routines/route.ts` (GET/POST), `app/api/routines/[id]/route.ts`
  (PATCH/DELETE), `app/api/events/route.ts` (GET/POST), `app/api/events/[id]/route.ts`
  (PATCH/DELETE). Alle `nodejs` runtime + `force-dynamic`. Next-16-`params` sind ein
  Promise -> `await params`.

**Verifikation (bestanden, live auf :3000):**
- `npm run build` gruen, alle 4 Routen registriert.
- POST fixed-Routine (Klavier) + flexible_goal (Sport 3x) + ManualEvent (Arzt) -> je 201.
- Validierung: fixed ohne weekday -> 400; kaputte Zeit im PATCH -> 400.
- PATCH Klavier (Ende 18:30, Farbe) -> 200, `updatedAt` neu. Unbekannte id -> 404.
- DELETE -> 200; zweites DELETE derselben id -> 404. Endzustand: beide Listen leer
  (Testzeilen aufgeraeumt, DB sauber).

**Notizen:**
- `time`-Spalten liefern wieder `HH:MM:SS` (s. KNOWLEDGE) -> Frontend (S03) kuerzt.
- Auth bewusst nicht eingebaut (n=1, lokal). Spaeter bei Multi-User nachziehen.
