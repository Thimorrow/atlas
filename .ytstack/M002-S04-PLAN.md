---
milestone: M002
slice: S04
project: Atlas
created: 2026-06-30
status: planned
---

# M002-S04 -- Kalender-Integration (Todos subtil im Kalender)

**Ziel:** Aufgaben erscheinen im Kalender (M001) -- aber **subtil**, nie als
vollwertiger Termin-Block. User-Vorgabe woertlich: "Es muss subtil reinkommen,
nicht als KOMPLETT eigener Eintrag ... echt subtil."

**Design (locked):**
- Heute-Agenda (`mode === "today"`): Aufgaben mit `scheduledTime` weben sich an
  ihrer Uhrzeit als schlanke, randlose Checkbox-Zeile in die Agenda (leichter als
  Termin-Karten, inline abhakbar). Aufgaben ohne Zeit + Ueberfaelliges -> eine
  ruhige "Auch heute"-Zeile darunter (kleine abhakbare Chips).
- Wochen-Raster: unter der Tageszahl eine winzige Reihe Punkte (offene Aufgaben
  des Tags, farbcodiert, gedeckelt + "+N"). Nur konkret terminierte Aufgaben
  (Faelligkeitstag oder wiederkehrendes Vorkommen) -- KEINE datumslosen.
- Daten: neuer `GET /api/todos/range?start=&end=` (Todos/Completions einmal laden,
  pro Tag konkrete Instanzen bauen). Heute-Agenda nutzt weiter `/api/todos/today`.

## Tasks

- [ ] T01 -- Range-Endpoint + Einweb in Heute-Agenda und Wochen-Raster (subtil, inline-Toggle)
- [ ] T02 -- Auto-Planer: Atlas schlaegt Uhrzeiten vor (offene, un-terminierte Aufgaben in
  freie Kalender-Luecken, ganze Woche), User bestaetigt -> erst dann wird `scheduled_time` gesetzt

## Exit criteria

1. Heute-Agenda zeigt terminierte Aufgaben als schlanke Zeile am richtigen Slot, abhakbar.
2. Wochen-Raster zeigt pro Tag dezente Punkte fuer offene, konkret terminierte Aufgaben.
3. Datumslose ("irgendwann") Aufgaben tauchen NICHT im Wochen-Raster auf.
4. Kein Termin wird visuell verdraengt; Aufgaben bleiben sekundaer/leiser.
