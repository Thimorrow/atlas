// Karten, Lernzettel, Erklaerungen und Aufgabenvarianten per Bot erzeugen:
// Kontext aus Notizen/Dateien/Lehrplan/Thema sammeln, das Modell einmal (bzw.
// streamend) fragen, Antwort mit parseGeneratedCards/-Variant lesen. Speichert
// selbst nichts -- das macht die Route ueber createCards()/updateTopic().

import { getSubject, listNotes } from "@/lib/subject-store";
import { listSubjectLessonNotes } from "@/lib/lesson-notes";
import { listFiles } from "@/lib/subject-file-store";
import { readSubjectFile } from "@/lib/bot/files";
import { botEnabled, streamChatWithFallback, type ChatMessage } from "@/lib/bot/model";
import { defaultKindFor, lernartFor, parseGeneratedCards, parseGeneratedVariant } from "@/lib/lernen";
import { getCard, getTopic } from "@/lib/study-store";
import type { CardKind, Lernart } from "@/lib/lernen-types";

export type GenerateInput = {
  subjectId: string;
  quelle: "notizen" | "dateien" | "lehrplan" | "alles";
  fileIds?: string[];
  noteIds?: string[];
  anzahl?: number;
  thema?: string;
  topicId?: string | null;
  kind?: CardKind;
};

export type GenerateResult = {
  cards: { question: string; answer: string; kind: CardKind }[];
  quelleText: string;
  hinweis?: string;
};

export type SummaryResult = { summary: string; hinweis?: string };

const MAX_CONTEXT_CHARS = 30_000;
const MAX_FILES_WITHOUT_IDS = 5;
const DEFAULT_ANZAHL = 12;
const MAX_ANZAHL = 30;
const TIMEOUT_MS = 90_000;
const SUMMARY_TIMEOUT_MS = 90_000;
const EXPLAIN_TIMEOUT_MS = 60_000;

// Kontext fuer eine der vier Quellen einsammeln. Notizen zuerst, weil sie beim
// Kuerzen auf MAX_CONTEXT_CHARS Vorrang haben. Mit noteIds werden nur diese
// Fach-Notizen eingesammelt (Stundennotizen bleiben aussen vor -- die Auswahl
// zeigt nur Fach-Notizen).
async function collectNotesText(
  subject: { id: string; name: string; untisSubject: string | null },
  noteIds?: string[],
): Promise<string> {
  const parts: string[] = [];

  if (noteIds && noteIds.length > 0) {
    const notes = await listNotes(subject.id);
    const wanted = new Set(noteIds);
    for (const n of notes) if (wanted.has(n.id)) parts.push(`## ${n.title}\n${n.body}`);
    return parts.filter((p) => p.trim().length > 0).join("\n\n");
  }

  const [notes, lessonNotes] = await Promise.all([
    listNotes(subject.id),
    listSubjectLessonNotes({ id: subject.id, untisSubject: subject.untisSubject, name: subject.name }),
  ]);
  for (const n of notes) parts.push(`## ${n.title}\n${n.body}`);
  for (const n of lessonNotes) parts.push(`## Stunde vom ${n.date}\n${n.body}`);
  return parts.filter((p) => p.trim().length > 0).join("\n\n");
}

async function collectFilesText(subjectId: string, fileIds: string[] | undefined): Promise<string> {
  let ids = fileIds;
  if (!ids || ids.length === 0) {
    const files = await listFiles(subjectId);
    ids = files.slice(0, MAX_FILES_WITHOUT_IDS).map((f) => f.id);
  }

  const parts: string[] = [];
  for (const id of ids) {
    const result = await readSubjectFile(id);
    if (!result) continue;
    if (result.content.kind !== "text") continue; // Bilder ueberspringen.
    parts.push(`## ${result.file.name}\n${result.content.text}`);
  }
  return parts.join("\n\n");
}

async function collectContext(
  input: GenerateInput,
  subject: { id: string; name: string; untisSubject: string | null; curriculum: string | null },
) {
  const pieces: string[] = [];

  if (input.quelle === "notizen" || input.quelle === "alles") {
    const text = await collectNotesText(subject, input.noteIds);
    if (text) pieces.push(text);
  }
  if (input.quelle === "dateien" || input.quelle === "alles") {
    const text = await collectFilesText(subject.id, input.quelle === "dateien" ? input.fileIds : undefined);
    if (text) pieces.push(text);
  }
  if (input.quelle === "lehrplan" || input.quelle === "alles") {
    if (subject.curriculum) pieces.push(`## Lehrplan\n${subject.curriculum}`);
  }

  const full = pieces.join("\n\n");
  return full.length > MAX_CONTEXT_CHARS ? full.slice(0, MAX_CONTEXT_CHARS) : full;
}

// Regeln je Kartenart, siehe .ytstack/LERNEN-SPEC.md ("Generator-Prompts je
// Kartenart"). Mathe/Physik/Chemie/Informatik erzeugen zusaetzlich
// Merkregeln als eigene Karten mit kind "wissen" -- das steht mit im Prompt,
// parseGeneratedCards liest dafuer das optionale Feld "art".
function kindRegel(lernart: Lernart, kind: CardKind): string {
  if (kind === "aufgabe") {
    return (
      `Erzeuge Uebungsaufgaben, wie sie in einer Klassenarbeit stehen wuerden: ` +
      `konkrete Zahlen/Werte, der Aufgabentext steht in "frage". "antwort" ist der ` +
      `Loesungsweg Schritt fuer Schritt mit dem Endergebnis, kurz gehalten. ` +
      `Baue zusaetzlich ein paar Merkregeln/Formeln als eigene Karten ein -- gib diesen ` +
      `Karten zusaetzlich "art":"wissen".`
    );
  }
  if (kind === "vokabel") {
    return (
      `Erzeuge Vokabelkarten: "frage" ist das deutsche Wort, "antwort" das Wort in der ` +
      `Zielsprache. Hat ein Wort mehrere Bedeutungen, trenne sie in "antwort" mit Komma ` +
      `("Wort1, Wort2"). Baue zusaetzlich ein paar Grammatikregeln mit Beispielsatz als ` +
      `eigene Karten ein -- gib diesen Karten zusaetzlich "art":"wissen".`
    );
  }
  if (lernart === "texte") {
    return (
      `Erzeuge Karten zu Stilmitteln (Name in "frage", Definition + ein Beispiel in ` +
      `"antwort"), Analysebausteinen und dem Aufbau von Eroerterung/Analyse.`
    );
  }
  return (
    `Erzeuge Erklaerfragen (Warum/Wie/Vergleiche/Folgen), nicht nur "Was ist"-Fragen.`
  );
}

async function focusText(input: GenerateInput): Promise<string | undefined> {
  if (input.topicId) {
    const topic = await getTopic(input.topicId);
    if (topic) {
      const summaryHinweis = topic.summary ? ` Lernzettel dazu:\n${topic.summary}` : "";
      return `${topic.title}.${summaryHinweis}`;
    }
  }
  return input.thema;
}

function systemPrompt(anzahl: number, subjectName: string, lernart: Lernart, kind: CardKind, fokus?: string): string {
  const fokusHinweis = fokus ? `\nFokussiere dich dabei besonders auf: ${fokus}.` : "";
  return (
    `Du bist Lernkarten-Autor fuer einen Schueler der 10. Klasse (NRW G9) im Fach ${subjectName}. ` +
    `Erzeuge genau ${anzahl} Karteikarten NUR aus dem gelieferten Material -- erfinde nichts dazu.${fokusHinweis}\n\n` +
    `${kindRegel(lernart, kind)}\n\n` +
    `Regeln:\n` +
    `- Frage praezise und eindeutig.\n` +
    `- Antwort kurz (1 bis 3 Saetze oder Stichpunkte, bei Aufgaben der komplette Loesungsweg).\n` +
    `- Auf Deutsch, ausser bei Vokabeln/Grammatik in der Zielsprache.\n` +
    `- Ausgabe AUSSCHLIESSLICH als JSON-Array ohne Erklaertext, in genau dieser Form: ` +
    `[{"frage":"...","antwort":"...","art":"wissen"}] -- "art" nur bei Karten, die von der ` +
    `Standard-Kartenart (${kind}) abweichen, sonst weglassen.`
  );
}

export async function generateCards(input: GenerateInput): Promise<GenerateResult> {
  if (!botEnabled()) throw new Error("BOT_DISABLED");

  const subject = await getSubject(input.subjectId);
  if (!subject) return { cards: [], quelleText: "", hinweis: "Fach nicht gefunden." };

  const quelleText = await collectContext(input, subject);
  if (!quelleText.trim()) {
    return { cards: [], quelleText: "", hinweis: "Keine Notizen, Dateien oder Lehrplan gefunden." };
  }

  const anzahl = Math.min(Math.max(input.anzahl ?? DEFAULT_ANZAHL, 1), MAX_ANZAHL);
  const lernart = subject.lernart ?? lernartFor(subject.name);
  const kind = input.kind ?? defaultKindFor(lernart);
  const fokus = await focusText(input);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(anzahl, subject.name, lernart, kind, fokus) },
    { role: "user", content: quelleText },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let text = "";
  try {
    for await (const event of streamChatWithFallback(messages, [], controller.signal)) {
      if (event.type === "text") text += event.delta;
      // thinking wird bewusst ignoriert -- nur die eigentliche Antwort zaehlt.
    }
  } finally {
    clearTimeout(timeout);
  }

  const parsed = parseGeneratedCards(text);
  const cards = parsed.map((c) => ({ question: c.question, answer: c.answer, kind: c.kind ?? kind }));
  return {
    cards,
    quelleText,
    ...(cards.length === 0 ? { hinweis: "Der Bot konnte keine verwertbaren Karten erzeugen." } : {}),
  };
}

// --- Lernzettel ----------------------------------------------------------------

const MAX_SUMMARY_WORDS = 450;

function summaryPrompt(subjectName: string, lernart: Lernart, fokus?: string): string {
  const fokusHinweis = fokus ? `\nDreht sich um: ${fokus}.` : "";
  const artHinweis =
    lernart === "aufgaben"
      ? "Formeln/Regeln als Liste, dazu je eine kurze Musterloesung."
      : lernart === "vokabeln"
        ? "Grammatikuebersicht mit Beispielsaetzen, dazu eine Wortfeld-Liste."
        : lernart === "texte"
          ? "Ein Schreibleitfaden: Aufbau, Formulierungshilfen, Stilmittel."
          : "Eine Zusammenfassung mit den wichtigsten Zusammenhaengen.";

  return (
    `Du schreibst einen Lernzettel fuer einen Schueler der 10. Klasse (NRW G9) im Fach ` +
    `${subjectName}. Nutze NUR das gelieferte Material, erfinde nichts dazu.${fokusHinweis}\n\n` +
    `${artHinweis}\n\n` +
    `Form: Markdown mit Ueberschriften und Stichpunkten, Definitionen und Formeln hervorgehoben, ` +
    `je Abschnitt ein Beispiel. Hoechstens etwa ${MAX_SUMMARY_WORDS} Woerter. Gib NUR den ` +
    `Lernzettel-Text zurueck, keine Erklaerungen drumherum.`
  );
}

export async function generateSummary(input: GenerateInput): Promise<SummaryResult> {
  if (!botEnabled()) throw new Error("BOT_DISABLED");

  const subject = await getSubject(input.subjectId);
  if (!subject) return { summary: "", hinweis: "Fach nicht gefunden." };

  const quelleText = await collectContext(input, subject);
  if (!quelleText.trim()) {
    return { summary: "", hinweis: "Keine Notizen, Dateien oder Lehrplan gefunden." };
  }

  const lernart = subject.lernart ?? lernartFor(subject.name);
  const fokus = await focusText(input);

  const messages: ChatMessage[] = [
    { role: "system", content: summaryPrompt(subject.name, lernart, fokus) },
    { role: "user", content: quelleText },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);

  let text = "";
  try {
    for await (const event of streamChatWithFallback(messages, [], controller.signal)) {
      if (event.type === "text") text += event.delta;
    }
  } finally {
    clearTimeout(timeout);
  }

  const summary = text.trim();
  return {
    summary,
    ...(summary ? {} : { hinweis: "Der Bot konnte keinen Lernzettel erzeugen." }),
  };
}

// --- Erklaeren -------------------------------------------------------------

// Streamt eine Erklaerung zu einer Karte (Frage + Antwort) fuer einen
// 10.-Klaessler, mit dem Lernzettel des Themas als Kontext.
export async function* explainCard(cardId: string): AsyncGenerator<string> {
  if (!botEnabled()) throw new Error("BOT_DISABLED");

  const card = await getCard(cardId);
  if (!card) throw new Error("CARD_NOT_FOUND");

  const subject = await getSubject(card.subjectId);
  const topic = card.topicId ? await getTopic(card.topicId) : undefined;

  const kontext = topic?.summary ? `\n\nLernzettel des Themas "${topic.title}":\n${topic.summary}` : "";

  const prompt =
    `Du erklaerst einem Schueler der 10. Klasse (NRW G9) im Fach ${subject?.name ?? ""} ` +
    `eine Karteikarte in maximal 120 Woertern, mit einem Beispiel und, wenn passend, einer ` +
    `Merkhilfe. Antworte nur mit der Erklaerung, ohne Einleitung.\n\n` +
    `Frage: ${card.question}\nAntwort: ${card.answer}${kontext}`;

  const messages: ChatMessage[] = [{ role: "user", content: prompt }];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXPLAIN_TIMEOUT_MS);

  try {
    for await (const event of streamChatWithFallback(messages, [], controller.signal)) {
      if (event.type === "text") yield event.delta;
    }
  } finally {
    clearTimeout(timeout);
  }
}

// --- Aufgaben-Variante -------------------------------------------------------

// Erzeugt eine Variante einer Aufgabenkarte (andere Zahlen, gleiche
// Schwierigkeit). Nur fuer kind "aufgabe" sinnvoll -- die Route weist andere
// Karten ab, bevor sie hierher kommt.
export async function generateVariant(cardId: string): Promise<{ question: string; answer: string } | null> {
  if (!botEnabled()) throw new Error("BOT_DISABLED");

  const card = await getCard(cardId);
  if (!card) throw new Error("CARD_NOT_FOUND");

  const subject = await getSubject(card.subjectId);

  const prompt =
    `Du erzeugst fuer einen Schueler der 10. Klasse (NRW G9) im Fach ${subject?.name ?? ""} ` +
    `eine Variante der folgenden Uebungsaufgabe: andere Zahlen/Werte, gleiche Schwierigkeit, ` +
    `gleiches Thema. Antwort ist der Loesungsweg Schritt fuer Schritt mit Endergebnis, kurz. ` +
    `Ausgabe AUSSCHLIESSLICH als JSON-Objekt ohne Erklaertext: {"frage":"...","antwort":"..."}.\n\n` +
    `Aufgabe: ${card.question}\nLoesung: ${card.answer}`;

  const messages: ChatMessage[] = [{ role: "user", content: prompt }];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let text = "";
  try {
    for await (const event of streamChatWithFallback(messages, [], controller.signal)) {
      if (event.type === "text") text += event.delta;
    }
  } finally {
    clearTimeout(timeout);
  }

  return parseGeneratedVariant(text);
}
