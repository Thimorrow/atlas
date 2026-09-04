// Systemprompt des Tutors: Timos Nachhilfe-Prompt (siehe TUTOR-SPEC.md
// "Didaktik") wortgetreu als Konstante, dazu Formatregeln/Tool-Regeln aus der
// App und der Kontextblock, den der Server pro Turn frisch baut (Fach,
// Lernart, Thema, Lernzettel, Karten, Pruefung). Rein, ohne DB-Zugriff -- der
// Aufrufer (lib/tutor/session.ts) liefert schon geladene Daten.

import type { CardKind } from "@/lib/lernen-types";

// Wortlaut aus TUTOR-SPEC.md "Didaktik: Systemprompt des Tutors", angepasst
// an Klasse 10 (LERNEN-SPEC-Annahme) statt der im Prompt genannten 9. Klasse.
// Fach und Thema kommen aus dem Kontextblock, nicht per Frage; Widgets sind
// die Tools in lib/tutor/tools.ts.
export const TUTOR_PROMPT = `Über den Schüler: Timo, 10. Klasse, Deutsch. Schlau, direkt, mag keine Umwege, sag einfach was Sache ist. Mag es, wenn Erklärungen schrittweise aufgebaut werden. Sagt ehrlich, wenn er was nicht checkt. Spricht manchmal undeutlich, versteh den Kontext trotzdem. Keine langen Textwände, kurz und knackig.

Grundprinzipien: Immer zuerst fragen, was er schon weiß, nie blind erklären. Ein Konzept auf einmal: erklären, Frage stellen, dann weiter. Sofort korrigieren, aber freundlich, kein falsches Lob. Bei Fehlern erst Hint geben, nicht direkt die Lösung. Wenn er sagt "erklär du alles": Schritt für Schritt mit Zwischenfragen. "gecheckt?" am Ende einer Erklärung fragen.

Checklisten: immer von leicht zu schwer, 5 bis 8 Aufgaben. Wenn er eine Aufgabe beantwortet: kurz bestätigen oder korrigieren, dann sofort die nächste Aufgabe nochmal hinschreiben, nie einfach weitergehen ohne die nächste Aufgabe nochmal hinzuschreiben. Beispiel: Antwort auf Aufgabe 3, dann ✅/❌ plus kurzes Feedback, dann Aufgabe 4 nochmal hinschreiben. Bei "skip" oder "kann ich nicht": kurzen Hint geben, dann weiter.

Erklärungen: erst das einfachste Beispiel, dann schrittweise komplexer. Vergleiche, die er kennt (Werkzeuge, Bauanleitung, Staffellauf). ASCII-Visualisierungen, wenn möglich: Pfeile, Diagramme, Symbole helfen extrem. Nach jeder Erklärung eine konkrete Testfrage. Wenn er etwas nicht checkt: nochmal anders erklären, nicht dasselbe wiederholen.

Widgets immer benutzen für: zu Beginn (was weiß er schon, was ist schwer), wenn er zwischen Optionen wählen soll, wenn du wissen willst, ob er es gecheckt hat oder nochmal erklärt haben will. Niemals blind anfangen, ohne erst den Wissensstand abzufragen.

Ablauf einer guten Session: 1. Widget: was weiß er schon, was ist schwer. 2. Schwächstes Thema zuerst, schrittweise erklären. 3. Checkliste erstellen, leicht bis schwer. 4. Bei jeder Antwort bestätigen/korrigieren und nächste Aufgabe sofort wiederholen. 5. Am Ende kurzes Fazit, was gut war.

Formatregeln: Markdown, ASCII-Skizzen in Codeblöcken, Antworten unter ca. 120 Wörtern außer bei "erklär du alles".

Tool-Regeln: Auswahlfragen NUR über das Tool frage_auswahl, nie als Fließtext. Nach jeder bewerteten Aufgabe ZUERST aufgabe_ergebnis, dann Feedback plus nächste Aufgabe im Text. Am Ende IMMER fazit. Nie zwei Widgets direkt hintereinander: nach der Antwort auf das Wissensstand-Widget sofort mit der Erklärung des schwächsten Punkts anfangen, nicht erst noch einmal fragen.`;

// Modus "probe": ergaenzt TUTOR_PROMPT, wenn die Session eine Probe ist
// (siehe TUTOR-SPEC.md "Didaktik", Absatz "Modus probe").
export const PROBE_PROMPT_BLOCK = `

Diese Session ist eine Probe. Kein Erklären vorab. Schritt 1: Widget mit 5 bis 8 Kompetenzen des Themas, Mehrfachauswahl "Kann ich sicher". Schritt 2: Checkliste mit 5 bis 8 Aufgaben wie in einer Klassenarbeit, leicht bis schwer, ohne Hints, bei "skip" gilt die Aufgabe als falsch. Schritt 3: Fazit mit Punkten je Aufgabe (Schwierigkeit 1 bis 3 = maximale Punkte) und Gesamtpunkten.`;

const MAX_SUMMARY_CHARS = 6000;
const MAX_CARDS = 40;
// Ab dieser Box gilt eine Karte im Kontext noch als schwach (siehe
// TUTOR-SPEC.md "Kontextblock": "Box 0 oder 1").
const SCHWACH_BOX = 1;

export type TutorContextCard = { question: string; answer: string; box: number; kind: CardKind };

export type TutorContextInput = {
  subjectName: string;
  lernart: string;
  topicTitle: string;
  summary: string | null;
  cards: TutorContextCard[];
  pruefung: { title: string; tageBis: number } | null;
  card: { question: string; answer: string } | null;
};

// Baut den Kontextblock fuer den Systemprompt, rein ohne DB: Lernzettel bei
// 6000 Zeichen gekappt, hoechstens 40 Karten, schwache Karten (Box <= 1)
// zuerst und markiert. Ohne Lernzettel und ohne Karten kommt der Hinweis,
// dass es noch kein Material gibt.
export function buildTutorContext(input: TutorContextInput): string {
  const parts: string[] = [];

  parts.push(`Fach: ${input.subjectName}`);
  parts.push(`Lernart: ${input.lernart}`);
  parts.push(`Thema: ${input.topicTitle}`);

  const summary = (input.summary ?? "").trim();
  const hasSummary = summary.length > 0;
  if (hasSummary) {
    const gekuerzt = summary.length > MAX_SUMMARY_CHARS ? `${summary.slice(0, MAX_SUMMARY_CHARS)}… [gekürzt]` : summary;
    parts.push(`Lernzettel:\n${gekuerzt}`);
  }

  const sortedCards = [...input.cards].sort((a, b) => {
    const aSchwach = a.box <= SCHWACH_BOX ? 0 : 1;
    const bSchwach = b.box <= SCHWACH_BOX ? 0 : 1;
    return aSchwach - bSchwach;
  });
  const cappedCards = sortedCards.slice(0, MAX_CARDS);

  if (cappedCards.length > 0) {
    const zeilen = cappedCards.map((c) => {
      const markierung = c.box <= SCHWACH_BOX ? " (schwach)" : "";
      return `- ${c.question} / ${c.answer}${markierung}`;
    });
    parts.push(`Karten:\n${zeilen.join("\n")}`);
  }

  if (!hasSummary && cappedCards.length === 0) {
    parts.push("Es gibt noch kein Material, frag Timo, worum es geht.");
  }

  if (input.pruefung) {
    parts.push(`Nächste Prüfung: ${input.pruefung.title}, in ${input.pruefung.tageBis} Tagen.`);
  }

  if (input.card) {
    parts.push(`Aktuelle Frage (Timo haengt hier fest):\n${input.card.question} / ${input.card.answer}`);
  }

  return parts.join("\n\n");
}

// system = TUTOR_PROMPT + (probe ? PROBE_PROMPT_BLOCK : "") + Kontextblock.
export function buildSystemPrompt(modus: "lernen" | "probe", context: TutorContextInput): string {
  const probeBlock = modus === "probe" ? PROBE_PROMPT_BLOCK : "";
  return `${TUTOR_PROMPT}${probeBlock}\n\n---\n\n${buildTutorContext(context)}`;
}
