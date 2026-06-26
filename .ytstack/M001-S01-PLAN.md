---
milestone: M001
slice: S01
project: Atlas
created: 2026-06-26T14:10:19Z
status: done
task_count: 5
completed_tasks: 5
---

# M001-S01 -- Slice Plan

**Goal:** Atlas zieht den echten WebUntis-Stundenplan (inkl. Vertretung/Entfall)
server-seitig und speichert ihn im eigenen Event-Store (Neon + Drizzle).

## Tasks

- [x] T01 -- Next.js (TypeScript, App Router) aufsetzen + Neon-DB anlegen + Drizzle konfigurieren (DATABASE_URL, leere Initial-Migration). [Next 16.2.9, buildet gruen; Neon-URL-Apply pending]
- [x] T02 -- Event-Datenmodell in Drizzle: SchoolBlock{status: regular|cancelled|substituted}, Routine{type: fixed|flexible_goal}, ManualEvent (FreeSlot wird abgeleitet, nicht gespeichert). Migration anwenden. [Schema + Migration 0000 angewendet auf Neon + verifiziert (3 Tabellen live), buildet gruen]
- [x] T03 -- WebUntis-Spike: server-seitiges Login via Untis-Mobile-Secret (WebUntisSecretAuth), echten Stundenplan inkl. Vertretung/Entfall roh abrufen + im Log verifizieren. Secret in .env, nie im Client. [Login OK, 72 Stunden, 2 cancelled erkannt; verifiziert]
- [x] T04 -- Duenner, austauschbarer Untis-Import-Adapter: Lessons -> SchoolBlock-Events (inkl. status) mappen + in Neon persistieren. Server-Route POST /api/sync/untis (on-demand). [verifiziert end-to-end: POST -> 72 Stunden, 2 cancelled, in Neon]
- [x] T05 -- Integrationstest: Sync-Route schreibt SchoolBlocks (inkl. einer cancelled-Stunde) in die DB; Query liefert sie korrekt zurueck. [Vitest: 9 Tests gruen (Adapter-Mapping + Neon-Upsert/Idempotenz); npm run build gruen]

## Done when

All tasks marked `[x]` and verified via `ytstack:summarize-task`.

## Notes

- Erster Task mit echtem Risiko ist T03 (Untis-Login). Wenn das Secret nicht zieht,
  hier stoppen und Auth klaeren, bevor T04/T05 laufen.
- Adapter (T04) bewusst duenn halten: SchoolBlock-Modell darf nicht von Untis-Feldnamen
  abhaengen (Sunset-Risiko der inoffiziellen API).
