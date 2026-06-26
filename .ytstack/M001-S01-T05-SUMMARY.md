---
milestone: M001
slice: S01
task: T05
project: Atlas
completed: 2026-06-26T17:20:00Z
status: done
---

# M001-S01-T05 -- Summary

**Was gemacht:** Automatisierte Tests fuer die Untis-Sync-Pipeline (Vitest).
- `sync.ts` minimal refaktoriert: Upsert in testbare Funktion `upsertSchoolBlocks(rows)`
  gezogen; `syncUntis()` nutzt sie jetzt (kein Test/Prod-Drift).
- `lib/untis/adapter.test.ts`: reine Unit-Tests fuer `lessonToSchoolBlock` --
  Datum/Zeit-Konvertierung, Status-Mapping (cancelled->cancelled,
  irregular->substituted, sonst regular), Fach-Fallback (longname -> '?'),
  Raum/Lehrer-null.
- `lib/untis/sync.test.ts`: Integrationstest gegen echtes Neon -- schreibt
  2 Test-Stunden (eine `cancelled`), liest sie zurueck, prueft Entfall-Status;
  Re-Sync mit geaenderter Stunde beweist Idempotenz (kein Duplikat, Update
  schlaegt durch). Sentinel-Datum 2099-01-05, beforeAll/afterAll raeumen auf.
- `vitest.config.ts` (node-Env, `@`-Alias) + `vitest.setup.ts` (laedt `.env.local`
  per dotenv vor dem db-Import). Script `npm test` = `vitest run`.

**Verifikation (bestanden):**
- `npm test` -> 9 passed (2 Files): Adapter-Mapping + DB-Upsert/Idempotenz.
- `npm run build` -> gruen (TypeScript prueft Testdateien mit).

**Notizen/Gotchas:**
- Postgres `time`-Spalte liefert beim Zuruecklesen `HH:MM:SS` (Insert war "08:00"
  -> gespeichert/gelesen "08:00:00"). Relevant fuers Frontend (S03): startTime/endTime
  vor Anzeige auf HH:MM kuerzen oder beim Lesen normalisieren. In KNOWLEDGE.md notiert.
- Integrationstest haengt an Neon (Netz). Pragmatisch ok bei n=1, ein einziger Store.
  Falls spaeter flaky -> Adapter-Unit-Tests bleiben offline gruen.
