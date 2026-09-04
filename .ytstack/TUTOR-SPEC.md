# Tutor im Lernbereich: KI-Nachhilfe nach Timos Lernprompt

Stand 2026-09-04. Auftrag: "Ich will beim Lernen gerne LLM-Integration haben",
Richtung RocketTutor / Astra AI, Didaktik exakt nach Timos Nachhilfe-Prompt
(unten wörtlich übernommen). Baut auf LERNEN-SPEC.md auf; alles dort bleibt
gültig.

## Ziel in einem Satz

Zu jedem Lernthema gibt es eine Tutor-Session: ein Chat mit Widgets, der erst
den Wissensstand abfragt, das schwächste Teilthema schrittweise erklärt, eine
Checkliste aus 5 bis 8 Aufgaben von leicht bis schwer stellt, jede Antwort
sofort bewertet und die nächste Aufgabe wiederholt, am Ende ein Fazit zieht
und Lücken als neue Karten anlegt; als Probe liefert dieselbe Session Punkte,
Prozent und Note.

## Scope

1. **Tutor-Session** (Modus `lernen`) pro Thema, Verlauf in der DB.
2. **Widgets** im Chat: Auswahl-Widget (Wissensstand, Optionen, "gecheckt?"),
   Checkliste mit Aufgabenstatus, Fazit-Karte.
3. **Probe-Simulation** (Modus `probe`): erst "Kann ich das?"-Checkliste zum
   Selbst-Einschätzen, dann 5 bis 8 Aufgaben mit Bewertung, am Ende Punkte,
   Prozent, Note. Ergebnis gespeichert, auf der Themenseite sichtbar.
4. **Schwächen-Coach**: Fazit nennt Stärken und Lücken und schlägt Karten zu
   den Lücken vor, ein Klick legt sie im Thema an.
5. **Freie Antworten in der Kartensession bewerten**: bei Karten der Art
   `wissen` und `aufgabe` eigene Antwort tippen, das Modell schlägt
   richtig / teilweise / falsch mit kurzem Feedback vor, die Wahl "Gewusst" /
   "Nicht gewusst" ist vorbelegt, Timo bestätigt oder überstimmt.

## Nicht-Scope

- Kein neues Modell, kein neuer Provider, kein AI-SDK-Paket. Weiter
  `streamChatWithFallback` aus `lib/bot/model.ts` (Z.ai, GLM 5.3).
- Keine Android-Änderungen, nur Web.
- Kein Sprach- oder Audio-Input, kein Foto-Upload von Aufgaben (Idee für
  später, siehe "Offen").
- Der allgemeine Atlas-Bot (`app/bot`, `lib/bot/tools.ts`) bleibt unverändert.
  Der Tutor bekommt eigene Tabellen und eine eigene Route.
- Keine Tabellenumbauten an `study_cards`, `study_topics`, `study_reviews`.

## Didaktik: Systemprompt des Tutors

Timos Prompt wird als Konstante `TUTOR_PROMPT` in `lib/tutor/prompt.ts`
hinterlegt, inhaltlich unverändert, nur angepasst an das, was die App
liefern kann (Klasse 10, Fach und Thema kommen aus dem Kontext, nicht per
Frage; Widgets sind die Tools unten). Wörtlicher Kern:

> Über den Schüler: Timo, 10. Klasse, Deutsch. Schlau, direkt, mag keine
> Umwege, sag einfach was Sache ist. Mag es, wenn Erklärungen schrittweise
> aufgebaut werden. Sagt ehrlich, wenn er was nicht checkt. Spricht manchmal
> undeutlich, versteh den Kontext trotzdem. Keine langen Textwände, kurz und
> knackig.
>
> Grundprinzipien: Immer zuerst fragen, was er schon weiß, nie blind
> erklären. Ein Konzept auf einmal: erklären, Frage stellen, dann weiter.
> Sofort korrigieren, aber freundlich, kein falsches Lob. Bei Fehlern erst
> Hint geben, nicht direkt die Lösung. Wenn er sagt "erklär du alles":
> Schritt für Schritt mit Zwischenfragen. "gecheckt?" am Ende einer
> Erklärung fragen.
>
> Checklisten: immer von leicht zu schwer, 5 bis 8 Aufgaben. Wenn er eine
> Aufgabe beantwortet: kurz bestätigen oder korrigieren, dann sofort die
> nächste Aufgabe nochmal hinschreiben, nie einfach weitergehen ohne die
> nächste Aufgabe nochmal hinzuschreiben. Beispiel: Antwort auf Aufgabe 3,
> dann ✅/❌ plus kurzes Feedback, dann Aufgabe 4 nochmal hinschreiben. Bei
> "skip" oder "kann ich nicht": kurzen Hint geben, dann weiter.
>
> Erklärungen: erst das einfachste Beispiel, dann schrittweise komplexer.
> Vergleiche, die er kennt (Werkzeuge, Bauanleitung, Staffellauf). ASCII-
> Visualisierungen, wenn möglich: Pfeile, Diagramme, Symbole helfen extrem.
> Nach jeder Erklärung eine konkrete Testfrage. Wenn er etwas nicht checkt:
> nochmal anders erklären, nicht dasselbe wiederholen.
>
> Widgets immer benutzen für: zu Beginn (was weiß er schon, was ist schwer),
> wenn er zwischen Optionen wählen soll, wenn du wissen willst, ob er es
> gecheckt hat oder nochmal erklärt haben will. Niemals blind anfangen, ohne
> erst den Wissensstand abzufragen.
>
> Ablauf einer guten Session: 1. Widget: was weiß er schon, was ist schwer.
> 2. Schwächstes Thema zuerst, schrittweise erklären. 3. Checkliste
> erstellen, leicht bis schwer. 4. Bei jeder Antwort bestätigen/korrigieren
> und nächste Aufgabe sofort wiederholen. 5. Am Ende kurzes Fazit, was gut
> war.

Zusätze im Prompt, die aus der App folgen:

- Kontextblock (vom Server gebaut, `buildTutorContext`): Fach, Lernart,
  Thema-Titel, Lernzettel (max. 6000 Zeichen), Karten des Themas als
  "Frage / Antwort" (max. 40, schwache Karten mit Box 0 oder 1 zuerst und
  markiert), nächste Prüfung mit Tagen bis dahin, bei Einstieg aus einer
  Karte diese Karte als "aktuelle Frage". Kein Dateiinhalt, kein Lehrplan
  (das deckt der Lernzettel ab).
- Modus `probe`: "Diese Session ist eine Probe. Kein Erklären vorab. Schritt
  1: Widget mit 5 bis 8 Kompetenzen des Themas, Mehrfachauswahl 'Kann ich
  sicher'. Schritt 2: Checkliste mit 5 bis 8 Aufgaben wie in einer
  Klassenarbeit, leicht bis schwer, ohne Hints, bei 'skip' gilt die Aufgabe
  als falsch. Schritt 3: Fazit mit Punkten je Aufgabe (Schwierigkeit 1 bis
  3 = maximale Punkte) und Gesamtpunkten."
- Formatregeln: Markdown, ASCII-Skizzen in Codeblöcken, Antworten unter
  ca. 120 Wörtern außer bei "erklär du alles". Aufgaben in der Checkliste
  nummeriert "Aufgabe N:" und immer im Klartext wiederholen.
- Tool-Regeln: Auswahlfragen NUR über das Tool `frage_auswahl`, nie als
  Fließtext. Nach jeder bewerteten Aufgabe ZUERST `aufgabe_ergebnis`, dann
  Feedback plus nächste Aufgabe im Text. Am Ende IMMER `fazit`.

## Widgets = Tools des Modells (`lib/tutor/tools.ts`)

Alle Tools als `ChatTool[]`, Argumente manuell validieren wie in
`lib/bot/tools.ts` (`zod` ist nicht installiert,
kein neues Paket).

| Tool | Argumente | Serververhalten | Antwort ans Modell |
|---|---|---|---|
| `frage_auswahl` | `frage: string`, `optionen: string[]` (2 bis 6), `mehrfach: boolean` | Nachricht mit `tool_name` speichern, Event `widget` senden, Stream mit `done` beenden und auf Timos Klick warten | erst nach Klick: `{ auswahl: string[] }`, bei Freitext `{ auswahl: [], text }` |
| `checkliste_erstellen` | `titel: string`, `aufgaben: { nr, text, schwierigkeit: 1..3 }[]` (5 bis 8) | in `tutor_conversations.checkliste` speichern, alle Status `offen`, Event `checkliste` | `{ ok: true }`, Modell schreibt weiter (Aufgabe 1) |
| `aufgabe_ergebnis` | `nr: number`, `status: "richtig" \| "falsch" \| "uebersprungen"`, `punkte?: number` | Status in der Checkliste setzen, Event `checkliste` | `{ ok: true, offen: n }` |
| `fazit` | `gutWar: string[]`, `schwach: string[]`, `neueKarten: { question, answer, kind }[]` (0 bis 8), `punkte?: number`, `gesamt?: number` | in `ergebnis` speichern, `endedAt` setzen; bei `probe` `prozent = round(punkte/gesamt*100)` und `note = noteFuerProzent(prozent)`; Event `fazit` | `{ ok: true }` |

Auswahl-Widget zeigt immer zusätzlich "Anders..." (öffnet das Textfeld).
Bei `frage_auswahl` endet die Modellrunde; der nächste POST mit
`widgetAntwort` hängt die Tool-Antwort an und startet die nächste Runde.

`noteFuerProzent(p)` in `lib/tutor/note.ts`, rein, getestet: ≥85 → 1,
≥70 → 2, ≥55 → 3, ≥40 → 4, ≥20 → 5, sonst 6.

## Datenmodell (Migration `0018_tutor`)

- Enum `tutor_modus` (`lernen`, `probe`), Enum `tutor_message_role`
  (`user`, `assistant`, `tool`).
- Tabelle `tutor_conversations`: `id uuid pk default random`,
  `topic_id uuid not null → study_topics.id on delete cascade`,
  `subject_id uuid not null → subjects.id on delete cascade`,
  `modus tutor_modus not null default 'lernen'`,
  `card_id uuid null → study_cards.id on delete set null` (Einstiegskarte),
  `checkliste jsonb null` (`{ titel, aufgaben: [{ nr, text, schwierigkeit,
  status, punkte? }] }`), `ergebnis jsonb null` (`{ gutWar, schwach,
  neueKarten, punkte?, gesamt?, prozent?, note? }`), `karten_angelegt
  boolean not null default false`, `created_at`, `updated_at`,
  `ended_at timestamptz null`. Index auf `(topic_id, created_at)`.
- Tabelle `tutor_messages`: wie `bot_messages` (`id`, `conversation_id →
  tutor_conversations on delete cascade`, `role`, `content text not null
  default ''`, `tool_name`, `tool_args jsonb`, `tool_result jsonb`,
  `created_at`), Index `(conversation_id, created_at)`.
- Migration per `npx drizzle-kit generate --name tutor` erzeugen und die
  SQL prüfen: nur diese zwei Tabellen und zwei Enums, keine fremden ALTERs
  (KNOWLEDGE.md).

Store `lib/tutor/store.ts` nach dem Muster von `lib/bot/store.ts`:
`createTutorConversation`, `getTutorConversation`, `listTutorConversations
(topicId)`, `listTutorMessages`, `appendTutorMessage`, `setCheckliste`,
`setAufgabeStatus`, `setErgebnis`, `markKartenAngelegt`,
`deleteTutorConversation`.

## Kern (`lib/tutor/session.ts`)

`runTutorTurn(conversationId, signal): AsyncGenerator<TutorEvent>` lädt
Kontext und Verlauf, baut `ChatMessage[]` (system = Prompt + Kontext),
ruft `streamChatWithFallback(messages, tutorTools, signal)` in einer
Schleife wie `app/api/bot/route.ts` (Text streamen, Tool-Calls ausführen,
Tool-Antworten anhängen, weitere Runde), maximal 6 Runden je Turn. Bricht
nach `frage_auswahl` ab. Speichert jede Assistant-Nachricht und jeden
Tool-Aufruf mit Ergebnis in `tutor_messages`. Timeout 110 s je Modellruf.

Events (NDJSON, ein Objekt je Zeile):
`{ type: "text", delta }`, `{ type: "widget", messageId, frage, optionen,
mehrfach }`, `{ type: "checkliste", checkliste }`, `{ type: "fazit",
ergebnis }`, `{ type: "error", text }`, `{ type: "done", conversationId }`.

Erster Turn einer neuen Session: ohne Nutzernachricht, das Modell startet
mit dem Wissensstand-Widget (Prompt-Regel 1). Bei Einstieg aus einer Karte
(`cardId`) lautet die erste versteckte Nutzernachricht "Ich hänge bei
dieser Frage: <question>".

## Bewertung freier Antworten (`lib/lernen-generieren.ts`)

`bewerteAntwort(cardId, antwort): Promise<{ urteil: "richtig" | "teilweise"
| "falsch"; feedback: string }>`. Prompt: Frage, Musterantwort, Timos
Antwort; Urteil nach Kern der Sache (bei `aufgabe`: Endergebnis und
Rechenweg, kleine Schreibfehler egal), Feedback max. 40 Wörter, ehrlich,
bei falsch ein Hint statt der Lösung. Antwort des Modells als JSON
`{ "urteil": ..., "feedback": ... }`; Parser `parseUrteil(text)` in
`lib/lernen.ts`, rein, getestet (findet das JSON auch in umgebendem Text,
Unbekanntes → `null`). Timeout 30 s. Kein Speichern, das macht die
bestehende Antwort-Route nach Timos Bestätigung.

## API

- `POST /api/lernen/tutor` `{ topicId, modus?: "lernen" | "probe",
  cardId? }` → 201 `{ conversation }`. 404 bei unbekanntem Thema, 400 bei
  falschem Body, 503 wenn `botEnabled()` false.
- `GET /api/lernen/tutor?topicId=` → `{ conversations: [{ id, modus,
  createdAt, endedAt, ergebnis, checklisteFortschritt: { erledigt, gesamt }
  }] }`, neueste zuerst.
- `GET /api/lernen/tutor/[id]` → `{ conversation, messages, checkliste,
  ergebnis }` (Tool-Nachrichten enthalten, damit Widgets im Verlauf
  sichtbar bleiben).
- `POST /api/lernen/tutor/[id]` `{ message? , widgetAntwort?: { messageId,
  auswahl: string[], text?: string } }` → NDJSON-Stream (Events oben).
  Genau eins von beiden, sonst 400. Erster Turn: leerer Body `{}` erlaubt,
  nur solange noch keine Nachricht existiert. `maxDuration = 120`.
- `DELETE /api/lernen/tutor/[id]` → `{ ok }`.
- `POST /api/lernen/tutor/[id]/karten` → legt `ergebnis.neueKarten` über
  `createCards` im Thema an (`source: "manuell"`, `sourceRef: "tutor:<id>"`),
  setzt `karten_angelegt`, antwortet `{ cards }`. 409, wenn schon angelegt,
  400 ohne Fazit.
- `POST /api/lernen/karten/[id]/bewerten` `{ antwort }` → `{ urteil,
  feedback }`. 400 bei leerer Antwort oder `kind === "vokabel"`, 503 wenn
  Bot aus, 502 wenn das Modell kein lesbares Urteil liefert.
- Alle neuen Routen liegen hinter dem bestehenden Passwort-Gate
  (`proxy.ts`), nichts Zusätzliches nötig.

## Oberfläche

**Tutor-Seite** `app/lernen/[subjectId]/tutor/page.tsx`, Query
`thema=<topicId>` (Pflicht), `modus=lernen|probe`, `karte=<cardId>`,
`session=<conversationId>` (bestehende Session fortsetzen). Rendert
`components/lernen-tutor.tsx` (Client).

Layout, mobil zuerst (eine Spalte; ab `md` Chat links, Checkliste rechts
als Sticky-Spalte):

- Kopf: Zurück-Link zum Thema, Thema-Titel, Badge "Tutor" oder "Probe",
  Knopf "Beenden" (fragt das Modell per verstecktem Nutzertext "Bitte das
  Fazit" nach dem Fazit).
- Chat: Nachrichten als Markdown über `renderMarkdown` aus
  `lib/markdown.ts`, Codeblöcke monospace (ASCII-Skizzen). Streaming-Text
  live. Widgets als Buttongruppe unter der Assistant-Nachricht: Einfach-
  wahl = Klick sendet sofort; Mehrfach = Toggle-Chips plus "Weiter";
  "Anders..." fokussiert das Textfeld. Beantwortete Widgets bleiben
  sichtbar, gewählte Optionen markiert, Buttons deaktiviert.
- Eingabe: Textarea, Enter sendet, Shift+Enter Zeilenumbruch, Schnell-
  knöpfe "skip", "erklär du alles", "gecheckt". Während des Streams
  deaktiviert, mit "Stopp" (AbortController).
- Checkliste (sobald vorhanden): Titel, Fortschritt "3 von 7", Zeilen mit
  Nummer, Text, Status-Icon (offen ○, richtig ✅, falsch ❌, übersprungen
  ↷), Schwierigkeit als 1 bis 3 Punkte. Aktive (erste offene) Zeile
  hervorgehoben.
- Fazit-Karte am Ende: "Gut war" / "Noch schwach" als Listen; bei Probe
  groß "P von G Punkten, X %, Note N"; Knopf "N Karten zu deinen Lücken
  anlegen" (verschwindet nach Erfolg, Toast "N Karten angelegt"), Knopf
  "Nochmal üben" (startet neue Session im Modus `lernen`), Link zurück.
- Fehler: Bot aus → Hinweiskarte wie im Bot ("ZAI_API_KEY fehlt"), keine
  leere Seite. Stream-Abbruch → Nachricht "Verbindung weg, nochmal senden",
  Eingabe wieder frei.

**Themenseite** (`components/lernen-thema.tsx`): neuer Block "Tutor" unter
dem Lernzettel: Knöpfe "Tutor starten" und "Probe schreiben", darunter
Liste der letzten 5 Sessions (Datum, Modus, Fortschritt oder "Note 2,
80 %"), Klick öffnet die Session, Papierkorb löscht (mit Bestätigung).
Ohne Bot: Knöpfe deaktiviert mit Tooltip.

**Kartensession** (`components/lernen-session.tsx`):

- Bei `kind` `wissen` und `aufgabe`, solange die Antwort verborgen ist:
  Textarea "Deine Antwort" plus Knopf "Prüfen" (Cmd/Ctrl+Enter). Nach
  Antwort: Badge Richtig / Teilweise / Falsch, Feedback-Text, dann die
  Lösung wie bisher. "Gewusst" ist bei `richtig` vorbelegt (visuell
  hervorgehoben, Enter bestätigt), sonst "Nicht gewusst". Beide Knöpfe
  bleiben klickbar. Leer abschicken oder "Lösung zeigen" = Verhalten wie
  bisher, keine Bewertung. Modus `probe` der Kartensession: gleich.
- Neuer Knopf "Tutor fragen" neben "Erklären": Link auf die Tutor-Seite mit
  `thema` (Topic der Karte, sonst deaktiviert) und `karte`.
- Taste `T` = Tutor fragen.

**Übersicht** (`components/lernen-uebersicht.tsx`): keine Änderung.

## Verhalten und Grenzfälle

- Thema ohne Lernzettel und ohne Karten: Tutor startet trotzdem, Prompt
  sagt "Es gibt noch kein Material, frag Timo, worum es geht".
- Modell ruft `frage_auswahl` mit weniger als 2 oder mehr als 6 Optionen
  auf: Server kappt auf 6 bzw. antwortet dem Modell mit Fehler
  `{ error: "2 bis 6 Optionen" }` und lässt es neu versuchen (zählt als
  Runde).
- Checkliste mit weniger als 5 oder mehr als 8 Aufgaben: Fehler ans Modell,
  neuer Versuch. `aufgabe_ergebnis` mit unbekannter Nummer: Fehler ans
  Modell.
- `fazit` ohne `punkte`/`gesamt` im Modus `probe`: Server rechnet aus der
  Checkliste (richtig = Schwierigkeit als Punkte, gesamt = Summe der
  Schwierigkeiten).
- Sechs Runden ohne Widget und ohne Ende: Stream endet mit `done`, Timo
  kann normal weiterschreiben.
- Rate-Limit (429): `streamChatWithFallback` wechselt auf `glm-5.3-flash`,
  keine Sonderbehandlung. Anderer Modellfehler: Event `error`, Nachricht
  bleibt ungespeichert, Timo kann erneut senden.
- Zwei Tabs mit derselben Session: kein Locking, letzter Schreiber gewinnt.
- Session mit `endedAt` bekommt keine neuen Nachrichten (400 "Session ist
  beendet"), nur "Nochmal üben".
- Bewertung freier Antworten dauert über 30 s: Fehler-Toast, Knöpfe wie
  bisher ohne Vorbelegung.

## Akzeptanzkriterien (jedes mit Beweis abhaken)

- [ ] A1 `npx tsc --noEmit`, `npm test`, `npx next build` laufen ohne Fehler
      durch (Ausgabe anhängen).
- [ ] A2 `drizzle/0018_tutor.sql` enthält genau `tutor_modus`,
      `tutor_message_role`, `tutor_conversations`, `tutor_messages` und
      keine ALTERs an anderen Tabellen (`cat` der Datei).
- [ ] A3 `lib/tutor/note.test.ts`: `noteFuerProzent` für 100, 85, 84, 70,
      55, 40, 20, 19, 0 liefert 1,1,2,2,3,4,5,6,6.
- [ ] A4 `lib/lernen.test.ts`: `parseUrteil` liest `{"urteil":"teilweise",
      "feedback":"..."}` auch mit umgebendem Text, liefert `null` bei
      unbekanntem Urteil.
- [ ] A5 `lib/tutor/tools.test.ts`: Validierung lehnt `frage_auswahl` mit 1
      Option, `checkliste_erstellen` mit 4 und 9 Aufgaben, `aufgabe_ergebnis`
      mit falschem Status ab; akzeptiert gültige Eingaben.
- [ ] A6 `lib/tutor/session.test.ts` mit gemocktem `streamChatWithFallback`:
      (a) Turn endet nach `frage_auswahl` mit Events `widget` dann `done`;
      (b) `checkliste_erstellen` → `aufgabe_ergebnis` → Text: Checkliste hat
      Status `richtig` bei Nr. 1, Event-Reihenfolge `checkliste`,
      `checkliste`, `text`; (c) `fazit` im Modus `probe` ohne Punkte rechnet
      Punkte aus der Checkliste und setzt Note.
- [ ] A7 `lib/tutor/prompt.test.ts`: `buildTutorContext` enthält Thema-Titel,
      Lernzettel, markierte schwache Karten, kappt Lernzettel bei 6000
      Zeichen; Modus `probe` enthält den Probe-Block.
- [ ] A8 Routen-Tests: `POST /api/lernen/tutor` ohne `topicId` → 400, mit
      unbekanntem Thema → 404; `POST /api/lernen/tutor/[id]` mit `message`
      UND `widgetAntwort` → 400; `POST /api/lernen/karten/[id]/bewerten` bei
      `vokabel` → 400, leer → 400. Ohne `ZAI_API_KEY` → 503.
- [ ] A9 Live, eingeloggt, lokal mit `ZAI_API_KEY` (`npm run dev`): Thema
      mit Lernzettel öffnen, "Tutor starten": erste Nachricht ist ein
      Auswahl-Widget zum Wissensstand (Screenshot oder DOM-Auszug der
      Buttons). Klick → Modell antwortet, Erklärung streamt.
- [ ] A10 Live: nach "mach die Checkliste" erscheint die Checkliste rechts
      mit 5 bis 8 Zeilen; Antwort auf Aufgabe 1 → Zeile 1 bekommt ✅ oder ❌,
      Chat wiederholt Aufgabe 2 im Klartext (Auszug der Nachricht).
- [ ] A11 Live: "Beenden" → Fazit-Karte mit "Gut war" / "Noch schwach";
      "Karten anlegen" → Karten stehen im Thema (`GET /api/lernen/[subjectId]`
      zeigt neue Karten mit `sourceRef` `tutor:<id>`), zweiter Klick nicht
      mehr möglich.
- [ ] A12 Live: "Probe schreiben" → Kompetenz-Widget (Mehrfach), danach
      Checkliste, nach allen Aufgaben Fazit mit "P von G Punkten, X %,
      Note N"; Themenseite listet die Session mit Note.
- [ ] A13 Live, Kartensession, Karte `wissen`: eigene Antwort eintippen,
      "Prüfen" → Badge und Feedback sichtbar, "Gewusst" oder "Nicht gewusst"
      vorbelegt, Enter übernimmt die Vorbelegung, Karte wechselt, Review ist
      in `study_reviews` gespeichert (`reviews` der Karte +1).
- [ ] A14 Live: Taste `T` in der Kartensession öffnet die Tutor-Seite mit
      `karte=<id>`, erste Nutzernachricht nennt die Frage der Karte.
- [ ] A15 Live ohne `ZAI_API_KEY`: Themenseite zeigt Tutor-Knöpfe
      deaktiviert, Tutor-Seite zeigt die Hinweiskarte, Kartensession
      funktioniert wie zuvor ohne Prüfen-Feld.
- [ ] A16 Mobil (375 px breit, DevTools): Tutor-Seite einspaltig,
      Checkliste einklappbar über dem Chat, alle Knöpfe mindestens 44 px
      hoch, kein horizontales Scrollen.
- [ ] A17 `.ytstack/LERNEN-SPEC.md` bekommt einen Verweis auf TUTOR-SPEC.md,
      `STATE.md`/`KNOWLEDGE.md` aktualisiert (Tutor-Muster: Widget beendet
      die Runde, Tool-Ergebnis kommt mit dem nächsten POST).

## Verifikationsplan

```bash
npx tsc --noEmit
npm test
npx next build
cat drizzle/0018_tutor.sql
npm run dev   # dann A9 bis A16 im Browser, eingeloggt über das Passwort-Gate
```

API-Stichproben (Cookie aus dem Browser übernehmen):

```bash
curl -s -b "$COOKIE" -X POST localhost:3000/api/lernen/tutor -H 'content-type: application/json' -d '{}'            # 400
curl -s -b "$COOKIE" -X POST localhost:3000/api/lernen/tutor -H 'content-type: application/json' -d '{"topicId":"<id>"}'  # 201
curl -N -s -b "$COOKIE" -X POST localhost:3000/api/lernen/tutor/<cid> -H 'content-type: application/json' -d '{}'   # NDJSON, endet mit widget + done
```

Deploy erst nach A1 bis A17, per `/ship` (Account Thimorrow, Migration
läuft im Vercel-Build über `scripts/migrate.mjs`).

## Ausführung

Nach der globalen Arbeitsregel: Hauptsession plant und reviewt,
Implementierung über den `implementer`-Subagenten mit `model: sonnet`,
Slices in dieser Reihenfolge (jede mit eigenem Review per `git diff`):

1. Schema, Migration, Store, `note.ts`, `parseUrteil` (A2 bis A4).
2. Tools, Prompt, `runTutorTurn`, Routen (A5 bis A8).
3. Tutor-Seite und Themenseite-Block (A9 bis A12, A15, A16).
4. Kartensession: Prüfen-Feld, Tutor-Knopf, Taste T (A13, A14).
5. Doku (A17), Gates (A1), `/ship`.

## Getroffene Annahmen (nicht gefragt, aus Code und Kontext abgeleitet)

- Klassenstufe 10 (LERNEN-SPEC), obwohl der Prompt "9. Klasse" sagt.
- Ort im UI ("ich weiß nicht"): eigene Tutor-Seite unter `/lernen`, erreichbar
  von Themenseite und Kartensession. Kein Seitenpanel in der Kartensession,
  weil das mobil nicht trägt.
- "Checklisten dann die Aufgaben" bei der Probe = erst Selbsteinschätzung
  der Kompetenzen per Mehrfach-Widget, dann Aufgaben-Checkliste.
- Notenschlüssel: 85/70/55/40/20 Prozent (üblicher NRW-Schlüssel für
  Klassenarbeiten in der Sek I).
- Eigene Tabellen statt `bot_conversations`, damit der Bot unangetastet
  bleibt und Sessions am Thema hängen (Cascade beim Löschen des Themas).
- Persistenz von `thinking`-Deltas: nicht angezeigt, nicht gespeichert.
- Keine Validierungsbibliothek, `zod` ist nicht im Projekt.

## Offen (später, nicht Teil dieses Auftrags)

- Foto einer Aufgabe hochladen und vom Tutor lösen lassen (Kernfeature bei
  RocketTutor und Astra AI; `ChatContentPart` mit `image_url` ist im Modell-
  Adapter schon vorhanden).
- Bot-Tool `tutor_starten` im allgemeinen Atlas-Bot.
- Lernkurve über mehrere Proben je Thema.
