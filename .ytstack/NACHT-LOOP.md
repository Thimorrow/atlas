# Nacht-Loop 2026-09-02 -> 2026-09-03

Du arbeitest allein. Der Besitzer schlaeft. **Frage nie nach.** Unklarheiten kommen
nach `.ytstack/INBOX.md`, dann arbeitest du mit der plausibelsten Annahme weiter.

## Ziel

Die **Web-App** von Atlas wird ueber Nacht ernsthaft weitergebaut. Um **06:30**
liegt ein Merge auf `main`, der zu hundert Prozent laeuft, und ein Bericht, den
der Besitzer in fuenf Minuten liest.

`android/` wird heute Nacht **nicht angefasst**. Kein Commit darf eine Datei
unter `android/` beruehren.

## Harte Grenzen

- **06:30 ist Schluss.** Ab **05:45** wird nichts Neues mehr begonnen, nur noch
  das Schlussfenster (unten) abgearbeitet.
- **Kein Geld.** Keine kostenpflichtigen Dienste, keine neuen bezahlten Tools.
  npm-Pakete nur gratis, verbreitet (Richtwert ab 100k Downloads/Woche), und
  jedes neue Paket wird im Bericht genannt.
- **Datenbank nur additiv.** Neue Tabellen und neue nullable Spalten ja, ueber
  eine Migration in `drizzle/` plus `/api/admin/migrate`. Kein DROP, kein RENAME,
  keine Typaenderung an bestehenden Spalten, kein Loeschen von Zeilen. Ein
  Feature, das ohne destruktive Migration nicht geht, wird nicht gebaut, sondern
  im Bericht als "nicht gebaut, weil" vermerkt.
- **Playwright klickt nichts Zerstoererisches.** Screenshot-Durchgaenge lesen
  nur. Kein Klick auf Loeschen, Entfernen, Zuruecksetzen. Zum Testen von
  Schreibwegen legst du ein eigenes Fach `ZZ Testfach` an und arbeitest nur darin.
- **Git-Identitaet:** vor dem ersten Commit pruefen, dass
  `git config user.email` = `292338461+Thimorrow@users.noreply.github.com` ist.
  Falls nicht, lokal fuer dieses Repo setzen. Niemals zapkothimofej.
- **Kein Gedankenstrich** (em-dash) in Text, den der Besitzer oder ein Nutzer
  der App sieht. Oberflaechentexte sind deutsch.
- Max **3 Subagenten gleichzeitig**.
- Screenshots gehoeren nicht in die Historie: `.ytstack/shots/` steht in
  `.gitignore` und wird nie committet.

## Zustand (lies das zuerst, jede Iteration)

1. `.ytstack/NACHT-QUEUE.md` -- die Feature-Warteschlange mit Status je Feature.
   Existiert sie nicht, ist dies die erste Iteration: lege sie an (Format unten).
2. `.ytstack/NACHTBERICHT.md` -- was schon erledigt ist.
3. `git log --oneline schule-scope..HEAD` -- was schon committet ist.
4. `.ytstack/STATE.md` -- was die App vor der Nacht konnte.

Ein Feature gilt als **erledigt**, wenn es in `NACHT-QUEUE.md` auf `fertig` steht
UND ein Commit dazu existiert. Nie doppelt bauen.

## Datenumgebung (einmalig in der ersten Iteration einrichten)

Wichtig, sonst siehst du nur leere Seiten: in `.env.local` sind `DATABASE_URL`,
alle vier `WEBUNTIS_*` und `ATLAS_SESSION_SECRET` **leere Strings**. `vercel env
pull` hilft nicht, `DATABASE_URL` ist auf Vercel als sensitiv hinterlegt und
kommt leer zurueck. Preview-Deploys stehen hinter Vercel-SSO, dorthin kommt
Playwright nicht. Die **Production**-App dagegen haengt nur hinter dem
App-Passwort und ist erreichbar.

Richte deshalb eine lokale Arbeitsdatenbank mit den **echten** Daten ein:

1. PostgreSQL 16 ist ueber Homebrew installiert
   (`/opt/homebrew/opt/postgresql@16/bin`). Dienst starten
   (`brew services start postgresql@16`), Datenbank `atlas_dev` anlegen.
2. **Erst eine Kopie von `.env.local` anlegen.** Dann dort `DATABASE_URL` auf die
   lokale Datenbank setzen und `ATLAS_SESSION_SECRET` mit `openssl rand -hex 32`
   fuellen. Die vier `WEBUNTIS_*` bleiben leer, der Untis-Abgleich wird lokal
   nicht gebraucht. Im Bericht vermerken, was geaendert wurde.
3. Migrationen gegen die lokale Datenbank fahren (`npm run db:migrate`, das geht
   jetzt, weil `DATABASE_URL` lokal gesetzt ist).
4. Die Datenbank mit dem echten Schnappschuss unter `.ytstack/nacht-snapshot/`
   fuellen (`home.json` = Stundenplan der laufenden Woche, `subjects.json`,
   `grades.json`, `assignments.json`, aus der Live-App gezogen). Schreibe dir
   dafuer ein kleines Skript unter `scripts/`, das den Schnappschuss in die
   Tabellen einspielt. Aufgaben sind leer, lege dort ein paar plausible
   Eintraege an, damit die Aufgaben-Ansicht nicht leer aussieht.
5. Fehlt der Schnappschuss oder ist er unbrauchbar, hole ihn selbst neu: auf
   `https://atlas-ten-orpin.vercel.app` per `POST /api/login` mit
   `ATLAS_PASSWORD` aus `.env.local` anmelden, dann `/api/home`,
   `/api/subjects`, `/api/grades`, `/api/assignments` abrufen.

**Die echte Neon-Datenbank wird heute Nacht nicht angefasst**, weder von dir noch
von Playwright, ausser dem lesenden Abruf aus Schritt 5. Schnappschuss und lokale
Datenbank enthalten echte persoenliche Daten: `.ytstack/nacht-snapshot/` ist
gitignored und wird nie committet, ebenso wenig gehoeren Passwoerter oder
Schluessel in Code, Commits oder Bericht.

## Weitere Festlegungen

- **Zielgroesse:** der Bot plus vier bis sechs weitere Features. Lieber weniger
  und richtig als viele halb.
- **Bestehendes anfassen:** erlaubt, aber nur wenn es dem neuen Feature direkt im
  Weg steht, und immer als eigener Commit mit eigener Zeile im Bericht.
- **`to-do.md`:** heute Nacht nicht als Quelle nutzen, der Abschnitt "Offen" ist
  leer und bleibt unberuehrt.
- **Tests:** fuer Logik (Bot-Werkzeuge, Datei-Extraktion, neue Berechnungen) je
  ein paar `vitest`-Tests. Fuer Oberflaeche keine.
- **Bot-Gedaechtnis:** eigene, additiv angelegte Tabelle fuer Gespraechsverlaeufe,
  damit morgens nachlesbar ist, welche Aufgabe der Bot auf welche Bitte hin
  angelegt hat.

## Arbeitsbranch

**Achtung, `main` ist veraltet.** Die aktuelle Arbeit liegt auf `schule-scope`
(inklusive der v0-Skeleton-Loader). `main` haengt sieben Commits zurueck. Zweige
deshalb von **`schule-scope`** ab, niemals von `main`:

`git checkout schule-scope && git checkout -b nacht/2026-09-03`

Alles laeuft auf diesem Branch. Ein Commit pro Feature, damit der Besitzer
einzelne rauswerfen kann. Nach jedem Feature-Commit:
`git push -u origin nacht/2026-09-03`.

Der Branch `origin/v0/design-system-96511499` (Design-System-Schaukasten) bleibt
heute Nacht liegen, er haengt an einem aelteren Stand. Erwaehne ihn im Bericht
als offenen Punkt.

## Phase 1 (nur erste Iteration): Features finden

Du versetzt dich in einen Schueler der **10. Klasse** eines deutschen
Gymnasiums, der Atlas jeden Morgen statt Untis aufmacht. Atlas kann heute:
Stundenplan (Untis-Spiegel), Aufgaben, Faecher mit Notizen und Dateien, Noten
mit Gewichtung, Microsoft/OneNote-Anbindung.

Sammle **breit** Kandidaten, bis nichts wirklich Neues mehr kommt. Dann bewerte
jeden mit deinem eigenen Ermessen, grosszuegig, aber ehrlich. Leitfragen:

- Loest es einen Schmerz, den ein Zehntklaesser mindestens woechentlich hat?
- Ersetzt oder erspart es eine App bzw. einen Handgriff, den er heute wirklich macht?
- Laeuft es ohne Zugaenge, die nicht da sind, und ohne laufende Kosten?
- Ist es in ein bis zwei Stunden ehrlich fertig zu bauen, inklusive guter UI?

Kein Feature-Wildwuchs: was nur "nice" klingt, aber keinen echten Handgriff
spart, kommt in die Nein-Liste mit Begruendung. Lieber sechs Sachen richtig als
zwoelf halb.

**Gesetzt und zuerst: der Atlas-Bot** (Beschreibung unten). Er steht als
Feature 1 in der Warteschlange und wird komplett fertig, bevor etwas anderes
beginnt.

Schreibe die Warteschlange:

```
# Nacht-Queue
| # | Feature | Status | Commit | Notiz |
|---|---------|--------|--------|-------|
| 1 | Atlas-Bot | offen | | gesetzt, hoechste Prioritaet |
| 2 | ... | offen | | |
```
Status: `offen` | `laeuft` | `fertig` | `gescheitert` | `nicht gebaut`.
Darunter der Abschnitt `## Bewusst nicht gebaut` mit je einer Zeile Begruendung.

## Feature 1: Der Atlas-Bot (Pflicht, zuerst)

Ein Assistent **in** Atlas, der die echten Daten des Besitzers kennt und fuer ihn
handelt.

- **Modell:** ueber das **Vercel AI Gateway**, Key steht als
  `AI_GATEWAY_API_KEY` in `.env.local`. Es **muss ein kostenloses Modell** sein.
  Rate keinen Modellnamen: hole die Modellliste des Gateways ab, waehle ein
  gratis verfuegbares aus, belege die Wahl mit einem echten Testaufruf und
  schreibe Anbieter, Modell-ID und den Beleg in den Bericht. Faellt das Modell
  aus, faellt der Bot sauber auf einen Hinweis zurueck, nie auf einen Absturz.
- **Lesen:** alles, was in Atlas liegt, also Stundenplan, Aufgaben, Faecher,
  Notizen, Noten und die Fach-Dateien (Vercel Blob). Antworten nennen die Quelle, z.B. "steht in Mathe/Ableitungen.pdf".
  Text und Markdown direkt lesen, PDF ueber eine Gratis-Bibliothek extrahieren,
  Bilder nur wenn ein kostenloses Vision-Modell verfuegbar ist (moeglicherweise
  MiniMax M3, das aber pruefen statt annehmen), sonst ehrlicher Hinweis. Sind nur
  Text-Modelle gratis, ist das voellig in Ordnung: der Bot sagt dann klar, dass er
  Bilder nicht lesen kann.
- **Handeln:** Aufgaben und Notizen anlegen und aendern darf er direkt.
  **Noten nur nach ausdruecklicher Bestaetigung** des Besitzers im Dialog.
  **Loeschen nie**, weder Dateien noch Zeilen.
- **Ort:** Overlay per Cmd+K von jeder Seite aus, dazu eine eigene Seite `/bot`.
- **Erster Eindruck:** kein leeres Eingabefeld. Beim Oeffnen begruesst er mit dem
  echten Tag ("Morgen hast du Biologie, Informatik und Mathe, in Mathe steht eine
  Arbeit an") und bietet drei anklickbare Vorschlaege an, etwa "Was muss ich fuer
  morgen machen?", "Fass mir meine Bio-Notizen zusammen", "Trag mir eine
  Hausaufgabe ein".
- **Sichtbares Handeln:** Legt er etwas an, erscheint die angelegte Aufgabe oder
  Notiz als echte Karte im Verlauf, mit einem Rueckgaengig-Knopf daneben. Kein
  Fliesstext, der behauptet, etwas getan zu haben. Bei Noten kommt dieselbe Karte
  vorher als Vorschau mit "Eintragen" und "Verwerfen".
- **Antwortverhalten:** Die Antwort wird **gestreamt**, Wort fuer Wort, dazu eine
  Zeile, was er gerade tut ("liest Mathe-Notizen", "legt Aufgabe an"). Langsam
  ist in Ordnung, kostenlos ist Pflicht. Kommt nach 30 Sekunden gar nichts, bricht
  er ehrlich ab statt in einem haengenden Ladekreis zu bleiben.
- **Ohne Key:** Der Bot schaltet sich stumm ab und zeigt einen Hinweis, genau wie
  die Microsoft-Anbindung es heute schon macht. Die App laeuft unveraendert weiter.
- **Key bei Vercel:** versuche
  `vercel env add AI_GATEWAY_API_KEY` fuer preview und production mit dem Wert
  aus `.env.local`. Scheitert es (CLI nicht eingeloggt), baue trotzdem fertig und
  schreibe eine Zeile nach `.ytstack/INBOX.md`.
- `.env.example` um `AI_GATEWAY_API_KEY` mit Kommentar ergaenzen.

## Ablauf je Feature (Phase 2, jede weitere Iteration)

Nimm das oberste Feature mit Status `offen`, setze es auf `laeuft`, und starte
**einen Subagenten** (Agent-Typ `implementer`, Modell `sonnet`) mit einem
Auftrag, der Folgendes vollstaendig enthaelt, weil der Subagent dieses Gespraech
nicht kennt:

1. **Durchdenken:** Was genau baut er, welche Dateien, welches Datenmodell,
   welche API-Routen, welche Faelle koennen schiefgehen. Kurz aufschreiben, bevor
   er tippt.
2. **Bauen** im Stil des bestehenden Codes (Next.js 16 App Router, Drizzle,
   Tailwind, bestehende Komponenten in `components/` wiederverwenden, deutsche
   Oberflaechentexte, keine Gedankenstriche).
3. **UI-Schleife mit Emil** -- das ist der wichtigste Teil und wird nicht
   abgekuerzt:
   - **Playwright** per npm dazuinstallieren, falls noch nicht da. Playwright ist
     ein echter Browser, der lokale Dev-Server (`npm run dev`) genuegt also
     vollkommen und spart pro Runde die Deploy-Wartezeit. Die lokale Datenbank
     enthaelt die echten Daten (siehe Datenumgebung), die Oberflaeche sieht also
     aus wie im Alltag. Preview-Deploys sind KEIN Ausweg, sie stehen hinter
     Vercel-SSO.
   - Steht ein Passwort-Gate im Weg (lokal ist `ATLAS_PASSWORD` in `.env.local`
     gesetzt), meldet sich Playwright ueber `/login` mit genau diesem Wert an.
     Das Passwort steht nirgends im Code, in keinem Commit und in keinem Bericht.
   - Screenshots der neuen Oberflaeche: **Desktop 1440 Breite, helles Thema**,
     ein bis drei Bilder je Runde, abgelegt unter
     `.ytstack/shots/<feature>/runde-N-*.png`. Handy-Ansicht und dunkles Thema
     brauchst du heute Nacht nicht.
   - Den `ask-emil`-Skill aufrufen, die Screenshots und den betroffenen Code
     vorlegen, um eine schonungslose Kritik bitten und die genannten Punkte
     abarbeiten.
   - **Wiederholen, bis zwei Runden hintereinander nichts Substanzielles mehr
     gefunden wird**, also die UI wirklich gut ist. Harte Obergrenze **10 Runden**
     je Feature. Wird sie erreicht, wird der beste Stand genommen und die offenen
     Punkte kommen in den Bericht.
4. **Gate, bevor irgendetwas committet wird.** Alle drei muessen gruen sein:
   - `npx tsc --noEmit`
   - `npm test`
   - `npm run build`
   Faellt eines durch und laesst es sich nicht reparieren:
   `git restore` bzw. Branch sauber machen, Feature auf `gescheitert` setzen,
   Grund notieren, weiter zum naechsten. Nie kaputten Code committen.
5. **Ein Commit** fuer das Feature, deutscher Betreff im Stil der bisherigen
   Historie (siehe `git log`), am Ende die Zeile
   `Claude-Session: https://claude.ai/code/session_01C5RztXqMdsrHpKfn8H2Lwu`.
   Danach pushen.

Der Subagent meldet zurueck: was gebaut wurde, wie viele Emil-Runden, was Emil
zuletzt noch offen liess, Gate-Ergebnisse als echte Ausgabe, Commit-Hash.
Nimm das nicht ungeprueft hin: schau selbst per `git show --stat` drauf.

Dann Warteschlange auf `fertig` setzen, Bericht ergaenzen, naechste Iteration.

## Schlussfenster ab 05:45 (nicht verschieben)

1. Laufende Subagenten abschliessen lassen oder abbrechen. Nichts Neues starten.
2. Auf `nacht/2026-09-03`: `npx tsc --noEmit`, `npm test`, `npm run build`.
   Was rot ist, wird per `git revert` des betreffenden Feature-Commits entfernt,
   bis alles gruen ist. Lieber ein Feature weniger als ein kaputtes `main`.
3. Erst `git checkout schule-scope && git merge nacht/2026-09-03 && git push`.
   Dann `git checkout main && git pull && git merge schule-scope` (kein Rebase).
   `main` holt damit auch die sieben Commits auf, die ihm heute fehlen.
   Danach die drei Pruefungen **auf `main` erneut** laufen lassen. Nur wenn alle
   gruen sind: `git push origin main`.
4. Deploy verifizieren: `vercel ls` bzw. das Projekt-Dashboard pruefen, bis der
   Production-Deploy **READY** ist. BLOCKED oder ERROR heisst: sofort die
   Ursache suchen, notfalls den Merge auf `main` per `git revert` zuruecknehmen
   und pushen, damit `main` in jedem Fall laeuft. Der Zustand um 06:30 muss
   funktionieren, das steht ueber jeder Feature-Anzahl.
5. **`.env.local` zuruecksetzen** auf den Zustand vor der Nacht (Kopie aus
   Schritt 2 der Datenumgebung).
6. **Migrationen sind heute Nacht besonders heikel**, weil `main` sieben Commits
   aufholt und darin schon Migrationen stecken (unter anderem die Stundennotizen),
   die auf Production moeglicherweise nie angewendet wurden. Nach dem erfolgreichen Deploy auf
   `https://atlas-ten-orpin.vercel.app` per `POST /api/login` mit
   `ATLAS_PASSWORD` anmelden und `POST /api/admin/migrate` aufrufen. Danach mit
   einem echten Abruf von `/api/home` und der neuen Funktion pruefen, dass die
   Live-App wirklich antwortet. Antwortet sie nicht, den Merge per `git revert`
   zuruecknehmen und pushen. Ergebnis in den Bericht.
7. Bericht fertigstellen, dann `ScheduleWakeup` mit `stop: true`.

## Der Bericht: `.ytstack/NACHTBERICHT.md`

Genau diese Reihenfolge, nichts weiter:

1. **Zehn Zeilen "das ist neu"**, ganz oben, in normalem Deutsch.
2. Je Feature ein Absatz: was es kann, wo man es findet, Screenshot-Pfad,
   Commit-Hash, wie viele Emil-Runden es brauchte, was Emil zuletzt offen liess.
3. **Bewusst nicht gebaut**, je Zeile eine Begruendung.
4. **Gescheitert**, mit Grund.
5. Neue npm-Pakete, neue Migrationen, neue Umgebungsvariablen.
6. Offene Fragen an den Besitzer (dieselben wie in `INBOX.md`).
7. Zustand von `main` und die Live-URL mit Deploy-Status.

## Takt

Nach jeder Iteration `ScheduleWakeup` mit einer Pause, die zur Lage passt:
laeuft ein Subagent, reicht eine lange Pause (1200s und mehr), weil du bei
dessen Ende ohnehin geweckt wirst. `noop: true` nur, wenn wirklich nichts
passiert ist. Um 06:30 in jedem Fall `stop: true`.
