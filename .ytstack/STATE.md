---
project: Atlas
slug: Atlas
last_updated: 2026-09-04T12:10:00Z
current_milestone: M003
active_slice: null
active_task: null
---

# State

**Status:** M003 ist abgeschlossen und ueber seinen urspruenglichen Zuschnitt
hinausgewachsen. Atlas ist heute kein reiner Stundenplan mehr, sondern eine
Web-App mit fuenf Modulen plus eine eigenstaendige native Android-App.

Stand belegt am 2026-09-02 durch einen Durchgang durch den echten Code, nicht
durch Fortschreibung dieser Datei. Zwischen dem vorigen Stand (2026-09-01) und
heute liegen **51 Commits**, die hier vorher nicht abgebildet waren.

## Nachtrag 2026-09-04 (PR #8, Branch feature/lernbereich-und-cockpit)

Fuenf Module in der Navigation: `/` Stundenplan, `/stunde` Cockpit,
`/aufgaben`, `/faecher`, `/lernen`.

- *Stunden-Cockpit* `/stunde` (`components/stunden-cockpit.tsx`,
  `app/api/stunde/route.ts`, Logik `lib/jetzt-stunde.ts`): traegt immer
  (Modi live/pause/vor/nach/frei), Tagesleiste zum Wechseln der Stunde,
  Faellig-jetzt abhaken, Hausaufgabe mit Faelligkeit bis zur naechsten
  Stunde (`findNextLessonDate`), Notiz, Meldung, Dateien, Kontext (letzte
  Stundennotiz, naechste Pruefung). Der fruehere Vollbildmodus im Fokus
  (`components/jetzt-stunde.tsx`) ist geloescht, der Fokus verlinkt.
- *Lernbereich* `/lernen`, `/lernen/[subjectId]`, `.../session`
  (`components/lernen-*.tsx`): Karteikarten mit Leitner-Boxen 0..5
  (`lib/lernen.ts`, rein, getestet), Store `lib/study-store.ts`, Generator
  `lib/lernen-generieren.ts` (Bot-Modell, Quellen Notizen/Dateien/Lehrplan),
  Routen `app/api/lernen/*`. Tabellen `study_cards`, `study_reviews`,
  Enum `study_card_source`, Migration `0016_lernkarten`.
- *Dateien*: Mehrfach-Upload mit Queue (Parallelitaet 3), Limits zentral in
  `lib/file-limits.ts`.
- *Zeit*: `lib/zeit.ts` (Europe/Berlin) fuer heute/jetzt auf dem Server;
  vorher UTC-abhaengig. Tests laufen in UTC, Tokyo und lokal gruen.
- *Bot*: kennt Uhrzeit und Jetzt-Zustand (`lib/stunde-kontext.ts`), alle
  fuenf Module, Werkzeuge jetzt_lesen/lernstand_lesen/lernkarten_erzeugen/
  lernkarte_anlegen, Tool-Replay der letzten drei Fragen (`lib/bot/history.ts`).
- Offen: Notensystem 0 bis 15 statt 1 bis 6 (Sek I), Entscheidung des Nutzers.
- Android: die native Arbeit (Bot, Fokus, Notizen, Dateien, Noten) ist als
  Commit e130b96 gesichert, kompiliert, Tests gruen.

Verifikation lokal: tsc fehlerfrei, 424 Tests gruen (24 skipped ohne
DATABASE_URL), `next build` 0 Errors. Live-Pruefung des Preview-Deploys siehe
PR #8.

## Was tatsaechlich steht

**Datenbank** (Neon, Drizzle, 11 Migrationen, alle angewendet): sieben Tabellen
`school_blocks`, `subjects`, `subject_notes`, `assignments`, `subject_files`,
`grades`, `microsoft_accounts`; vier Enums `school_block_status`,
`teacher_title`, `assignment_type`, `grade_kind`.

**Web-App** (Next.js 16, App Router): 3 Module in der Navigation (`/`,
`/aufgaben`, `/faecher`) plus Fachdetail (`/faecher/[id]`), `/settings` und
`/login`.

- *Plan* -- Untis-Spiegel mit Woche und Fokus. Der Fokus zeigt heute, solange
  heute noch Unterricht laeuft oder ansteht, sonst morgen bzw. den naechsten
  Schultag (`lib/morgen-view.ts`, `components/morgen-panel.tsx`). Aufgaben nur
  als subtile Spur im Raster.
- *Aufgaben* -- Tabs Offen (Hausaufgaben mit Quick-Add) und Pruefungen
  (naechste gross, Rest nach Woche, Vergangene aufklappbar;
  `components/pruefungen-view.tsx`). Die eigenen Routen `/pruefungen`,
  `/morgen` und `/noten` sind ersatzlos gestrichen (2026-09-03,
  Konsolidierung auf 3 Module).
- *Faecher* -- Stammdaten, Markdown-Notizen, Dateien, Aufgaben des Fachs,
  dazu der Notenschnitt (gesamt, pro Fach, zuletzt eingetragen).
- *Noten* -- `grades`-Tabelle, Gewichtung muendlich/schriftlich
  (`oral_weight` je Fach), Schnitt je Fach; `lib/grades.ts`,
  `components/subject-grades.tsx`, Routen `/api/grades`, `/api/grades/[id]`,
  `/api/subjects/[id]/grades`.
- *Microsoft / OneNote* -- OAuth-Anbindung, Sections abrufen, Notizen
  verknuepfen; `lib/microsoft.ts`, fuenf Routen unter `/api/microsoft` und
  `/api/notes/[id]/onenote`.

**Android-App** (`android/`, Kotlin + Compose, 46 Kotlin-Dateien, 11 eigene
Testdateien): eigenstaendige native App mit Anmelde-, Stundenplan-, Aufgaben-,
Faecher-, Fachdetail- und Einstellungs-Bildschirm, dazu Bloecke fuer neue
Aufgabe und neue Note, eigener Markdown-Renderer, Offline-Stundenplan,
Barrierefreiheits-Durchgang. Daneben ein schlanker WebView-Wrapper
(`android/wrap`). Die App spricht die fuenf dafuer gebauten Endpunkte
(`/api/home`, `/api/session`, `/api/colors` und die Modul-Routen).

**Faecher-Abgleich:** Faecher werden aus dem Stundenplan abgeleitet statt von
Hand gepflegt (`/api/subjects/candidates`, `/api/subjects/reconcile`,
`/api/subjects/setup`). Lehrer erscheinen mit Nachname und Anrede statt mit dem
Untis-Kuerzel (`lib/teacher.ts`, Enum `teacher_title`). Handeingaben sind gegen
den Abgleich geschuetzt; `untis_teacher` / `untis_room` merken sich, was Untis
zuletzt lieferte.

**Betrieb:** Live auf https://atlas-ten-orpin.vercel.app, Projekt
`zapkothimofej-2616s-projects/atlas`, GitHub `Thimorrow/atlas`. Passwort-Gate
ueber `proxy.ts` + `lib/gate.ts` (HMAC-signiertes Cookie). Die App wendet ihre
Migrationen selbst an (`/api/admin/migrate`).

## Verifikation (2026-09-02, selbst ausgefuehrt)

- `npx tsc --noEmit` -- fehlerfrei.
- `npm run build` -- durch, alle 29 Routen gelistet.
- `npm test` -- 142 Tests gruen in 11 Dateien; die beiden Neon-Integrationsdateien
  werden ohne `DATABASE_URL` sauber uebersprungen (siehe unten).
- Live-Gate -- `/` antwortet 307 auf `/login?weiter=%2F`, `/login` 200.
- Letzter Production-Deploy `atlas-r15tuac2f` Status Ready.
- Dateibereich live geprueft: `GET /api/subjects/<id>/files` liefert
  `{"enabled":true,...}` -- der Blob-Store ist aktiv.

## Env

Bei Vercel gesetzt fuer Production und Preview: `DATABASE_URL`, `WEBUNTIS_*`,
`ATLAS_PASSWORD`, `ATLAS_SESSION_SECRET` und **`BLOB_READ_WRITE_TOKEN`**
(seit 2026-09-01 gesetzt, live wirksam). Der frueher hier notierte
"Hinweis-Zustand" des Dateibereichs ist damit erledigt.

## Open decisions

- ~~Fehlermeldungen im UI~~: entschieden, schlanke Eigenloesung `components/toast.tsx`.
- ~~Markdown-Bibliothek~~: entschieden, `marked` mit escape-first in `lib/markdown.ts`.
- ~~Vercel-Deploy~~: erledigt, laeuft in Production.
- ~~`BLOB_READ_WRITE_TOKEN`~~: erledigt, live `enabled: true`.
- **Erledigt (2026-09-03):** Konsolidierung auf 3 Module statt neuem Modul.
  `/pruefungen` ist ein Tab auf `/aufgaben`, `/noten` steckt in `/faecher`,
  `/morgen` ist der Fokus-Modus von `/`. Keine Redirects, ersatzlos gestrichen.

## Lehre aus diesem Durchgang

Diese Datei hing 51 Commits hinterher und hat eine Session in die Irre gefuehrt
(sie behauptete "drei Module, 65 Tests" bei tatsaechlich fuenf Modulen, einer
Android-App und 142 Tests). Beim naechsten groesseren Block: STATE.md
mitschreiben, nicht nachtraeglich rekonstruieren.

## Historie

M001 (Stundenplan) fertig. M002 (To-Dos) gebaut und in der Scope-Reduktion vom
2026-09-01 wieder entfernt -- der Code liegt in der History bei `b34dab2`.
M003 (Schul-Module) fertig, siehe `M003-null-null-SUMMARY.md`.
