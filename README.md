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

## Microsoft 365 und OneNote

Atlas kann eine Fach-Notiz als neue Seite in dein OneNote schreiben. Dafür
brauchst du eine App-Registrierung in Azure. Das ist einmalig und kostet
nichts. Ohne die drei Variablen unten bleibt die Anbindung einfach aus, Atlas
zeigt dann nur einen Hinweis und funktioniert sonst unverändert.

### Einmalig im Azure-Portal

1. Geh auf [portal.azure.com](https://portal.azure.com) und melde dich mit
   deinem Schulkonto an. Such oben nach **Microsoft Entra ID** und öffne es.
2. Links im Menü auf **App-Registrierungen**, dann oben auf **Neue
   Registrierung**.
3. **Name:** `Atlas`. Bei **Unterstützte Kontotypen** wähl „Nur Konten in
   diesem Organisationsverzeichnis".
4. Bei **Umleitungs-URI** wähl als Plattform **Web** und trag genau das ein:
   `http://localhost:3000/api/microsoft/callback`.
   Läuft Atlas später unter einer echten Adresse, kommt dieselbe URI mit deiner
   Domain dazu (`https://…/api/microsoft/callback`). Die Adresse muss auf das
   Zeichen genau stimmen, sonst weist Microsoft die Anmeldung ab.
5. Auf **Registrieren** klicken. Du landest auf der Übersichtsseite der App.
6. Auf der Übersicht stehen zwei der drei Werte:
   - **Anwendungs-ID (Client)** → `MICROSOFT_CLIENT_ID`
   - **Verzeichnis-ID (Mandant)** → `MICROSOFT_TENANT_ID`
7. Links auf **Zertifikate & Geheimnisse**, Reiter **Geheime
   Clientschlüssel**, dann **Neuer geheimer Clientschlüssel**. Beschreibung
   `Atlas`, Gültigkeit nach Wunsch. Nach dem Anlegen kopierst du die Spalte
   **Wert** (nicht „Geheime Client-ID"). Dieser Wert ist **nur jetzt
   sichtbar** → `MICROSOFT_CLIENT_SECRET`.
8. Links auf **API-Berechtigungen**, dann **Berechtigung hinzufügen** →
   **Microsoft Graph** → **Delegierte Berechtigungen**. Häk diese vier an und
   klick **Berechtigungen hinzufügen**:
   - `offline_access` (ohne das ist die Verbindung nach einer Stunde tot)
   - `User.Read`
   - `Notes.Read`
   - `Notes.Create`

   Steht dort danach „Administratorzustimmung erforderlich: Ja", muss ein
   Administrator deiner Schule einmal auf **Administratorzustimmung für …
   erteilen** klicken. Bei den vier Rechten oben ist das normalerweise nicht
   nötig.

### In Atlas eintragen

```bash
MICROSOFT_CLIENT_ID="…"       # Anwendungs-ID (Client)
MICROSOFT_CLIENT_SECRET="…"   # Wert des geheimen Clientschlüssels
MICROSOFT_TENANT_ID="…"       # Verzeichnis-ID (Mandant)
```

Danach `npm run dev` neu starten, in Atlas auf **Einstellungen → OneNote**
gehen und auf **Mit Microsoft verbinden** klicken. Microsoft fragt einmal
nach deiner Zustimmung, danach bist du zurück in den Einstellungen.

### Benutzen

Auf einer Fach-Seite unter **OneNote** wählst du einmal den Abschnitt, in dem
die Notizen dieses Fachs landen sollen. Danach hat jede Notiz beim Öffnen den
Knopf **An OneNote senden**, der sie als neue Seite in diesem Abschnitt
anlegt. Es ist ein Einbahnweg: Atlas legt Seiten an und ändert nie eine
bestehende.

Die Zugriffstoken liegen mit AES-256-GCM verschlüsselt in der Datenbank. Den
Schlüssel dafür bildet `ATLAS_SESSION_SECRET`; wechselt der, meldest du dich
einmal neu bei Microsoft an.

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
  page.tsx              Plan (Woche und Fokus, der Fokus zeigt heute solange
                        heute noch Unterricht laeuft oder ansteht, sonst morgen)
  aufgaben/             Aufgaben mit Tabs Offen und Pruefungen
  faecher/              Fächer-Übersicht (mit Notenschnitt und Zuletzt
                        eingetragen) und Detailseite
  settings/             Einstellungen, Untis-Sync, Theme
  api/                  calendar, morgen, sync/untis, subjects, notes, assignments, files, grades, microsoft
components/             UI-Bausteine, alle im selben Stil
lib/
  db/schema.ts          Drizzle-Schema
  calendar-expand.ts    Untis-Stunden zu Tages-Instanzen expandieren
  assignments-view.ts   Gruppierung und Sortierung der Aufgaben (rein, getestet)
  morgen-view.ts        Fokus-Zieltag und Aufgaben bis zum Zieltag (rein, getestet)
  subject-colors.ts     Fachfarben-Palette und Vorbelegung
  markdown.ts           Markdown für Notizen, escape-first
  microsoft.ts          Entra-ID-Anmeldung (PKCE) und OneNote über Graph
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
