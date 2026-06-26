---
milestone: M001
project: Atlas
size: M
created: 2026-06-26T14:01:26Z
status: planned
total_slices: 3
completed_slices: 2
---

# M001 Roadmap

**Goal:** Atlas zeigt meinen echten WebUntis-Stundenplan (inkl. Vertretung/Entfall)
plus feste Routinen und manuelle Events in einem eigenen Desktop-Kalender mit Today/
Now-Ansicht, deployed auf Vercel, sodass ich ihn morgens statt Untis aufmache.

**Exit criteria:**
1. Login via Untis-Mobile-Secret server-seitig; Stundenplan inkl. Vertretung/Entfall
   im Atlas-Event-Store (Postgres).
2. Routinen (feste + flexible Ziele) + manuelle Events: feste rendern als First-Class-
   Events neben den Untis-Stunden, flexible Ziele als Target gespeichert (Auto-
   Platzierung ab Modul 2).
3. Wochenkalender + Today/Now-Ansicht auf dem Desktop.
4. Auf Vercel deployed; morgens statt Untis geoeffnet.

## Slices

Slice detail lives in per-slice `M001-S##-PLAN.md` files, created by `ytstack:slice-milestone`.

- [x] S01 -- WebUntis-Anbindung + Event-Datenmodell + Persistenz (Spike Untis-Mobile-Secret, server-seitiger Ingest inkl. Vertretung/Entfall, Postgres-Store)
- [x] S02 -- Routinen (feste + flexible-goal) + manuelle Events (First-Class-CRUD im Store, neben Untis-Stunden)
- [ ] S03 -- Frontend (Wochenkalender + Today/Now-Ansicht) + Deploy auf Vercel

## Run order

Slices execute sequentially. After each slice, `ytstack:reassess-roadmap` checks if the plan still fits reality.

## How to update this file

- Flip slice checkbox `[ ]` -> `[x]` when its tasks are all `summarize-task`-confirmed
- Update `completed_slices` count
- On milestone completion, flip `status: planned` -> `status: done` and update global ROADMAP.md
