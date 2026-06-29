---
milestone: M001
slice: S03
task: T04
project: Atlas
completed: 2026-06-27T19:18:00Z
status: implemented_pending_visual_acceptance
---

# M001-S03-T04 -- Summary

**Was:** Sheet-UI zum Anlegen/Bearbeiten eigener Eintraege (einmalig + woechentlich),
Plus-Button oben rechts, Untis-Refresh-Button, Klick-zum-Bearbeiten, eigene Farbe pro
Block, Ort, dezenter Ganztag-Modus.

## Neue Dateien

- `lib/event-colors.ts` -- kuratierte 8er-OKLCH-Palette + `evVar()` (setzt `--ev`).
- `components/time-wheel.tsx` -- Uhrzeit als Stunde/Minute-Stepper (5-min-Raster),
  Klick/Scroll, Ziffer gleitet beim Wechsel (Wheel-Gefuehl).
- `components/event-sheet.tsx` -- rechtes Slide-in-Sheet (framer-motion): Segmented
  "Einmalig | Woechentlich", Name, Datum/Wochentag, Von-Bis (Time-Wheel), Farb-Palette
  (Spring-Select + Ring + Haken), Ort (MapPin), Notiz (nur einmalig), dezenter
  Ganztag-Schalter; POST/PATCH/DELETE gegen /api/events bzw. /api/routines.

## Geaenderte Dateien

- `app/globals.css` -- `.ev-tint` (Farbrand + Fuellung via `--ev`, dunkel kraeftiger).
- `app/page.tsx` -- Plus + Refresh-Button (Trenner) oben rechts; Sheet-State +
  reloadKey-Refetch; Klick auf eigene Bloecke (Woche + Heute) oeffnet Sheet vorbelegt;
  `blockLook()` rendert `ev.color` statt harter SRC-Quellenfarbe (Fallback bleibt);
  Ganztags-Eintraege als Balken (Wochenkopf unter Datum / oben in Tages-Agenda) statt
  Zeitblock; Ort als Unterinfo in der Heute-Agenda.

## Verifikation

`npx tsc --noEmit` -> 0 Fehler. `npm run build` -> gruen. Runtime-Smoke gegen
localhost:3000: Homepage 200; POST manual (Farbe+Ort) -> erscheint in /api/calendar mit
durchgereichter Farbe; POST routine (woechentlich), POST all-day, PATCH, DELETE -> alle
200, Smoke-Daten aufgeraeumt. OFFEN: visuelle Abnahme durch User (Pixel/Feel) auf
localhost:3000.

## Naechster Schritt

Visuelle Abnahme; dann T05 (Deploy Vercel, Account Thimorrow). Hinweis 71007-Warnung
(Next-Plugin) auf event-sheet onClose/onSaved ist nicht fatal (alles im Client-Graph).
