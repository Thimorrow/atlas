---
milestone: M001
slice: S01
task: T04
project: Atlas
completed: 2026-06-26T15:05:00Z
status: done
---

# M001-S01-T04 -- Summary

**Was gemacht:** Untis-Import-Pipeline als Produktionscode.
- `lib/untis/client.ts`: `fetchTimetable()` via `WebUntisSecretAuth` (server-only,
  Secret nie im Client). 6.-Argument-Typquirk per `@ts-expect-error` (Laufzeit-Default
  fuer authenticator).
- `lib/untis/adapter.ts`: `lessonToSchoolBlock()` inkl. status-Mapping
  (cancelled->cancelled, irregular->substituted), Datum/Zeit-Konvertierung. Untis-
  Feldnamen leben nur hier (duenner, austauschbarer Adapter).
- `lib/untis/sync.ts`: `syncUntis()` = fetch + idempotenter Upsert (onConflict
  untis_lesson_id + date). `defaultSyncWindow()` = heute-7 .. heute+21.
- `app/api/sync/untis/route.ts`: POST-Route (nodejs runtime, force-dynamic).
- `next.config.ts`: `serverExternalPackages: ["webuntis"]`.

**Verifikation (bestanden, end-to-end):**
- `next start` auf Port 3000 (Diekmann-Server dort auf User-Wunsch beendet).
- `POST /api/sync/untis` -> `{ok:true, fetched:72, upserted:72, window 2026-06-19..07-17}`.
- DB: `school_blocks` total 72, status `regular=70, cancelled=2` -> Entfall korrekt
  persistiert.

**Notizen/Gotchas:**
- `otplib`-Named-Import scheitert unter Turbopack; 5-Arg-Konstruktor + `@ts-expect-error`
  (webuntis nutzt internes otplib als Default) ist der verifizierte Weg.
- Port 3000 lief vorher das Diekmann-Projekt (EADDRINUSE). Jetzt Atlas.
- `next start` braucht einen frischen Build; nach EADDRINUSE-Crash half ein Rebuild.
- Roher neon-Treiber gibt `date` als Date-Objekt (tz-Shift in Anzeige); Drizzle liefert
  'YYYY-MM-DD' -- in der App also korrekt.
