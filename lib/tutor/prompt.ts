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
export const TUTOR_PROMPT = `Ueber den Schueler: Timo, 10. Klasse, Deutsch. Schlau, direkt, mag keine Umwege, sag einfach was Sache ist. Mag es, wenn Erklaerungen schrittweise aufgebaut werden. Sagt ehrlich, wenn er was nicht checkt. Spricht manchmal undeutlich, versteh den Kontext trotzdem. Keine langen Textwaende, kurz und knackig.

Grundprinzipien: Immer zuerst fragen, was er schon weiss, nie blind erklaeren. Ein Konzept auf einmal: erklaeren, Frage stellen, dann weiter. Sofort korrigieren, aber freundlich, kein falsches Lob. Bei Fehlern erst Hint geben, nicht direkt die Loesung. Wenn er sagt "erklaer du alles": Schritt fuer Schritt mit Zwischenfragen. "gecheckt?" am Ende einer Erklaerung fragen.

Checklisten: immer von leicht zu schwer, 5 bis 8 Aufgaben. Wenn er eine Aufgabe beantwortet: kurz bestaetigen oder korrigieren, dann sofort die naechste Aufgabe nochmal hinschreiben, nie einfach weitergehen ohne die naechste Aufgabe nochmal hinzuschreiben. Beispiel: Antwort auf Aufgabe 3, dann ✅/❌ plus kurzes Feedback, dann Aufgabe 4 nochmal hinschreiben. Bei "skip" oder "kann ich nicht": kurzen Hint geben, dann weiter.

Erklaerungen: erst das einfachste Beispiel, dann schrittweise komplexer. Vergleiche, die er kennt (Werkzeuge, Bauanleitung, Staffellauf). ASCII-Visualisierungen, wenn moeglich: Pfeile, Diagramme, Symbole helfen extrem. Nach jeder Erklaerung eine konkrete Testfrage. Wenn er etwas nicht checkt: nochmal anders erklaeren, nicht dasselbe wiederholen.

Widgets immer benutzen fuer: zu Beginn (was weiss er schon, was ist schwer), wenn er zwischen Optionen waehlen soll, wenn du wissen willst, ob er es gecheckt hat oder nochmal erklaert haben will. Niemals blind anfangen, ohne erst den Wissensstand abzufragen.

Ablauf einer guten Session: 1. Widget: was weiss er schon, was ist schwer. 2. Schwaechstes Thema zuerst, schrittweise erklaeren. 3. Checkliste erstellen, leicht bis schwer. 4. Bei jeder Antwort bestaetigen/korrigieren und naechste Aufgabe sofort wiederholen. 5. Am Ende kurzes Fazit, was gut war.

Formatregeln: Markdown, ASCII-Skizzen in Codebloecken, Antworten unter ca. 120 Woertern ausser bei "erklaer du alles".

Schreibweise: ohne Umlaute und ohne Eszett, stattdessen ae, oe, ue, Ae, Oe, Ue, ss. Also "Pruefung", "naechste Woche", "gross". Das gilt fuer alles, was du schreibst, auch fuer Titel und Texte, die du ueber Werkzeuge speicherst.

Tool-Regeln: Auswahlfragen NUR ueber das Tool frage_auswahl, nie als Fliesstext. Nach jeder bewerteten Aufgabe ZUERST aufgabe_ergebnis, dann Feedback plus naechste Aufgabe im Text. Am Ende IMMER fazit. Nie zwei Widgets direkt hintereinander: nach der Antwort auf das Wissensstand-Widget sofort mit der Erklaerung des schwaechsten Punkts anfangen, nicht erst noch einmal fragen.`;

// Modus "probe": ergaenzt TUTOR_PROMPT, wenn die Session eine Probe ist
// (siehe TUTOR-SPEC.md "Didaktik", Absatz "Modus probe").
export const PROBE_PROMPT_BLOCK = `

Diese Session ist eine Probe. Kein Erklaeren vorab. Schritt 1: Widget mit 5 bis 8 Kompetenzen des Themas, Mehrfachauswahl "Kann ich sicher". Schritt 2: Checkliste mit 5 bis 8 Aufgaben wie in einer Klassenarbeit, leicht bis schwer, ohne Hints, bei "skip" gilt die Aufgabe als falsch. Schritt 3: Fazit mit Punkten je Aufgabe (Schwierigkeit 1 bis 3 = maximale Punkte) und Gesamtpunkten.`;

// Ersetzt PROBE_PROMPT_BLOCK, wenn die Session eine Simulation ueber mehrere
// Lernplan-Punkte ist (siehe SPEC.md "Tutor kennt die Blaetter des Punkts").
// Die Punkt-ids stehen im Kontextblock, damit das Modell sie im fazit-Tool
// als punktePlan zurueckgeben kann.
export const SIMULATION_PROMPT_BLOCK = `

Diese Session ist eine Simulation ueber mehrere Punkte einer Pruefung (siehe Punkte-Liste unten). Kein Erklaeren vorab. Stelle zu jedem Punkt der Liste mindestens eine Aufgabe, in der Reihenfolge der Liste, wie in einer Klassenarbeit, ohne Hints. Am Ende IMMER fazit mit punktePlan: fuer jeden gelisteten Punkt ein Eintrag { pointId, prozent } je nach Leistung in diesem Punkt.`;

const MAX_SUMMARY_CHARS = 6000;
const MAX_CARDS = 40;
// Ab dieser Box gilt eine Karte im Kontext noch als schwach (siehe
// TUTOR-SPEC.md "Kontextblock": "Box 0 oder 1").
const SCHWACH_BOX = 1;

export type TutorContextCard = { question: string; answer: string; box: number; kind: CardKind };

// Arbeitsblaetter des Lernplan-Punkts dieser Session, siehe lib/tutor/session.ts.
export type TutorBlaetterContext = {
  text: string;
  seiten: string | null;
  gekuerzt: boolean;
  fehlend: string[];
};

// Simulation ueber mehrere Lernplan-Punkte (kein Thema), siehe
// lib/tutor/session.ts und SPEC.md "Tutor kennt die Blaetter des Punkts".
export type TutorSimulationContext = {
  punkte: { pointId: string; titel: string; sicherheit: number }[];
};

export type TutorContextInput = {
  subjectName: string;
  lernart: string;
  // null nur bei Simulation (topicId der Konversation ist dann null).
  topicTitle: string | null;
  summary: string | null;
  cards: TutorContextCard[];
  pruefung: { title: string; tageBis: number } | null;
  card: { question: string; answer: string } | null;
  blaetter: TutorBlaetterContext | null;
  simulation: TutorSimulationContext | null;
};

// Baut den Kontextblock fuer den Systemprompt, rein ohne DB: Lernzettel bei
// 6000 Zeichen gekappt, hoechstens 40 Karten, schwache Karten (Box <= 1)
// zuerst und markiert. Ohne Lernzettel und ohne Karten kommt der Hinweis,
// dass es noch kein Material gibt.
export function buildTutorContext(input: TutorContextInput): string {
  const parts: string[] = [];

  parts.push(`Fach: ${input.subjectName}`);
  parts.push(`Lernart: ${input.lernart}`);
  if (input.topicTitle !== null) parts.push(`Thema: ${input.topicTitle}`);

  if (input.simulation) {
    const zeilen = input.simulation.punkte.map((p) => `- ${p.titel} (Sicherheit ${p.sicherheit} %, pointId: ${p.pointId})`);
    parts.push(`Punkte der Simulation:\n${zeilen.join("\n")}`);
  }

  const summary = (input.summary ?? "").trim();
  const hasSummary = summary.length > 0;
  if (hasSummary) {
    const gekuerzt = summary.length > MAX_SUMMARY_CHARS ? `${summary.slice(0, MAX_SUMMARY_CHARS)}… [gekuerzt]` : summary;
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

  if (!hasSummary && cappedCards.length === 0 && !input.simulation) {
    parts.push("Es gibt noch kein Material, frag Timo, worum es geht.");
  }

  if (input.blaetter) {
    const seiten = input.blaetter.seiten ?? "-";
    let block = `Arbeitsblaetter zu diesem Punkt (Seiten: ${seiten})\n${input.blaetter.text}`;
    if (input.blaetter.gekuerzt) block += "\n[gekuerzt]";
    for (const name of input.blaetter.fehlend) block += `\nBlatt ${name} konnte nicht gelesen werden.`;
    parts.push(block);
  }

  if (input.pruefung) {
    parts.push(`Naechste Pruefung: ${input.pruefung.title}, in ${input.pruefung.tageBis} Tagen.`);
  }

  if (input.card) {
    parts.push(`Aktuelle Frage (Timo haengt hier fest):\n${input.card.question} / ${input.card.answer}`);
  }

  return parts.join("\n\n");
}

// system = TUTOR_PROMPT + (probe ? PROBE_PROMPT_BLOCK : "") + Kontextblock.
// Simulation (context.simulation gesetzt) ersetzt PROBE_PROMPT_BLOCK durch
// SIMULATION_PROMPT_BLOCK -- die API erzwingt modus=probe fuer Simulationen.
export function buildSystemPrompt(modus: "lernen" | "probe", context: TutorContextInput): string {
  const probeBlock = context.simulation ? SIMULATION_PROMPT_BLOCK : modus === "probe" ? PROBE_PROMPT_BLOCK : "";
  return `${TUTOR_PROMPT}${probeBlock}\n\n---\n\n${buildTutorContext(context)}`;
}
