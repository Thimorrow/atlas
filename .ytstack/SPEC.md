---
kind: spec
project: Atlas
title: Schul-Module (Aufgaben + Fächer)
created: 2026-09-01
status: ready-for-implementation
branch: schule-scope
---

# SPEC: Aufgaben und Fächer

**Ziel in einem Satz:** Atlas bekommt neben dem Stundenplan zwei neue Module, "Aufgaben"
(Hausaufgaben, Klassenarbeiten und weitere schulische Aufgaben, nach Fälligkeit sortiert)
und "Fächer" (pro Fach Stammdaten, Notizen, die zugehörigen Aufgaben und später Dateien).

## Ausgangslage

Das Repo ist nach der Scope-Reduktion vom 2026-09-01 (Commits `0461c9b`, `f120a38`,
`36f031b`) ein reiner Stundenplan: eine Tabelle `school_blocks`, die Routen `/api/calendar`
und `/api/sync/untis`, die Seiten `/` und `/settings`, ein Sidebar-Eintrag. Das frühere
To-Do-Modul wurde bewusst entfernt.

**Wiederverwendbar aus der Git-History (Commit `b34dab2`):** Das dort entfernte
`todos`-Modell, `lib/todo-store.ts` (CRUD-Muster gegen Drizzle), `lib/todos-view.ts`
(Sortier- und Gruppierhelfer), `components/todo-checkbox.tsx` und das optimistic-Toggle-
Muster aus `app/todos/page.tsx`. Diese Dateien sind als Vorlage zu lesen, nicht blind zu
kopieren: das neue Modell ist schulisch (Fach-Bezug, Typ) statt Habit-orientiert und
braucht **keine** RRULE-Wiederholung und kein Completion-Log pro Tag.

## Scope

1. Datenmodell und API für Fächer, Notizen und Aufgaben.
2. Fächer-Modul: Einmal-Auswahl beim ersten Öffnen, Übersicht, Detailseite mit Stammdaten,
   nächsten Stunden, Notizen und Aufgaben des Fachs.
3. Aufgaben-Modul: Liste über alle Fächer nach Fälligkeit, Überfällig-Block, Abhaken,
   Anlegen und Bearbeiten.
4. Anlegen einer Aufgabe direkt aus einer Schulstunde im Stundenplan heraus.
5. Subtile Darstellung fälliger Aufgaben im Stundenplan.
6. Datei-Anhänge pro Fach über Vercel Blob, als abgetrennter letzter Schritt.

## Nicht-Scope

- Keine Noten und keine Notenberechnung.
- Keine wiederkehrenden Aufgaben (kein RRULE, kein Habit-Streak).
- Keine Tags oder Volltextsuche über Notizen.
- Kein Auto-Planer, der Aufgaben in freie Lücken legt (war in `0461c9b` bewusst entfernt).
- Keine Benachrichtigungen, kein Teilen, keine Mehrbenutzer-Trennung (Single-User-App).
- Kein Vercel-Deploy im Rahmen dieser Spec; Verifikation läuft lokal gegen `next dev`.

## Datenmodell

Neu in `lib/db/schema.ts`, Migration über `npm run db:generate` und `npm run db:push`.

```
subjects
  id            uuid pk
  name          text notnull          -- Anzeigename, initial der Untis-subject-Wert
  untisSubject  text                  -- exakter Untis-Wert, null bei manuell angelegten
  teacher       text
  room          text
  color         text                  -- Token-Name aus der bestehenden Palette
  archivedAt    timestamptz           -- abgewähltes Fach, statt Löschen
  createdAt / updatedAt timestamptz notnull default now()
  UNIQUE (untis_subject) where not null
```

```
subject_notes
  id         uuid pk
  subjectId  uuid notnull -> subjects.id on delete cascade
  title      text notnull
  body       text notnull default ''   -- Markdown-Quelltext
  createdAt / updatedAt timestamptz notnull default now()
  INDEX (subject_id, updated_at desc)
```

```
assignment_type  pgEnum: 'homework' | 'exam' | 'test' | 'presentation' | 'other'

assignments
  id          uuid pk
  subjectId   uuid -> subjects.id on delete set null   -- nullable: "Allgemein"
  type        assignment_type notnull default 'homework'
  title       text notnull
  notes       text
  dueDate     date                                     -- nullable = "irgendwann"
  completedAt timestamptz                              -- null = offen
  createdAt / updatedAt timestamptz notnull default now()
  INDEX (due_date), INDEX (subject_id)
```

```
subject_files   -- erst in Schritt 6
  id         uuid pk
  subjectId  uuid notnull -> subjects.id on delete cascade
  name       text notnull
  url        text notnull      -- Vercel-Blob-URL
  pathname   text notnull      -- Blob-Pfad, für das Löschen
  size       integer notnull
  contentType text notnull
  createdAt  timestamptz notnull default now()
```

**Warum ein `assignments`-Modell mit Typ statt getrennter Tabellen:** Hausaufgabe und
Klassenarbeit teilen sich Fach, Titel, Datum, Notiz und Erledigt-Zustand vollständig. Die
Trennung würde nur doppelte API, doppelten Composer und doppelte Listenlogik erzeugen. Der
Typ steuert ausschließlich Darstellung und Gewicht. Sollten Prüfungen später eigene Felder
brauchen (Lernplan, Gewichtung), lässt sich der Typ jederzeit in eine eigene Tabelle
herauslösen.

**Warum `completedAt` statt eines Completion-Logs:** Ohne Wiederholungen ist eine Aufgabe
genau einmal erledigt. Das Log aus dem alten Modul war nur für Habits nötig.

## Verhalten

### Fächer: die einmalige Auswahl

Beim ersten Öffnen von `/faecher`, solange die Tabelle `subjects` leer ist, liest Atlas die
`subject`-Werte aus `school_blocks` (distinct, alphabetisch) und zeigt sie als Auswahlliste,
**alle vorausgewählt**. Der Nutzer nimmt Haken weg und bestätigt einmal. Danach erscheint
dieser Screen nie wieder.

Nach der Bestätigung gilt: Taucht bei einem späteren Untis-Sync ein `subject` auf, für das
weder ein aktives noch ein archiviertes Fach existiert, wird es **still angelegt**. Ein
abgewähltes Fach wird als `archivedAt` gesetzt gespeichert, nicht gelöscht, damit es nicht
beim nächsten Sync wieder auftaucht.

Fächer lassen sich zusätzlich manuell anlegen (`untisSubject = null`, z.B. eine AG), sowie
umbenennen, mit Farbe und Lehrer versehen und archivieren.

### Fächer-Übersicht und Detailseite

`/faecher` zeigt die aktiven Fächer als Raster von Karten: Name, Farbe, Lehrer, Anzahl
offener Aufgaben, Anzahl Notizen. Archivierte Fächer sind hinter einem Umschalter erreichbar.

`/faecher/[id]` zeigt:
- **Stammdaten:** Name, Lehrer, Raum, Farbe, bearbeitbar.
- **Nächste Stunden:** die kommenden Termine dieses Fachs aus `school_blocks`
  (`date >= heute`, aufsteigend, maximal 5), inklusive Status (Vertretung, Ausfall).
- **Aufgaben:** die Aufgaben mit diesem `subjectId`, offene zuerst, mit denselben
  Abhak-Zeilen wie im Aufgaben-Modul.
- **Notizen:** Liste der Notizen, neueste zuerst, Titel plus Vorschau. Klick öffnet die
  Notiz zum Lesen und Bearbeiten; der Body wird als Markdown gerendert (Überschriften,
  Listen, Fett, Kursiv, Code, Links). Anlegen, Bearbeiten, Löschen.
- **Dateien:** erst ab Schritt 6.

### Aufgaben-Modul

`/aufgaben` zeigt alle nicht erledigten Aufgaben, gruppiert und in dieser Reihenfolge:

1. **Überfällig** (`dueDate < heute`, offen): eigener Block ganz oben, in der Fehlerfarbe
   markiert, mit Angabe wie lange überfällig. Bleibt stehen, bis abgehakt oder gelöscht.
   Nichts verschwindet und nichts wird automatisch verschoben.
2. **Heute**
3. **Morgen**
4. **Diese Woche** (bis einschließlich Sonntag)
5. **Später** (alles mit Datum danach)
6. **Ohne Datum** (`dueDate = null`)

Innerhalb einer Gruppe: Prüfungen (`exam`, `test`) vor dem Rest, dann nach Fach, dann nach
Titel. Jede Zeile zeigt Checkbox, Fach-Punkt in der Fachfarbe, Titel, Typ-Kennzeichnung bei
allem außer `homework`, und das Datum.

Erledigte Aufgaben verschwinden aus der Liste und sind über einen Umschalter "Erledigte
zeigen" einsehbar (die letzten 30 Tage, nach Erledigungsdatum absteigend).

**Abhaken** ist optimistic: die Zeile reagiert sofort, der Server wird danach bestätigt.
Schlägt der Request fehl, springt der Zustand zurück und es erscheint eine Fehlermeldung.

**Anlegen und Bearbeiten** über ein Formular mit: Typ, Fach (Auswahl inklusive
"Allgemein"), Titel, Fälligkeitsdatum (leerbar), Notiz. Titel ist Pflicht, alles andere
optional.

### Anlegen aus dem Stundenplan

Ein Klick auf eine Schulstunde in `app/page.tsx` öffnet ein kleines Menü mit "Hausaufgabe
hinzufügen" und "Klassenarbeit eintragen". Vorausgefüllt sind:
- **Fach:** das zur `subject` der Stunde gehörende Fach (ist keins vorhanden, wird es beim
  Speichern still angelegt).
- **Fälligkeitsdatum:** das Datum der **nächsten** Stunde desselben Fachs nach dem Tag der
  angeklickten Stunde. Gibt es in den geladenen Wochendaten keine, bleibt das Feld leer.

Der Nutzer tippt also im Regelfall nur noch den Titel.

### Aufgaben im Stundenplan

Der Stundenplan bleibt optisch ein Untis-Spiegel. Aufgaben erscheinen ausschließlich subtil
und verdrängen keinen einzigen Stundenblock:

- **Wochenansicht:** unter der Tageszahl eine Reihe kleiner Punkte in den Fachfarben, einer
  pro offener Aufgabe mit `dueDate` an diesem Tag. Maximal 4 Punkte, danach "+N". Prüfungen
  bekommen einen Ring statt eines gefüllten Punkts. Erledigte werden nicht gezeigt.
- **Tagesansicht:** unter dem Kopf eine schlanke, randlose Zeile "Fällig heute" mit
  abhakbaren Einträgen. Keine Karte, kein Rahmen, gedeckte Schrift.
- Ist an einem Tag nichts fällig, wird gar nichts gerendert, insbesondere kein leerer
  Platzhalter, der die Zeilenhöhe ändert.

### Dateien (Schritt 6, abgetrennt)

Auf der Fach-Detailseite ein Bereich "Dateien": Upload per Auswahl oder Drag-and-drop,
Liste mit Name, Größe und Datum, Download-Link, Löschen. Erlaubt sind PDF, PNG, JPG, WEBP
und HEIC bis 10 MB pro Datei. Gespeichert wird über `@vercel/blob` mit
`access: "public"`; die Metadaten liegen in `subject_files`.

Ist `BLOB_READ_WRITE_TOKEN` nicht gesetzt, zeigt der Bereich einen ruhigen Hinweis, dass
der Dateispeicher noch nicht eingerichtet ist. **Der Rest der App funktioniert davon
vollständig unabhängig.**

## Edge Cases

- **Kein Untis-Sync gelaufen / `school_blocks` leer:** Die Fächer-Auswahl zeigt einen
  leeren Zustand mit Hinweis auf den Sync in den Einstellungen und dem Angebot, ein Fach
  manuell anzulegen. Kein Absturz, keine leere Auswahlmaske.
- **Fach wird archiviert, hat aber Aufgaben:** Die Aufgaben bleiben bestehen und erscheinen
  weiter im Aufgaben-Modul mit dem Fachnamen. Nur das Fach ist aus der Übersicht raus.
- **Fach wird gelöscht:** Notizen und Dateien gehen per Cascade mit, Aufgaben werden auf
  `subjectId = null` gesetzt ("Allgemein") und bleiben erhalten. Löschen fragt vorher nach
  und benennt, was passiert.
- **Untis nennt dasselbe Fach unterschiedlich** (z.B. "M" und "MA"): Beide werden zu je
  einem Fach. Der Nutzer kann eines archivieren und das andere umbenennen. Kein
  automatisches Zusammenführen.
- **Aufgabe ohne Fälligkeitsdatum:** landet in "Ohne Datum" und erscheint **nicht** im
  Stundenplan.
- **Aufgabe ohne Fach:** erlaubt, wird als "Allgemein" mit neutralem grauem Punkt geführt.
- **Zeitzone:** "heute" wird konsistent aus der lokalen Datumsangabe als `YYYY-MM-DD`
  gebildet, wie in `app/api/calendar/route.ts` bereits gehandhabt. Keine UTC-Verschiebung,
  die eine Aufgabe am Abend fälschlich als überfällig markiert.
- **Mobile (< md):** Beide Module sind ohne Sidebar über die `mobile-header` erreichbar.
  Aufgaben-Zeilen und Checkboxen halten die bestehende Mindest-Trefferfläche von 44px ein.
- **Markdown-Notiz mit HTML im Body:** wird als Text dargestellt, nicht ausgeführt.

## Umsetzungsschritte

Jeder Schritt ist für sich lauffähig und endet grün.

1. **Datenmodell + API.** Schema, Migration, `lib/subject-store.ts`, `lib/assignment-store.ts`,
   Routen `/api/subjects`, `/api/subjects/[id]`, `/api/subjects/[id]/notes`,
   `/api/notes/[id]`, `/api/assignments`, `/api/assignments/[id]`,
   `/api/assignments/[id]/complete`. Unit-Tests für Gruppierung und Sortierung.
2. **Fächer-Modul.** Einmal-Auswahl, Übersicht, Detailseite mit Stammdaten und nächsten
   Stunden. Sidebar-Eintrag "Fächer".
3. **Notizen.** Liste, Anlegen, Bearbeiten, Löschen, Markdown-Rendering.
4. **Aufgaben-Modul.** Liste mit Gruppen, Überfällig-Block, Abhaken, Composer, Sidebar-
   Eintrag "Aufgaben", Einbindung im Fach.
5. **Stundenplan-Integration.** Anlegen aus der Stunde heraus, Punkte in der Woche, Zeile
   im Tag.
6. **Dateien.** `@vercel/blob`, `subject_files`, Upload und Löschen, Token-fehlt-Zustand.

## Akzeptanzkriterien

Jedes Kriterium einzeln abhaken, mit Beweis (Befehlsausgabe, HTTP-Status oder Screenshot).

**Basis**

- [ ] `npx tsc --noEmit` läuft ohne Fehler.
- [ ] `npm test` ist grün, inklusive neuer Tests für Aufgaben-Gruppierung und -Sortierung.
- [ ] `npm run build` läuft durch und listet die neuen Routen `/aufgaben`, `/faecher`,
      `/faecher/[id]` sowie die neuen API-Routen.

**Datenmodell und API**

- [ ] `npm run db:generate` erzeugt eine Migration mit `subjects`, `subject_notes`,
      `assignments` und dem Enum `assignment_type`; `npm run db:push` läuft durch.
- [ ] `curl -s "localhost:3000/api/subjects"` liefert JSON mit den angelegten Fächern.
- [ ] `curl -s -X POST localhost:3000/api/assignments -H 'content-type: application/json'
      -d '{"title":"Test","type":"homework"}'` liefert 201 und die angelegte Aufgabe.
- [ ] Ein POST ohne `title` liefert 400 mit einer Fehlermeldung, nicht 500.
- [ ] `POST /api/assignments/[id]/complete` setzt `completedAt`, ein zweiter Aufruf auf
      dieselbe Aufgabe erzeugt keinen Fehler; `DELETE` auf denselben Pfad setzt es zurück.

**Fächer**

- [ ] Bei leerer `subjects`-Tabelle zeigt `/faecher` die Auswahl mit den distinct
      `subject`-Werten aus `school_blocks`, alle vorausgewählt.
- [ ] Nach dem Bestätigen zeigt ein Reload von `/faecher` die Übersicht, **nicht** erneut
      die Auswahl.
- [ ] Bei leerer `school_blocks`-Tabelle zeigt `/faecher` den leeren Zustand mit Hinweis auf
      den Sync statt einer leeren Liste.
- [ ] `/faecher/[id]` zeigt Stammdaten und die nächsten Stunden dieses Fachs aus dem
      Stundenplan, mit korrektem Datum.
- [ ] Ein Fach umbenennen und archivieren funktioniert; das archivierte Fach ist aus der
      Übersicht raus und taucht nach einem erneuten Untis-Sync **nicht** wieder auf.

**Notizen**

- [ ] Eine Notiz mit Titel und Markdown-Body anlegen, bearbeiten und löschen funktioniert.
- [ ] Der Body wird gerendert dargestellt: `## Titel`, `- Liste` und `**fett**` erscheinen
      als Überschrift, Liste und Fettschrift, nicht als Rohtext.
- [ ] `<script>alert(1)</script>` im Body erscheint als sichtbarer Text und wird nicht
      ausgeführt.

**Aufgaben**

- [ ] `/aufgaben` zeigt die Gruppen in der Reihenfolge Überfällig, Heute, Morgen, Diese
      Woche, Später, Ohne Datum; leere Gruppen werden weggelassen.
- [ ] Eine Aufgabe mit `dueDate` von gestern steht im Überfällig-Block, in der Fehlerfarbe,
      mit Angabe der Verspätung, und bleibt nach einem Reload dort.
- [ ] Abhaken lässt die Zeile sofort reagieren; nach einem Reload ist sie weiterhin
      erledigt.
- [ ] Bei einem fehlschlagenden Abhak-Request (Server aus) springt der Zustand zurück und
      es erscheint eine Fehlermeldung, statt fälschlich erledigt zu bleiben.
- [ ] Eine Aufgabe ohne Fach wird als "Allgemein" geführt; das Löschen eines Fachs macht
      dessen Aufgaben zu "Allgemein", statt sie zu löschen.
- [ ] Prüfungen stehen innerhalb ihrer Gruppe vor den Hausaufgaben und sind sichtbar als
      Prüfung gekennzeichnet.

**Stundenplan**

- [ ] Klick auf eine Schulstunde bietet "Hausaufgabe hinzufügen" an; Fach und das Datum der
      nächsten Stunde desselben Fachs sind vorausgefüllt.
- [ ] In der Wochenansicht erscheinen unter der Tageszahl Punkte für offene Aufgaben mit
      Fälligkeit an dem Tag, maximal 4 plus "+N", Prüfungen als Ring.
- [ ] Aufgaben ohne Datum erscheinen nirgends im Stundenplan.
- [ ] Kein Stundenblock wird durch die Aufgaben-Anzeige verschoben, verkleinert oder
      überdeckt; an einem Tag ohne fällige Aufgaben ist die Darstellung pixelgleich zu
      vorher.

**Dateien**

- [ ] Ohne gesetztes `BLOB_READ_WRITE_TOKEN` zeigt der Dateibereich den Hinweis-Zustand,
      und alle anderen Kriterien dieser Spec bleiben erfüllt.
- [ ] Mit gesetztem Token: ein PDF hochladen, in der Liste sehen, herunterladen und löschen.
- [ ] Eine Datei über 10 MB wird mit einer verständlichen Meldung abgelehnt, nicht mit
      einem Absturz.

**Zugänglichkeit und Mobile**

- [ ] Beide Module sind per Tastatur bedienbar: Aufgaben abhaken mit Leertaste, sichtbarer
      Fokusring auf allen interaktiven Elementen.
- [ ] Checkboxen und Zeilen-Aktionen haben mindestens 44px Trefferfläche.
- [ ] Bei aktiviertem "Bewegung reduzieren" laufen keine Enter-Animationen der neuen
      Listen.

## Verifikationsplan

```bash
cd /Users/thimofejzapko/Desktop/schule
npx tsc --noEmit
npm test
npm run build
npm run db:generate && npm run db:push
npm run db:seed          # Testdaten, solange WebUntis abgeschaltet ist
npm run dev              # danach die Live-Checks unten
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/aufgaben
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/faecher
curl -s localhost:3000/api/subjects | head -c 300
curl -s localhost:3000/api/assignments | head -c 300
curl -s -X POST localhost:3000/api/assignments \
  -H 'content-type: application/json' -d '{"type":"homework"}' -i | head -1   # erwartet 400
```

Visuelle Kriterien (Überfällig-Block, Punkte im Wochenraster, keine Verschiebung der
Stundenblöcke, Vorbelegung aus der Stunde heraus) werden im laufenden `next dev` geprüft
und mit Screenshot belegt.

## Getroffene Annahmen

Diese Punkte wurden nicht erfragt, sondern aus Code und Projektstand abgeleitet. Wenn eine
davon falsch ist, vor der Umsetzung korrigieren.

- **Single-User.** Kein Auth, keine `userId`-Spalten, wie im gesamten bestehenden Schema.
- **Neon Postgres über Drizzle**, gleiche Muster wie `school_blocks`: `uuid` als
  Primärschlüssel, `createdAt`/`updatedAt` mit Zeitzone.
- **Routen auf Deutsch** (`/aufgaben`, `/faecher`), passend zur durchgehend deutschen
  Oberfläche. API-Pfade und Feldnamen bleiben englisch, wie `/api/calendar` und `school_blocks`.
- **Farbpalette:** Fachfarben kommen aus den bestehenden Design-Tokens in `globals.css`.
  Der in `36f031b` entfernte `color-picker` und `event-colors` werden nicht zurückgeholt;
  stattdessen eine feste Auswahl von etwa acht Tokens.
- **Markdown-Rendering** über eine schlanke Bibliothek als neue Dependency. Kein
  Rich-Text-Editor, das Bearbeiten passiert im Textfeld.
- **Keine neue UI-Bibliothek.** Gebaut wird mit den vorhandenen Bausteinen (`button`,
  `dropdown-menu`, `stagger`) plus neuen Komponenten im selben Stil. `sonner` wurde in
  `36f031b` entfernt; für Fehlermeldungen entweder eine schlanke eigene Lösung oder
  `sonner` bewusst wieder aufnehmen.
- **Kein Deploy.** Vercel bleibt zurückgestellt, wie schon in M001.

## Übergabe

Neue Session starten mit:

```
Setze .ytstack/SPEC.md um. Arbeite die Umsetzungsschritte 1 bis 6 der Reihe nach ab und
hake am Ende jedes Akzeptanzkriterium einzeln mit Beweis ab.
```
