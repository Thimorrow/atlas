---
milestone: M001
slice: S03
project: Atlas
created: 2026-06-26T14:10:19Z
status: in_progress
task_count: 5
completed_tasks: 3
---

# M001-S03 -- Slice Plan

**Goal:** Desktop-Frontend zeigt Wochenkalender + Today/Now-Ansicht mit allen
Event-Typen und freien Luecken, deployed auf Vercel.

## Tasks

- [x] T01 -- Wochenkalender-Ansicht (Desktop, design-first): SchoolBlocks + Routinen + manuelle Events rendern, Vertretung/Entfall visuell markiert, freie Luecken sichtbar. [Zeit-Raster + Dark/Light + framer-motion/lucide, build gruen, / 200; visuelle Abnahme durch User offen]
- [x] T02 -- Today/Now-Ansicht: "naechste Stunde/Event", "freie Luecken heute", offene flexible Ziele der Woche. [Tages-Agenda, Commit 9d5a403]
- [x] T03 -- Datenmodell + API erweitern: eigene Farbe (manuelle Events), Ort (location), Ganztag (all_day) als Spalten + Migration; Store-Validierung (parseNewManualEvent/Patch, parseNewRoutine/Patch) + expand-Mapping (Farbe/Ort/Ganztag durchreichen, manualToEvent.color).
- [ ] T04 -- Sheet-UI zum Anlegen/Bearbeiten: Plus-Button (oben rechts), rechtes Slide-in-Sheet (Name, Von-Bis via Time-Wheel 5-min, kuratierte Farb-Palette, Ort, Notiz, dezenter Ganztag-Schalter, Wahl einmalig vs. woechentlich), Klick auf eigenen Termin oeffnet vorausgefuellt (Edit/Delete); Untis-Refresh-Button (ruft /api/sync/untis).
- [ ] T05 -- Deploy auf Vercel (Account Thimorrow), Env-Vars (DATABASE_URL, WEBUNTIS_*), Smoke-Test mit echten Daten live; morgens-statt-Untis-tauglich.

## Done when

All tasks marked `[x]` and verified via `ytstack:summarize-task`.

## Notes

- Frontend ist erklaerte oberste Prioritaet, hier ist Zeit fuer Politur gut investiert.
- Git-Identitaet Thimorrow vor dem Deploy pruefen (sonst Vercel BLOCKED).
- Mit T04 sind die M001-Exit-Kriterien erfuellt (Atlas live, morgens statt Untis).
