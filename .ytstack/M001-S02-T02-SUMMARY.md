---
milestone: M001
slice: S02
task: T02
project: Atlas
completed: 2026-06-26T17:33:00Z
status: done
---

# M001-S02-T02 -- Summary

**Was gemacht:** Wochen-/Tages-Expansion der Kalenderdaten.
- `lib/calendar-expand.ts`: `expandRange(start,end)` laedt school_blocks + manual_events
  (date BETWEEN) + alle routines und baut pro Tag konkrete `CalendarEvent`-Instanzen
  (source school|routine|manual), nach startTime sortiert. fixed-Routinen werden ueber
  `weekday === Wochentag(Tag)` platziert (0=Mo, UTC-Parsing der date-only-Strings).
  flexible_goal-Routinen liegen separat als `flexibleGoals[]` (done:0, kein Tracking in
  S02). Zeiten auf HH:MM normalisiert. Wrapper: `expandWeek` (Mo..So-ISO-Woche),
  `expandDay` (ein Tag).
- `app/api/calendar/route.ts`: GET `?date=&view=week|day` (Defaults: heute / week),
  400 bei kaputtem date/view.

**Verifikation (bestanden, live):**
- `npm run build` gruen, Route `/api/calendar` registriert.
- WEEK 2026-06-26 -> 7 Tage Mo 2026-06-22 .. So 2026-06-28; echte Untis-Stunden je
  Schultag; manuelles Event "Zahnarzt" 11:00 am Mi korrekt einsortiert; Wochenende leer;
  `flexibleGoals: Joggen 0/3`.
- DAY 2026-06-23 (Di) -> genau 1 Tag, enthaelt Untis-Stunden + Klavier-Routine 17:00-18:00.
- Testdaten danach geloescht (DB leer).

**Notizen:**
- `done:0` ist bewusst -- Completion-Tracking fuer flexible Ziele kommt mit Modul 2.
- Range-basierter Kern deckt Wochen- UND Tagesansicht ab (User: "iso woche aber auch
  tagesansicht").
