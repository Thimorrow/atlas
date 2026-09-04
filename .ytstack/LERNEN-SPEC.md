# Lernbereich v2: Lernen heisst Vorbereitung auf eine Arbeit

Stand 2026-09-04. Auftrag des Nutzers: "Lernbereich KOMPLETT verbessern, denk
nach wie ich lernen will, was ich dann brauche."

## Wie ein Schueler (10. Klasse, NRW G9) wirklich lernt

1. Ausloeser ist eine konkrete Arbeit: "Mathe am Freitag, quadratische
   Funktionen". Er lernt Themen, nicht Faecher.
2. Erst verstehen (Lernzettel: das Wichtigste auf einer Seite), dann ueben
   (Karten, Aufgaben), dann pruefen (Probe: bin ich bereit?).
3. Wenn er etwas nicht kapiert, will er es SOFORT erklaert bekommen, nicht
   in einen anderen Bereich wechseln.
4. Er will jeden Tag wissen: was mache ich heute, wie lange dauert das, und
   wann bin ich fertig. Nicht "12 Karten pro Tag" abstrakt, sondern eine
   Liste, die er abarbeiten kann.
5. Schwaechen sollen sichtbar sein und gezielt uebbar.

## Lernart je Fach (Nutzer: "In verschiedenen Faechern will ich verschiedene Sachen")

Typen `Lernart` und `CardKind` in lib/lernen-types.ts (dort kommentiert).
- `lernartFor(name): Lernart` in lib/lernen.ts, rein, getestet: Mathe/Physik/
  Chemie/Informatik -> aufgaben; Englisch/Franzoesisch/Latein/Spanisch ->
  vokabeln; Deutsch -> texte; alles andere -> wissen. Teilstring, Gross/
  Kleinschreibung egal ("Mathematik", "M", "E"? nur ganze Namen; Kuerzel
  bleiben wissen).
- `subjects.lernart` text null (Override). Wirksam = Override ?? lernartFor(name).
- `study_cards.kind` enum study_card_kind ('wissen','vokabel','aufgabe'),
  default 'wissen'.
- Standard-Kartenart je Lernart: aufgaben -> aufgabe, vokabeln -> vokabel,
  wissen/texte -> wissen. Der Generator nimmt sie, wenn `kind` nicht
  mitgegeben wird; die Quellenauswahl bietet "Was erzeugen?" (Fragen /
  Vokabeln / Aufgaben) mit dieser Vorbelegung.
- Generator-Prompts je Kartenart:
  - aufgabe: Uebungsaufgaben in der Art, wie sie in einer Klassenarbeit
    stehen (konkrete Zahlen, Text der Aufgabe in question), answer =
    Loesungsweg Schritt fuer Schritt mit Endergebnis, kurz. Bei Mathe auch
    Merkregeln als eigene Karten (kind wissen).
  - vokabel: question = Deutsch, answer = Zielsprache (bei mehreren
    Bedeutungen "Wort1, Wort2"), Grammatikregeln als kind wissen.
  - wissen: Erklaerfragen (Warum/Wie/Vergleiche/Folgen), nicht nur "Was ist".
  - texte (Deutsch): Stilmittel (Name -> Definition + Beispiel),
    Analysebausteine, Aufbau von Erörterung/Analyse; kind wissen.
- Lernzettel-Prompt je Lernart: aufgaben -> Formeln/Regeln + je eine
  Musterloesung; vokabeln -> Grammatikuebersicht mit Beispielsaetzen +
  Wortfeld-Liste; wissen -> Zusammenfassung mit Zusammenhaengen; texte ->
  Schreibleitfaden (Aufbau, Formulierungshilfen, Stilmittel).
- Sitzung je Kartenart:
  - wissen: wie bisher (zeigen, Gewusst / Nicht gewusst).
  - vokabel: Richtung wechselt je Karte (gerader Index Deutsch -> Ziel,
    ungerader Ziel -> Deutsch). Textfeld "Antwort eintippen" (16px, autofocus,
    Enter prueft). Vergleich normalisiert (trim, lowercase, Artikel
    "the/a/le/la/der/die/das" vorne weg, Akzente weg, bei "Wort1, Wort2"
    reicht eines). Stimmt es: gruen "Richtig" und automatisch als richtig
    werten (Knopf "Weiter"). Stimmt es nicht: Loesung zeigen, Knoepfe
    "War richtig" / "Falsch". Leer abschicken = nur zeigen.
  - aufgabe: Aufgabe gross, Hinweis "Rechne auf Papier", "Loesung zeigen",
    dann Loesungsweg (Markdown gerendert, Zeilenumbrueche erhalten),
    Knoepfe "Geloest" / "Nicht geloest". Zusatzknopf "Aehnliche Aufgabe"
    (POST /api/lernen/karten/[id]/variante -> Bot erzeugt eine Variante
    mit anderen Zahlen als neue Karte im selben Thema, kind aufgabe,
    Antwort { card }) -- erscheint direkt als naechste Karte in der
    Warteschlange.
- Fachseite: Zeile "Lernart: Aufgaben" mit Select (Automatisch / Aufgaben /
  Vokabeln / Wissen / Texte), PATCH /api/subjects/[id] { lernart }
  (bestehende Route erweitern, null = automatisch).

## Datenmodell (Migration 0017_lernthemen)

- Neue Tabelle `study_topics`: id uuid pk, subject_id uuid not null ->
  subjects (cascade), title text not null, summary text not null default '',
  assignment_id uuid null -> assignments (set null), position integer not
  null default 0, archived_at timestamptz null, created_at, updated_at.
  Index (subject_id).
- `study_cards.topic_id` uuid null -> study_topics (set null). Index
  (topic_id).
- `study_cards.kind` study_card_kind not null default 'wissen'.
- `subjects.lernart` text null.

## Reine Logik (lib/lernen.ts, mit Tests in lib/lernen.test.ts)

- `readiness(cards)`: 0..100 = Summe min(box, MASTERED_BOX) / (MASTERED_BOX *
  n), gerundet; leer -> 0. Archivierte ignorieren.
- `progressOf(cards, todayISO): ProgressDTO` = progress() + faellig + bereit.
- `queueFor(modus, cards, todayISO, limit, seed?)`:
  - `lernen`: wie sessionQueue (faellig zuerst, dann neue); ist sie leer und
    es gibt Karten, die schwaechsten (box asc) bis limit.
  - `schwach`: aktive Karten sortiert nach lapses desc, box asc, due asc.
  - `probe`: alle aktiven Karten, deterministisch gemischt (seed, z. B.
    mulberry32), auf limit begrenzt (Default 25).
- `heutePlan(today, themen)`: Eingabe pro Thema { subjectId, subjectName,
  color, topicId|null, titel, pruefung: PruefungRef|null, cards }.
  Ausgabe `{ items, karten, minuten }`:
  - Themen mit Pruefung (tageBis >= 0): anzahl = max(faellig, ceil(offen /
    max(tageBis, 1))), begrenzt auf aktive Karten; offen = Karten unter
    MASTERED_BOX. grund "pruefung".
  - Themen ohne Pruefung: anzahl = faellig, grund "faellig".
  - anzahl 0 -> weglassen. Sortierung: pruefung nach tageBis asc, dann
    faellig nach anzahl desc. minuten = ceil(anzahl * 0.5).
- `sessionQueue` bleibt (Rueckwaertskompatibel), delegiert an queueFor.

## Store (lib/study-store.ts)

Liefert exakt die Typen aus `lib/lernen-types.ts` (dort definiert, dort
importieren; die alten lokalen Typen `StudyCardDTO`, `SubjectOverview`,
`SubjectDetail` aus dem Store entfernen bzw. re-exportieren).

- Themen: `listTopics(subjectId)`, `getTopic(id)`, `createTopic({ subjectId,
  title, assignmentId? })`, `updateTopic(id, { title?, summary?,
  assignmentId?, archivedAt? })`, `deleteTopic(id)`.
- `createCards(subjectId, cards, source, sourceRef, topicId)`; `updateCard`
  akzeptiert `topicId` (string|null).
- `overview()` -> `OverviewResponse` (heute via heutePlan, pruefungen ueber
  alle Faecher inkl. Themen und bereit, faecher mit progress).
- `subjectDetail(id)` -> `SubjectDetail` (themen mit progress, ohneThema,
  pruefungen des Fachs, notizen-Liste fuer die Quellenauswahl).

## Generator (lib/lernen-generieren.ts)

- `GenerateInput` zusaetzlich `topicId?`, `noteIds?`. Bei topicId: Titel und
  vorhandener Lernzettel des Themas gehen als Fokus in den Prompt.
- Karten-Prompt: nicht nur Definitionen. Mathe/Physik/Chemie: auch
  Uebungsaufgaben mit Loesungsweg in der Antwort. Sprachen: Vokabeln in
  beide Richtungen, Grammatik mit Beispielsatz. Sonst Erklaerfragen
  (Warum/Wie/Vergleiche), nicht nur "Was ist".
- `generateSummary(input)`: Lernzettel als Markdown (Ueberschriften,
  Stichpunkte, Definitionen, Formeln, ein Beispiel je Abschnitt, max. ca.
  450 Woerter, nur aus dem Material). Liefert `{ summary, hinweis? }`.
- `explainCard(cardId)`: AsyncIterable<string> Text-Deltas. Prompt: erklaere
  Frage + Antwort fuer einen 10.-Klaessler in max. 120 Woertern, mit einem
  Beispiel und wenn passend einer Merkhilfe; Kontext = Lernzettel des Themas.

## API

- `GET /api/lernen` -> OverviewResponse
- `GET /api/lernen/[subjectId]` -> SubjectDetail
- `POST /api/lernen/themen` { subjectId, title, assignmentId? } -> 201 { thema }
- `PATCH /api/lernen/themen/[id]` { title?, summary?, assignmentId?, archivedAt? } -> { thema }
- `DELETE /api/lernen/themen/[id]` -> { ok } (Karten behalten, topicId null)
- `POST /api/lernen/themen/[id]/lernzettel` { quelle, fileIds?, noteIds? } ->
  erzeugt und speichert summary, antwortet { thema, hinweis? }. maxDuration 120.
- `POST /api/lernen/generieren` zusaetzlich topicId?, noteIds?
- `POST /api/lernen/karten` zusaetzlich topicId?; `PATCH .../karten/[id]` zusaetzlich topicId
- `POST /api/lernen/karten/[id]/erklaeren` -> text/plain Stream (Content-Type
  text/plain; charset=utf-8), 503 wenn Bot aus. maxDuration 60.
- `POST /api/lernen/karten/[id]/antwort` unveraendert.
- `POST /api/lernen/karten/[id]/variante` -> { card } (nur kind aufgabe, sonst 400).
- `PATCH /api/subjects/[id]` zusaetzlich { lernart: Lernart | null }.

## Oberflaeche

Routen: `/lernen`, `/lernen/[subjectId]`, `/lernen/[subjectId]/themen/[topicId]`
(topicId "allgemein" = Karten ohne Thema), `/lernen/[subjectId]/session`
mit Query `modus=lernen|schwach|probe`, `thema=<id|allgemein>`, `pruefung=<id>`.

### /lernen (components/lernen-uebersicht.tsx)
- Kopf: "Lernen" + eine Zeile "Heute N Karten, etwa M Minuten · X gelernt"
  bzw. "Heute nichts faellig".
- Block **Heute**: Liste der HeuteItems. Zeile: Fachpunkt, Titel, Grund
  ("Arbeit in 3 Tagen" / "faellig"), Anzahl, Knopf "Los" -> Session mit
  thema. Erster Eintrag ist der Hauptknopf (default), Rest outline.
- Block **Pruefungen**: je Pruefung eine Karte mit Fach, Titel, "in N
  Tagen", Bereit-Balken in Fachfarbe mit Prozent, Themen als Chips (Titel +
  Prozent). Knoepfe "Lernen" (session?pruefung=) und "Probe"
  (session?pruefung=&modus=probe). Ohne Themen: "Themen festlegen" ->
  /lernen/[subjectId].
- Block **Faecher**: wie bisher, rechts "N faellig · P % bereit".

### /lernen/[subjectId] (components/lernen-fach.tsx, neu schreiben)
- Kopf mit Zurueck, Name, Pruefungszeile.
- Knoepfe: "Lernen" (faellig des Fachs) und "Schwache ueben" (modus=schwach),
  nur wenn Karten da sind.
- Block **Themen**: Zeile je Thema: Titel, Pruefungs-Badge ("Arbeit Fr."),
  Mini-Balken bereit %, "N faellig", Chevron -> Themenseite. Darunter
  "Allgemein (N Karten)" wenn Karten ohne Thema existieren. "Neues Thema":
  Inline-Formular mit Titel und optionalem Pruefungs-Select
  (data.pruefungen). Enter legt an und springt auf die Themenseite.
- Kein Karten-Grid mehr auf der Fachseite; das lebt auf der Themenseite.

### /lernen/[subjectId]/themen/[topicId] (components/lernen-thema.tsx)
- Kopf: Zurueck zum Fach, Titel (klick -> inline umbenennen), Pruefungs-
  Select, Fortschritt (bereit %, faellig).
- Knoepfe: "Lernen" (thema=), "Probe" (thema=&modus=probe).
- Block **Lernzettel**: gerendertes Markdown (lib/markdown renderMarkdown,
  Muster aus den Fach-Notizen uebernehmen). Leer: Einladung "Lernzettel aus
  Notizen/Dateien erzeugen" mit Quellenauswahl (notizen/dateien/lehrplan/
  alles + Dateien- und Notizen-Checkboxen). Vorhanden: "Bearbeiten"
  (Textarea, speichern per PATCH) und "Neu erzeugen".
- Block **Karten**: "Karten erzeugen" (bestehende KartenErzeugen-Logik mit
  topicId, Quellenauswahl wie oben, Anzahl) und "Karte schreiben"; Liste
  mit Bearbeiten/Loeschen/Verschieben (Thema-Select).
- "allgemein": kein Lernzettel-Block, kein Umbenennen, Titel "Allgemein".

### Session (components/lernen-session.tsx)
- Warteschlange aus queueFor(modus). Bei pruefung= alle Karten der Themen
  dieser Pruefung; bei thema= nur dessen Karten (allgemein = topicId null).
- Kopf: Zurueck (zum Thema bzw. Fach), Modus-Label ("Probe" / "Schwache" /
  Themen-Titel), Zaehler, Fortschrittsbalken.
- Karte: Frage, "Antwort zeigen", dann Antwort + zwei Knoepfe. Darunter
  klein: "Erklaeren" (streamt POST erklaeren in einen Absatz unter der
  Antwort, waehrenddessen Spinner-Text "Erklaert..."), "Bearbeiten"
  (inline Frage/Antwort, PATCH), "Archivieren" (PATCH archivedAt, Karte
  faellt aus der Warteschlange).
- Tastatur: Leertaste/Enter zeigen, 1 falsch, 2 richtig, e erklaeren.
- Ende: "N von M gewusst", bei Probe zusaetzlich "Bereit: P %" (P = richtig/
  gesamt), Liste der falschen Fragen (max 8) unter "Nochmal anschauen",
  Knoepfe "Falsche nochmal" / "Fertig".
- Mobil: Knoepfe mindestens 44 px hoch, Frage text-lg.

## Bot (lib/bot/tools.ts), nachgelagert
- `lernstand_lesen` liefert zusaetzlich Themen und Pruefungs-Bereitschaft.
- `lernkarten_erzeugen` akzeptiert `thema` (Titel, wird per Name zugeordnet
  oder angelegt).

## Gates
`npx tsc --noEmit`, `npm test`, `npx next build`. Kein Lint.
