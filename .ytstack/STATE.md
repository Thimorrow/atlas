---
project: Atlas
slug: Atlas
last_updated: 2026-06-26T17:45:00Z
current_milestone: M001
active_slice: S03
active_task: T02
---

# State

**Status:** M001 / S03 in Arbeit (1/4). S01 + S02 komplett. S03-T01 done: Wochenkalender
(Zeit-Raster, Dark/Light-Theme, framer-motion + lucide-react, Aesthetik Himmels-Almanach)
-- build gruen, / liefert 200, headless verifiziert. VISUELLE ABNAHME durch User offen
(localhost:3000). Atlas laeuft auf localhost:3000.

## Next action

S03-T02: Today/Now-Ansicht -- "naechste Stunde/Event", "freie Luecken heute", offene
flexible Ziele der Woche. Danach T03 (Formulare zum Anlegen/Bearbeiten + Untis-Refresh-
Button) und T04 (Deploy Vercel, Account Thimorrow). Hinweis: HOUR_H (page.tsx) <-> --hour-h
(globals.css) konsistent halten.

## Open decisions

- Modul 2 (Nachrichten) bewusst noch nicht durchgeplant, kommt nach dem Kalender.
- Routinen-Modell: feste Wochen-Regeln vs. flexible "X mal pro Woche"-Ziele (relevant ab Auto-Fill).
- Persistenz konkret: Supabase vs. Neon (beides Postgres, im Milestone festzurren).

## Recent summaries

(Latest 3 T##-SUMMARY.md entries will appear here.)
