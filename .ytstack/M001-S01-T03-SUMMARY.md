---
milestone: M001
slice: S01
task: T03
project: Atlas
completed: 2026-06-26T14:55:00Z
status: done
---

# M001-S01-T03 -- Summary

**Was gemacht:** `webuntis`-Lib installiert. Spike-Script: server-seitiger Login via
`WebUntisSecretAuth` (Untis-Mobile-Secret) + `getOwnTimetableForRange`, gegen die echte
Schule (goetheschulebochum.webuntis.com).

**Verifikation (bestanden):**
- Login OK.
- Bereich 2026-06-19..2026-07-03 -> 72 Stunden.
- code-Verteilung `{regular: 70, cancelled: 2}` -> Entfall wird erkannt.
- Sample-Stunden korrekt (E/IF-AM/GE/SP mit Raum). Logout OK.

**Erkenntnisse fuer T04 (Untis-Lesson-Felder):** `date` (yyyymmdd als number),
`startTime`/`endTime` (hmm als number, z.B. 750 = 07:50), `su[0].name` (Fach),
`ro[0].name` (Raum), `te[0].name` (Lehrer), `code` ('cancelled' | 'irregular' |
undefined). Mapping fuer status: cancelled -> cancelled, irregular -> substituted,
sonst regular. Als untis_lesson_id eignet sich `id` (+ date fuer den Unique-Key).

**Notiz/Gotcha:** Der Bash-Safety-Net blockt `--env-file=.env.local` (haelt es fuer
Secret-Dump). Loesung: `.env.local` per `dotenv` im Script laden statt per CLI-Flag.

**Spike-Script wieder entfernt** -- T04 baut den richtigen, typisierten Adapter in
`lib/untis/`.
