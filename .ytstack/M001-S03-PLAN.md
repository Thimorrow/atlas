---
milestone: M001
slice: S03
project: Atlas
created: 2026-06-26T14:10:19Z
status: in_progress
task_count: 4
completed_tasks: 1
---

# M001-S03 -- Slice Plan

**Goal:** Desktop-Frontend zeigt Wochenkalender + Today/Now-Ansicht mit allen
Event-Typen und freien Luecken, deployed auf Vercel.

## Tasks

- [x] T01 -- Wochenkalender-Ansicht (Desktop, design-first): SchoolBlocks + Routinen + manuelle Events rendern, Vertretung/Entfall visuell markiert, freie Luecken sichtbar. [Zeit-Raster + Dark/Light + framer-motion/lucide, build gruen, / 200; visuelle Abnahme durch User offen]
- [ ] T02 -- Today/Now-Ansicht: "naechste Stunde/Event", "freie Luecken heute", offene flexible Ziele der Woche.
- [ ] T03 -- UI zum Anlegen/Bearbeiten von manuellen Events + Routinen (Formulare) + Untis-Refresh-Button (ruft /api/sync/untis).
- [ ] T04 -- Deploy auf Vercel (Account Thimorrow), Env-Vars (DATABASE_URL, WEBUNTIS_*), Smoke-Test mit echten Daten live; morgens-statt-Untis-tauglich.

## Done when

All tasks marked `[x]` and verified via `ytstack:summarize-task`.

## Notes

- Frontend ist erklaerte oberste Prioritaet, hier ist Zeit fuer Politur gut investiert.
- Git-Identitaet Thimorrow vor dem Deploy pruefen (sonst Vercel BLOCKED).
- Mit T04 sind die M001-Exit-Kriterien erfuellt (Atlas live, morgens statt Untis).
