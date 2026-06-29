---
project: Atlas
slug: Atlas
last_updated: 2026-06-27T19:02:27Z
current_milestone: M001
active_slice: S03
active_task: T04_pending_visual_acceptance
---

# State

**Status:** M001 / S03 / T03 planned -- ready to execute. S01 + S02 komplett, S03-T01
(Wochenkalender) + T02 (Today/Now-Agenda) done. T03 erweitert Datenmodell/API um eigene
Farbe (manuelle Events), Ort + Ganztag. Slice neu gesplittet: T03 (Daten/API), T04
(Sheet-UI Anlegen/Bearbeiten + Plus + Time-Wheel + Palette), T05 (Deploy Vercel).

## Next action

S03-T03: Datenmodell + API -- manual_events.color/location/all_day + routines.location/
all_day, Migration, Store-Validierung, expand-Mapping (manualToEvent.color durchreichen).
Danach T04 (Sheet-UI) und T05 (Deploy). Hinweis: HOUR_H (page.tsx) <-> --hour-h
(globals.css) konsistent halten.

## Open decisions

- Modul 2 (Nachrichten) bewusst noch nicht durchgeplant, kommt nach dem Kalender.
- Routinen-Modell: feste Wochen-Regeln vs. flexible "X mal pro Woche"-Ziele (relevant ab Auto-Fill).
- Persistenz konkret: Supabase vs. Neon (beides Postgres, im Milestone festzurren).

## Recent summaries

(Latest 3 T##-SUMMARY.md entries will appear here.)
