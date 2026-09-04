# Tutor: Übergabe aus der Session "LLM integration zum lernen"

Stand 2026-09-04, 19:50 Uhr. Geschrieben von der Session schule-4a nach dem
Lesen des kompletten Verlaufs (Session-ID 19057bc6-b4af-4298-b98a-ce82989c76e4,
Transkript in `.ytstack/TUTOR-SESSION-TRANSKRIPT.md`). Die Session hing seit
11:14 Uhr am Schulproxy (Connection refused) und ist beendet.

## Worum es geht

Sid will beim Lernen einen echten Nachhilfelehrer im Lernbereich: einen
Tutor-Chat pro Thema, der genau nach seinem persönlichen Nachhilfe-Prompt
arbeitet (Wissensstand abfragen, ein Konzept nach dem anderen, Checkliste
5 bis 8 Aufgaben leicht bis schwer, jede Antwort bewerten und die nächste
Aufgabe sofort wiederholen, Fazit am Ende). Dazu: Probe-Simulation mit
Punkten, Prozent und Note, Schwächen-Coach (Fazit schlägt Karten vor),
Bewertung freier Antworten in der Kartensession.

Vorbild laut Interview: RocketTutor / Astra AI (aufgabenzentriert, Hinweis
gegen Lösung, zeilenweise Korrektur). Kein neues Paket, Z.ai GLM über die
bestehende Anbindung `lib/bot/model.ts`. Nur Web, kein Android.

## Der Prompt, mit dem Sid lernt (Kern der Didaktik)

Über den Schüler: Timo, 9. Klasse (in der Spec als 10. Klasse angenommen),
Deutsch. Schlau, direkt, mag keine Umwege. Mag schrittweise aufgebaute
Erklärungen. Sagt ehrlich, wenn er etwas nicht checkt. Spricht manchmal
undeutlich per Spracheingabe. Mag keine Textwände.

Grundprinzipien: immer zuerst fragen, was er schon weiß. Ein Konzept auf
einmal: erklären, Frage stellen, dann weiter. Sofort korrigieren, aber
freundlich, kein falsches Lob. Bei Fehlern erst Hint, nicht die Lösung. Bei
"erklär du alles" Schritt für Schritt mit Zwischenfragen. "gecheckt?" am Ende
jeder Erklärung.

Checklisten: leicht zu schwer, 5 bis 8 Aufgaben. Nach jeder Antwort kurz
bestätigen oder korrigieren, dann die nächste Aufgabe sofort nochmal
hinschreiben. Bei "skip" oder "kann ich nicht" kurzer Hint, dann weiter.

Erklärungen: erst das einfachste Beispiel, dann komplexer. Vergleiche aus
seinem Alltag (Werkzeuge, Bauanleitung, Staffellauf). ASCII-Visualisierungen
mit Pfeilen und Diagrammen. Nach jeder Erklärung eine Testfrage. Wenn er es
nicht versteht: anders erklären, nicht wiederholen.

Widgets immer für: Wissensstand zu Beginn, Wahl zwischen zwei Optionen,
"gecheckt oder nochmal?". Nie blind anfangen.

Ablauf einer Session: Widget Wissensstand, schwächstes Thema zuerst,
Checkliste, bewerten und wiederholen, kurzes Fazit.

Der vollständige Prompt steht in `lib/tutor/prompt.ts` (TUTOR_PROMPT) und
in der Spec unter "Didaktik".

## Wo alles liegt

- Spec: `.ytstack/TUTOR-SPEC.md` (406 Zeilen, 17 Akzeptanzkriterien A1 bis
  A17, Verifikationsplan, Slice-Reihenfolge). Maßgeblich.
- Branch: `feature/tutor`, basiert auf main 47c9f5b (Lernbereich v2).
- Commit d6823e5 "Tutor Slice 1": Schema (Enums tutor_modus,
  tutor_message_role, Tabellen tutor_conversations, tutor_messages),
  Migration `drizzle/0018_tutor.sql`, `lib/tutor/types.ts`,
  `lib/tutor/store.ts` (+ DB-Test), `lib/tutor/note.ts` (noteFuerProzent),
  `parseUrteil` in `lib/lernen.ts`. Reviewt und grün.
- Commit "Tutor Slice 2 WIP" (diese Übergabe): `lib/tutor/tools.ts`
  (tutorTools, parseFrageAuswahl, parseCheckliste, parseAufgabeErgebnis,
  parseFazit), `lib/tutor/prompt.ts` (TUTOR_PROMPT, PROBE_PROMPT_BLOCK,
  buildTutorContext, buildSystemPrompt), `lib/tutor/session.ts`
  (runTutorTurn als AsyncGenerator, submitWidgetAntwort, defaultDeps zum
  Mocken), jeweils mit Tests. `npx tsc --noEmit` fehlerfrei,
  `npx vitest run lib/tutor lib/lernen.test.ts` 88 grün, 6 DB-Tests ohne
  DATABASE_URL übersprungen.

## Was fehlt (Slice 2 ist halb, 3 bis 5 nicht begonnen)

Der Slice-2-Agent ist beim Proxy-Ausfall gestorben. Offen aus Slice 2:

1. `bewerteAntwort(cardId, antwort)` in `lib/lernen-generieren.ts`: nur der
   Import von parseUrteil und `BEWERTEN_TIMEOUT_MS = 30_000` stehen schon
   da, die Funktion selbst fehlt. Spec-Abschnitt "Bewertung freier
   Antworten".
2. Routen, alle noch nicht angelegt (Spec-Abschnitt "API"):
   `app/api/lernen/tutor/route.ts` (POST anlegen, GET Liste),
   `app/api/lernen/tutor/[id]/route.ts` (GET, POST NDJSON-Stream über
   runTutorTurn / submitWidgetAntwort, DELETE),
   `app/api/lernen/tutor/[id]/karten/route.ts`,
   `app/api/lernen/karten/[id]/bewerten/route.ts`.
3. Routen-Tests (A8).

Danach nach Spec:
- Slice 3: Tutor-Seite `/lernen/[subjectId]/themen/[topicId]/tutor` und
  Block auf der Themenseite (`components/lernen-thema.tsx`), A9 bis A12,
  A15, A16.
- Slice 4: Kartensession (`components/lernen-session.tsx`): Prüfen-Feld
  mit Bot-Urteil, Tutor-Knopf, Taste T. A13, A14.
- Slice 5: Verweis in `.ytstack/LERNEN-SPEC.md` (A17), Gates (A1), /ship.

## Nicht anfassen

- `components/lesson-participation.tsx` liegt im Arbeitsverzeichnis als
  vorgemerkte Löschung plus neue Datei. Das ist Arbeit einer anderen Session
  (Meldungszähler-Umbau, zeitgleich mit Commit 69d0264 auf main), nicht Teil
  des Tutors.
- main hat seit dem Branch-Abzweig den Commit 69d0264 (Bot: Lagebild im
  System-Prompt). Vor dem PR `git rebase main` oder mergen.

## So geht es weiter

In einem Terminal OHNE Schulproxy (`noproxy`, dann prüfen mit
`env | grep -i proxy`, muss leer sein):

```
cd ~/Desktop/schule
git checkout feature/tutor
claude
```

Erster Prompt:

```
Lies .ytstack/TUTOR-HANDOFF.md und .ytstack/TUTOR-SPEC.md. Setze Slice 2
fertig (bewerteAntwort, Routen, Routen-Tests), dann Slice 3 bis 5. Hake am
Ende jedes Akzeptanzkriterium mit Beweis ab.
```

Gates: `npx tsc --noEmit`, `npm test`, `npx next build`. Kein Lint.
Migration 0018 läuft im Vercel-Build über scripts/migrate.mjs.
