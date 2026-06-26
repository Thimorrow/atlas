---
milestone: M001
slice: S02
task: T03
project: Atlas
completed: 2026-06-26T17:40:00Z
status: done
---

# M001-S02-T03 -- Summary

**Was gemacht:** Freie-Luecken-Berechnung.
- `lib/calendar-freeslots.ts`: `freeSlotsForDay(events, date, opt)` (pure) bildet
  Busy-Intervalle aus school_blocks (status != cancelled), manuellen Events und festen
  Routinen (offenes Ende -> busy bis dayEnd), clippt auf [dayStart, dayEnd], merged
  Ueberlappungen und liefert die Luecken >= minMinutes als `FreeSlot`
  {date,startTime,endTime,minutes}. Defaults 06:00 / 22:00 / 15 min. `attachFreeSlots`
  haengt FreeSlots an einen ExpandedRange (kein zusaetzlicher DB-Hit).
- `app/api/calendar/route.ts`: liefert `freeSlots` pro Tag; Optionen via
  `?dayStart=&dayEnd=&min=` ueberschreibbar (mit Validierung).

**Verifikation (bestanden, live mit echten Untis-Daten):**
- `npm run build` gruen.
- Fr 2026-06-26: belegt 07:50-15:15 -> FreeSlots 06:00-07:50 (110m), 09:20-09:40 (20m),
  11:10-11:30 (20m), 13:00-13:45 (45m), 15:15-22:00 (405m). Plausibel; 15-min-Schwelle
  greift.
- Entfall-Beweis: 2026-06-30 fallen 2 CH-Stunden 11:30-13:00 aus -> die freie Luecke
  11:10-22:00 deckt sie ab (cancelled = frei).

**Notizen:**
- Defaults (Fenster/Min-Slot) ohne explizite User-Entscheidung gesetzt, aber als
  Query-Parameter + Options-Objekt jederzeit aenderbar.
