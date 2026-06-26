---
name: Atlas
slug: Atlas
created: 2026-06-26T13:57:07Z
updated: 2026-06-26T13:57:07Z
---

# Atlas

**One-liner:** Modulare All-in-one-App für den eigenen Schüler-Alltag, die nach und nach alles an einen Ort holt. Modul 1 ist ein Desktop-Kalender aus WebUntis-Stundenplan + festen Routinen + manuellen Events; Modul 2 (später) Nachrichten; langfristig Inbox + eigener Agent über offene API.

## What this project is

Atlas ist eine modulare All-in-one-App, die der Builder zuerst nur für sich selbst
baut (n=1 ist für jetzt ok). Der Kern-Wert ist **Aggregation: alles an einem Ort.**
Nicht ein einzelnes Feature, sondern dass der ganze Alltag in einer App lebt.

- **Modul 1 (v0):** Atlas-eigener Kalender = WebUntis-Stundenplan + feste Routinen
  (Arbeiten Mo/Di/Do, Klavier, Kirche, Fitness) + manuelle Events. Eigenes
  Event-Datenmodell, Untis ist nur ein dünner Importer-Adapter. Mit einer
  Today/Now-Ansicht ("was kommt als Nächstes", "freie Lücken heute").
- **Modul 2 (später):** Nachrichten (WhatsApp/Discord-Aggregation). Noch nicht jetzt.
- **Langfrist:** All-in-one-Inbox + eigener "Hermes"-Agent über eine offene API.
- **Plattform:** Web/Desktop zuerst, kein PWA/Mobile/native App am Anfang.

## Why it exists

Der Tag des Builders liegt über 5-6 Apps verteilt (Untis, WhatsApp, Discord, Notizen,
Kalender), nichts redet miteinander. Er sieht nie auf einen Blick, was jetzt zählt,
und seine freie Zeit verplant sich nie von selbst, obwohl Schulzeiten und Routinen
feststehen. Atlas existiert, damit alles an einem Ort liegt.

## Success criteria

v0 (Modul 1) ist fertig, wenn Atlas den echten Untis-Stundenplan (inkl.
Vertretung/Entfall) + feste Routinen + manuelle Events in *einem* Atlas-Kalender auf
dem Desktop zeigt, mit einer Today/Now-Ansicht, auf einem Frontend, auf das der
Builder stolz ist, und er es **jeden Morgen statt Untis aufmacht.**

Langfrist-Metrik: **Zeit bis zur ersten ersetzten App** (geplant: Nachrichten).
Aggregation liefert ab Modul 2 echten Wert.

## Current status

Initialisiert. Pitch validiert über office-hours (Builder-Mode, 5-Lesarten-Review)
+ CEO-Concept-Review (Verdikt PROCEED). Noch kein Milestone.
Nächster Schritt: `ytstack:plan-milestone` für Milestone 1 = Modul-1-Kalender.
