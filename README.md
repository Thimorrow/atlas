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

`BLOB_READ_WRITE_TOKEN` ist lokal optional und auf Vercel gesetzt. Fehlt es
lokal, zeigt der Dateibereich einen ruhigen Hinweis und der Rest der App
funktioniert unverändert weiter. Live ist der Blob-Store aktiv
(`enabled: true`).

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
| `npm run e2e` | Abnahmetests im echten Browser (startet den Server auf Port 3100 selbst) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run docs:zahlen` | Zahlenblock in README, STATE.md und API.md aus dem Code neu schreiben |
| `npm run docs:check` | pruefen, ob diese Zahlen noch stimmen (laufen auch im Test mit) |
| `npm run db:generate` | Migration aus dem Schema erzeugen |
| `npm run db:push` | Schema direkt auf die Datenbank anwenden |
| `npm run db:seed` | Beispiel-Stundenplan anlegen (`:clear` entfernt ihn wieder) |
| `npm run db:export` | Sicherung holen (`--db` direkt über die lokale Datenbank) |
| `npm run db:restore <datei> --ja` | Sicherung zurückspielen (löscht vorher alles) |
| `npm run db:studio` | Drizzle Studio |

## Aufbau

```
app/
  page.tsx              Plan (Woche und Fokus, der Fokus zeigt heute solange
                        heute noch Unterricht laeuft oder ansteht, sonst morgen)
  aufgaben/page.tsx     Aufgaben mit Tabs Offen und Pruefungen
  stunde/page.tsx       Stunden-Cockpit (live/pause/vor/nach/frei, Faellig-jetzt,
                        Notiz, Meldung, Dateien, Kontext)
  faecher/page.tsx      Fächer-Übersicht (mit Notenschnitt und Zuletzt
                        eingetragen)
  faecher/[id]/page.tsx Fachdetail (Stammdaten, Notizen, Dateien, Aufgaben, Noten)
  lernen/page.tsx       Lernbereich-Dashboard (Karteikarten, Themen, Plaene)
  lernen/[subjectId]/   Fach im Lernbereich (page, session, themen/[topicId],
                        tutor, plan/[assignmentId] mit neu)
  lernen/vokabeln/      Vokabeln (Latein und Englisch, Import per Foto)
  hefte/page.tsx        Hefte (handschriftliche Notizbuecher je Fach)
  bot/page.tsx          Bot-Chat (mit Verlauf unter bot/verlauf und Detail)
  namensschild/page.tsx Namensschild
  settings/page.tsx     Einstellungen, Untis-Sync, Theme, OneNote
  login/page.tsx        Passwort-Anmeldung (siehe Status)
  api/                   Route fuer Route in .ytstack/API.md (Zahlen unten)
components/             UI-Bausteine, alle im selben Stil
lib/
  db/schema.ts          Drizzle-Schema
  gate.ts               Passwort-Gate (mit proxy.ts, HMAC-Cookie)
  calendar-expand.ts    Untis-Stunden zu Tages-Instanzen expandieren
  assignments-view.ts   Gruppierung und Sortierung der Aufgaben (rein, getestet)
  morgen-view.ts        Fokus-Zieltag und Aufgaben bis zum Zieltag (rein, getestet)
  jetzt-stunde.ts       Logik des Stunden-Cockpits (rein, getestet)
  lernen.ts             Leitner-Boxen 0..5 fuer Karteikarten (rein, getestet)
  lernplan.ts           Einheiten und Verteilung des Lernplans (rein, getestet)
  study-store.ts        Lernbereich-Store (Drizzle)
  lernplan-store.ts     Lernplan-Store (Drizzle)
  tutor/                KI-Tutor (Session, Tools, Prompt)
  bot/                  Bot-Modell, Verlauf, Stunden-Kontext
  subject-colors.ts     Fachfarben-Palette und Vorbelegung
  markdown.ts           Markdown für Notizen, escape-first
  microsoft.ts          Entra-ID-Anmeldung (PKCE) und OneNote über Graph
  untis/                WebUntis-Client, Adapter, Sync-Policy
  zeit.ts               Europe/Berlin heute/jetzt auf dem Server
drizzle/                Migrationen (Bereich siehe Kennzahlen unten)
.ytstack/               Projektzustand, Entscheidungen, Specs
```

### Kennzahlen

<!-- zahlen:start -->
_Erzeugt von `scripts/doku-zahlen.mjs`; `npm test` wird rot, wenn diese Zahlen nicht mehr zum Code passen._

| Kennzahl | Wert |
| --- | --- |
| API-Routen (`app/api/**/route.ts`) | 71 |
| Seiten (`app/**/page.tsx`) | 21 |
| Migrationen (`drizzle/*.sql`) | 24 (`0000` bis `0023`) |
| Tabellen (`pgTable` in `lib/db/schema.ts`) | 23 |
| Testdateien (`*.test.ts`) | 89 |
<!-- zahlen:ende -->

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

## Die Mac-App (Electron)

Unter `desktop/` liegt Atlas als eigene macOS-App. Sie öffnet dieselbe
Online-Version wie die Android-App und benötigt Internet. Stundenplan und
Daten bleiben auf dem bestehenden Server; ein lokaler Next.js-Server ist
nicht nötig. Die Anmeldung bleibt im eigenen App-Profil gespeichert.
Externe Links und die Microsoft-Anmeldung öffnen sich im Standardbrowser.

```bash
npm ci --prefix desktop
npm run desktop:dev
npm run desktop:build
```

Der Build ist für Apple Silicon (M1/M2/M3/M4 usw.). Unter `dist/mac/` liegen
eine ZIP und `mac-arm64/Atlas.app`. Die ZIP entpacken und Atlas in den
Programme-Ordner ziehen. Für Intel-Macs:
`cd desktop && npx electron-builder --mac --x64 --publish never`.

Der lokale Build ist ad hoc signiert, nicht mit einem Apple-Developer-Zertifikat
signiert oder notarisiert. Für die Verteilung an andere Macs sollte das ergänzt werden.
Es werden nur die Desktop-Dateien verpackt, keine `.env`-Dateien,
Datenbankzugänge oder Serverpakete. Die Electron-Version steht separat in
`desktop/package.json` und sollte regelmäßig aktualisiert werden.

**Offline:** Ohne Netz zeigt Atlas nicht mehr nur eine Fehlerseite, sondern den
letzten Stand, den der Server ausgeliefert hat — Stunden mit Raum und Zeit,
offene Aufgaben, überfällig zuerst. Die App merkt sich dafür genau die Antwort,
die sie beim Benutzen ohnehin lädt (`GET /api/home`); es wird nichts zusätzlich
abgefragt. Der Stand wird immer mit Datum und Uhrzeit angezeigt („Letzter Stand:
21.09.2026, 08:12"), damit veraltete Daten nie wie aktuelle aussehen. Beim
Schließen des Fensters und beim nächsten Start bleibt er erhalten.

Die Datei dafür liegt im Benutzerordner der App
(`~/Library/Application Support/Atlas/atlas-offline.json`) und enthält denselben
Ausschnitt wie die Offline-Seite: die zuletzt geladenen Stunden und offenen
Aufgaben. Wer die App weitergegeben hat, kann sie dort löschen.

Erneut verbinden geht über den Knopf auf der Offline-Seite oder `⌘R`.
`⌘Q` beendet die App, das Schließen des Fensters lässt sie wie üblich auf
macOS im Dock weiterlaufen.

## Sicherung

Neon sichert die Datenbank selbst, aber diese Sicherung liegt bei Neon und lässt
sich nur dort zurückspielen. Deshalb gibt es einen Dump, den du selbst in der
Hand hast:

```bash
npm run db:export              # holt den Dump von der laufenden Instanz
npm run db:export -- --db      # lokal direkt aus der Datenbank
npm run db:restore backups/atlas-dump-2026-09-21.json --ja
```

Der Dump landet in `backups/` (steht in `.gitignore`, weil darin alle Notizen,
Noten, Heftseiten und Bot-Verläufe stehen) und enthält jede Tabelle mit allen
Spalten. Welche Tabellen das sind, liest das Skript aus `information_schema`,
nicht aus einer Liste im Code: eine neue Migration ist automatisch mit dabei.
Einzeln angeben muss man nur die Ziel-Datei.

Zwei Eigenschaften sind Absicht. Erstens wird zuerst geprüft und erst danach
gelöscht — ein unbrauchbarer Dump darf die Datenbank nicht leer zurücklassen,
deshalb verweigert das Zurückspielen ohne `--ja` schon vorher die Arbeit und
nennt Ziel und Umfang. Zweitens kommt die Einfüge-Reihenfolge aus den
Fremdschlüsseln (`pg_constraint`), nicht aus einer geratenen Liste; bei einem
Modellierungsfehler mit echtem Zyklus bricht es mit allen beteiligten Tabellen
ab, statt einen halben Datenbestand zu hinterlassen.

Der Weg über die Instanz ist der einzige, der gegen den echten Atlas
funktioniert: die Datenbank-Zugangsdaten liegen auf Vercel als „sensitiv" und
sind von außen nicht lesbar. `npm run db:export` meldet sich deshalb mit
`ATLAS_PASSWORD` an und holt `GET /api/admin/export`, das hinter derselben
Passwortsperre liegt wie der Rest.

## Abnahmetests (`e2e/`)

`npm run e2e` fährt Atlas in einem echten Chromium. Die Tests unter `e2e/`
brauchen **keine** vorbereiteten Daten: sie fangen die Serverantworten selbst ab
(`page.route`) und arbeiten mit festgelegten Fixtures. Damit fassen sie nichts
von deinen echten Heften, Vokabeln oder Noten an, und derselbe Lauf funktioniert
gegen Production wie gegen den lokalen Server.

Was geprüft wird, sind die Zusagen, die vorher nur per Auge abgehakt wurden:
dass ein Strich nach dem Nachladen noch genau so aussieht (Stift, Marker, Linie,
Rechteck, Rückgängig/Wiederholen), dass die nächste Vokabelkarte schon steht,
während die vorige Antwort noch unterwegs ist, dass ein späterer Fehler nur
die betroffene Karte trifft, und dass das Passwort-Gate Seiten auf `/login`
umleitet, APIs aber mit 401 antwortet.

Bewusst **keine** Screenshot-Vergleiche: die Oberfläche ist eine Zeichenfläche
auf Canvas mit Animationen, ein Pixelvergleich würde bei jedem Schriftart-
Unterschied rot, ohne einen Fehler zu zeigen. Stattdessen prüfen die Tests das
Gemeinte und legen im Fehlerfall Bild und Spur als Artefakt ab.

Der Lauf startet seinen eigenen Entwicklungsserver auf Port 3100, damit er
weder einen laufenden `npm run dev` auf 3000 stört noch dessen Zustand erbt.
`ATLAS_PASSWORD` wird aus `.env.local` geladen; ohne Passwort ist das Gate
absichtlich offen und die beiden Gate-Tests überspringen sich selbst.

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

Live auf Vercel (https://atlas-ten-orpin.vercel.app) hinter einem
Passwort-Gate: `proxy.ts` plus `lib/gate.ts` pruefen ein HMAC-signiertes
Cookie (`ATLAS_PASSWORD`, `ATLAS_SESSION_SECRET`). Ohne das Cookie antworten
Seiten mit einer Weiterleitung auf `/login`, API-Routen mit 401. Lokal ohne
`ATLAS_PASSWORD` bleibt die App offen. Die App wendet ihre Migrationen selbst
an (`POST /api/admin/migrate`). `BLOB_READ_WRITE_TOKEN` ist auf Vercel gesetzt,
der Dateibereich ist live aktiv (`enabled: true`). Der aktuelle Stand und die
offenen Punkte stehen in `.ytstack/STATE.md`.
