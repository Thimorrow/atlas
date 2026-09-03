---
milestone: M003
slice: null
task: null
project: Atlas
closed: 2026-09-02T16:55:00Z
verification: passed
source: nachtraeglich-aus-dem-code-rekonstruiert
---

# M003 -- Summary

M003 lief ohne Slices und ohne Task-Plaene durch, in einem Zug vom
2026-09-01T21:28 bis 2026-09-02T16:03. Diese Summary ist **nachtraeglich aus
Code und Git-History rekonstruiert**, nicht waehrend der Arbeit mitgeschrieben.
Der Hook-Stub davor war leer.

Erster Commit: `2eda1ce` -- "M003 Schul-Module: Aufgaben und Faecher".
Letzter Commit: `e91c49a`. Dazwischen **51 Commits**.

## Outcome

Geplant waren zwei Module (Aufgaben, Faecher). Geliefert wurden fuenf plus eine
native App:

1. **Aufgaben** (`/aufgaben`) -- Hausaufgaben, Arbeiten, Referate nach
   Faelligkeit; Anlegen direkt aus der Schulstunde heraus; subtile Aufgaben-Spur
   im Stundenplan, die keinen Stundenblock verschiebt.
2. **Faecher** (`/faecher`, `/faecher/[id]`) -- Stammdaten, Markdown-Notizen,
   Datei-Anhaenge, Aufgaben des Fachs.
3. **Noten** -- Tabelle `grades`, Gewichtung muendlich/schriftlich je Fach
   (`oral_weight`), Schnitt je Fach. Migration `0008_glad_gravity.sql`.
4. **Microsoft / OneNote** -- OAuth-Anbindung, Sections abrufen, Notizen
   verknuepfen. Tabelle `microsoft_accounts`, Migration
   `0006_special_squadron_supreme.sql`.
5. **Faecher-Abgleich mit Untis** -- Faecher werden aus dem Stundenplan
   abgeleitet statt von Hand gepflegt; Lehrer mit Nachname und Anrede statt
   Untis-Kuerzel; Handeingaben sind gegen den Abgleich geschuetzt.
   Migrationen `0009`, `0010`.
6. **Native Android-App** (`android/`) -- Kotlin + Compose, 46 Dateien, sechs
   Bildschirme, Offline-Stundenplan, eigener Markdown-Renderer,
   Barrierefreiheits-Durchgang, 11 eigene Testdateien. Dazu ein WebView-Wrapper
   (`android/wrap`) und fuenf Endpunkte, die eine native App braucht.

Betrieb dazu: Passwort-Gate vor der oeffentlich erreichbaren Bereitstellung,
selbst angewendete Migrationen, Blob-Store fuer Dateien, Live-Deploy auf Vercel.

## Deviations from plan

- **Scope-Ausweitung ohne Nachplanung.** Noten, OneNote und die gesamte
  Android-App standen in keiner SPEC. Sie sind gebaut und gruen, waren aber nie
  als Milestone beschlossen.
- **Keine Slices, keine Task-Plaene, keine mitlaufende Summary.** Der
  ytstack-Prozess wurde fuer M003 faktisch nicht benutzt.
- **STATE.md wurde nicht mitgefuehrt** und behauptete danach einen Stand von
  51 Commits zuvor.

## Verification

Am 2026-09-02 selbst ausgefuehrt:

- `npx tsc --noEmit` -- "No errors found".
- `npm run build` -- durch, 29 Routen gelistet.
- `npm test` -- 142 Tests gruen in 11 Dateien, 2 Integrationsdateien
  uebersprungen (ohne `DATABASE_URL`).
- Live: `/` -> 307 auf `/login?weiter=%2F`, `/login` -> 200.
- Live: `GET /api/subjects/<id>/files` -> `{"enabled":true,"files":[]}`.
- Vercel: letzter Production-Deploy `atlas-r15tuac2f`, Status Ready.

## Follow-ups

- Naechstes Modul waehlen. Noten sind bereits erledigt; offen waeren
  Pruefungen/Termine, Fehlzeiten, Lernkarten.
- Android-Tests laufen nicht im Web-Testlauf mit. Ein gemeinsamer Befehl fehlt.
- README kennt nur Aufgaben und Faecher, nicht Noten, OneNote und die
  Android-App.
- Prozess: bei M004 wieder mit `plan-milestone` und `slice-milestone` arbeiten,
  sonst wiederholt sich die Buchfuehrungsluecke.
