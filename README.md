# Atlas

Ein Schulplaner für genau einen Schüler. Atlas spiegelt den Stundenplan aus
WebUntis und legt zwei Module darüber: **Aufgaben** (Hausaufgaben,
Klassenarbeiten, Referate, nach Fälligkeit sortiert) und **Fächer**
(Stammdaten, Notizen, Dateien, die Aufgaben des Fachs).

Der Stundenplan bleibt dabei bewusst ein Untis-Spiegel. Aufgaben erscheinen
darin nur als subtile Spur, kleine Punkte unter der Tageszahl und eine schlanke
Zeile "Fällig heute", die keinen einzigen Stundenblock verschiebt.

## Stack

- **Next.js 16** (App Router, Turbopack) mit React 19
- **Neon Postgres** über **Drizzle ORM**
- **Tailwind CSS v4**, Framer Motion, Radix Primitives, Geist
- **WebUntis** als reine Importquelle
- **Vercel Blob** für Datei-Anhänge (optional)
- **Vitest** für die Logik-Tests

## Einrichten

```bash
npm install
cp .env.example .env.local     # DATABASE_URL und WebUntis-Zugang eintragen
npm run db:push                # Schema auf die Datenbank bringen
npm run db:seed                # Testdaten, solange WebUntis abgeschaltet ist
npm run dev
```

`BLOB_READ_WRITE_TOKEN` ist optional. Fehlt es, zeigt der Dateibereich einen
ruhigen Hinweis und der Rest der App funktioniert unverändert weiter.

## Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktions-Build |
| `npm test` | Vitest einmal durchlaufen lassen |
| `npm run db:generate` | Migration aus dem Schema erzeugen |
| `npm run db:push` | Schema direkt auf die Datenbank anwenden |
| `npm run db:seed` | Beispiel-Stundenplan anlegen (`:clear` entfernt ihn wieder) |
| `npm run db:studio` | Drizzle Studio |

## Aufbau

```
app/
  page.tsx              Stundenplan (Woche und Tag)
  aufgaben/             Aufgaben-Modul
  faecher/              Fächer-Übersicht und Detailseite
  settings/             Einstellungen, Untis-Sync, Theme
  api/                  calendar, sync/untis, subjects, notes, assignments, files
components/             UI-Bausteine, alle im selben Stil
lib/
  db/schema.ts          Drizzle-Schema
  calendar-expand.ts    Untis-Stunden zu Tages-Instanzen expandieren
  assignments-view.ts   Gruppierung und Sortierung der Aufgaben (rein, getestet)
  subject-colors.ts     Fachfarben-Palette und Vorbelegung
  markdown.ts           Markdown für Notizen, escape-first
  untis/                WebUntis-Client, Adapter, Sync-Policy
drizzle/                Migrationen
.ytstack/               Projektzustand, Entscheidungen, Specs
```

## Die Android-App

Unter `android/` liegt eine native App in Kotlin mit Jetpack Compose. Sie
spricht dieselbe HTTP-API wie die Weboberflaeche, siehe `.ytstack/API.md`.

Bauen:

```
cd android
./gradlew assembleDebug
```

Die fertige Datei liegt danach unter
`android/app/build/outputs/apk/debug/app-debug.apk`.

Aufs Handy: die Datei uebertragen und antippen. Android fragt einmal, ob es
Apps aus dieser Quelle installieren darf. Das ist eine Debug-Signatur, bewusst:
sie liegt in `~/.android/debug.keystore` und bleibt stabil, spaetere Versionen
lassen sich also ueber die vorhandene App installieren. Ein eigener
Signaturschluessel waere nur ein zusaetzliches Stueck, das verloren gehen kann.

Voraussetzungen sind das Android SDK mit Plattform 36 und ein JDK 21. Der Pfad
zum JDK steht in `android/gradle.properties`, der zum SDK in
`android/local.properties`, die nicht eingecheckt ist.

## Datenmodell

`school_blocks` kommt aus Untis und wird per `(untis_lesson_id, date)`
idempotent geupsertet, ein erneuter Sync erzeugt also keine Duplikate.

`subjects` hält die Fächer. Ein abgewähltes Fach wird archiviert, nicht
gelöscht, sonst legt der nächste Sync es still wieder an. `subject_notes` und
`subject_files` hängen per Cascade daran. `assignments` verweist mit
`on delete set null` auf das Fach: ein gelöschtes Fach macht seine Aufgaben zu
"Allgemein", es löscht sie nicht mit.

## Entscheidungen, die im Code sichtbar sind

- **Ein `assignments`-Modell mit Typ** statt getrennter Tabellen für Hausaufgabe
  und Klassenarbeit. Beide teilen sich Fach, Titel, Datum, Notiz und
  Erledigt-Zustand vollständig; der Typ steuert nur Darstellung und Gewicht.
- **`completedAt` statt Completion-Log.** Ohne Wiederholungen ist eine Aufgabe
  genau einmal erledigt.
- **Datum immer lokal als `YYYY-MM-DD`.** Kein `toISOString`, sonst gilt eine
  Aufgabe am Abend fälschlich als überfällig.
- **Markdown escape-first.** Die Quelle wird escaped, bevor `marked` sie parst.
  HTML im Notiz-Body erscheint als sichtbarer Text und wird nie ausgeführt.
- **Nichts verschwindet von selbst.** Überfälliges bleibt stehen, bis es
  abgehakt oder gelöscht wird. Kein automatisches Verschieben.

## Status

Single-User, kein Auth, kein Deploy. Der aktuelle Stand und die offenen Punkte
stehen in `.ytstack/STATE.md`.
