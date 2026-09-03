# Review-Notizen

Aufgeschobene Punkte, die beim naechsten Durchgang anzupacken sind.

## Offen

- **README hinkt hinterher.** Es beschreibt Atlas als "zwei Module ueber dem
  Stundenplan". Tatsaechlich gibt es fuenf plus eine native Android-App.
  Aufgenommen 2026-09-02.
- **Android-Tests laufen getrennt.** `npm test` deckt nur die Web-Seite ab; die
  11 Kotlin-Testdateien unter `android/app/src/test` brauchen einen eigenen
  Gradle-Lauf. Ein gemeinsamer Befehl fehlt. Aufgenommen 2026-09-02.
- **Prozessluecke.** M003 lief ohne Slices, ohne Task-Plaene und ohne
  mitlaufende Summary; STATE.md hing danach 51 Commits hinterher. Bei M004
  wieder `plan-milestone` -> `slice-milestone` benutzen. Aufgenommen 2026-09-02.

## Erledigt

- **Testlauf ohne DB war rot.** `lib/calendar.test.ts` und
  `lib/untis/sync.test.ts` liessen ihre `beforeAll`/`afterAll`-Hooks auch ohne
  `DATABASE_URL` gegen Neon laufen und faerbten jeden Lauf ohne Datenbank rot.
  Behoben am 2026-09-02 mit `describe.skipIf(!mitDb)`.
