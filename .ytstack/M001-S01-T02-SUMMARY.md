---
milestone: M001
slice: S01
task: T02
project: Atlas
completed: 2026-06-26T14:45:00Z
status: done
---

# M001-S01-T02 -- Summary

**Was gemacht:** Event-Datenmodell in Drizzle definiert (`lib/db/schema.ts`): 2 Enums
(`school_block_status`, `routine_type`), 3 Tabellen (`school_blocks`, `routines`,
`manual_events`). Beide Routine-Arten in einer Tabelle (fixed: weekday/start/end/
open_ended; flexible_goal: target_per_week). `school_blocks` mit `status`
(regular/cancelled/substituted), unique `(untis_lesson_id, date)` fuer idempotenten
Re-Sync + Index auf `date`. Migration `0000_youthful_venus` generiert und auf Neon
angewendet. `dotenv` ergaenzt (drizzle-kit laedt `.env.local`), `db:migrate`-Script.

**Vom Builder freigegeben:** weekday 0=Montag, eine Routine-Tabelle, kein user_id (n=1).

**Verifikation (bestanden):**
- `npm run build` -> exit 0, Schema type-checkt.
- `npm run db:migrate` -> "migrations applied successfully" gegen Neon.
- information_schema-Check: `manual_events`, `routines`, `school_blocks` vorhanden.

**Notizen:** FreeSlot wird berechnet, nicht gespeichert. Neon direkte (nicht-pooled)
Verbindung; fuer Serverless-Runtime evtl. spaeter auf pooled umstellen.
