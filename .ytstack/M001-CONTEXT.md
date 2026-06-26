---
milestone: M001
project: Atlas
created: 2026-06-26T14:01:26Z
size: M
---

# M001 -- Context

## Goal

Atlas zeigt meinen echten WebUntis-Stundenplan (inkl. Vertretung/Entfall) plus meine
festen Routinen und manuelle Events in einem eigenen Desktop-Kalender mit Today/Now-
Ansicht, deployed auf Vercel, sodass ich ihn morgens statt Untis aufmache.

## Exit criteria

1. Login via Untis-Mobile-Secret funktioniert server-seitig; echter Stundenplan inkl.
   Vertretung/Entfall wird gezogen und im Atlas-Event-Store (Postgres) gespeichert.
2. Routinen lassen sich anlegen/bearbeiten, beide Arten: feste (Arbeiten Mo/Di/Do,
   Klavier, Kirche) erscheinen als First-Class-Events neben den Untis-Stunden;
   flexible Ziele (z.B. Fitness 3x/Woche) werden als Target gespeichert/angezeigt
   (Auto-Platzierung ab Modul 2). Plus manuelle Events.
3. Wochenkalender + Today/Now-Ansicht ("naechste Stunde/Event", "freie Luecken heute")
   rendern sauber auf dem Desktop.
4. Auf Vercel deployed (Account Thimorrow); ich oeffne Atlas morgens statt Untis.

## Size

M -- see M001-ROADMAP.md for slice breakdown.

## Decisions locked in discuss phase

- 2026-06-26: Architektur = Atlas-nativer Kalender (Approach B), eigenes Event-Modell
  (SchoolBlock{status}/Routine/Task/FreeSlot), Untis als duenner austauschbarer
  Importer-Adapter. Kein Plugin-Framework / keine spekulative offene API im v0.
  (Siehe DECISIONS.md.)
- 2026-06-26: WebUntis-Zugang via Untis-Mobile-Secret/QR, Sync server-seitig, Secret
  nie im Client.
- 2026-06-26: Stack = Next.js + Neon (serverless Postgres) + Drizzle ORM auf Vercel.
- 2026-06-26: Routinen-Modell M001 = BEIDE Arten. A) fixed-schedule (fester Tag/Zeit,
  offenes Ende) rendert als wiederkehrende Events. B) flexible-goal ("X mal pro Woche")
  wird als Ziel gespeichert/angezeigt; automatisches Reinlegen in freie Slots erst ab
  Auto-Planer (Modul 2+). Modell traegt B von Anfang an (kein Rebuild).
- 2026-06-26: Web/Desktop zuerst, kein PWA/Mobile.

## Open questions

- Sync-Cadence: v0-Default beim Oeffnen + manueller Refresh-Button (in S01 bestaetigen).
