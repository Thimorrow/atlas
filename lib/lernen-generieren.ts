// Karten per Bot generieren: Kontext aus Notizen/Dateien/Lehrplan sammeln,
// das Modell einmal streamend fragen, Antwort mit parseGeneratedCards lesen.
// Speichert selbst nichts -- das macht die Route ueber createCards().

import { getSubject, listNotes } from "@/lib/subject-store";
import { listSubjectLessonNotes } from "@/lib/lesson-notes";
import { listFiles } from "@/lib/subject-file-store";
import { readSubjectFile } from "@/lib/bot/files";
import { botEnabled, streamChatWithFallback, type ChatMessage } from "@/lib/bot/model";
import { parseGeneratedCards } from "@/lib/lernen";

export type GenerateInput = {
  subjectId: string;
  quelle: "notizen" | "dateien" | "lehrplan" | "alles";
  fileIds?: string[];
  anzahl?: number;
  thema?: string;
};

export type GenerateResult = {
  cards: { question: string; answer: string }[];
  quelleText: string;
  hinweis?: string;
};

const MAX_CONTEXT_CHARS = 30_000;
const MAX_FILES_WITHOUT_IDS = 5;
const DEFAULT_ANZAHL = 12;
const MAX_ANZAHL = 30;
const TIMEOUT_MS = 90_000;

// Kontext fuer eine der vier Quellen einsammeln. Notizen zuerst, weil sie beim
// Kuerzen auf MAX_CONTEXT_CHARS Vorrang haben.
async function collectNotesText(subject: { id: string; name: string; untisSubject: string | null }): Promise<string> {
  const [notes, lessonNotes] = await Promise.all([
    listNotes(subject.id),
    listSubjectLessonNotes({ id: subject.id, untisSubject: subject.untisSubject, name: subject.name }),
  ]);
  const parts: string[] = [];
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
    const text = await collectNotesText(subject);
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

function systemPrompt(anzahl: number, subjectName: string, thema?: string): string {
  const themaHinweis = thema ? `\nFokussiere dich dabei besonders auf: ${thema}.` : "";
  return (
    `Du bist Lernkarten-Autor fuer einen Schueler der 10. Klasse (NRW G9) im Fach ${subjectName}. ` +
    `Erzeuge genau ${anzahl} Karteikarten NUR aus dem gelieferten Material -- erfinde nichts dazu.${themaHinweis}\n\n` +
    `Regeln:\n` +
    `- Frage praezise und eindeutig.\n` +
    `- Antwort kurz (1 bis 3 Saetze oder Stichpunkte).\n` +
    `- Auf Deutsch. Bei einer Fremdsprache: Vokabeln/Grammatik in der Zielsprache mit deutscher Uebersetzung.\n` +
    `- Ausgabe AUSSCHLIESSLICH als JSON-Array ohne Erklaertext, in genau dieser Form: ` +
    `[{"frage":"...","antwort":"..."}]`
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

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(anzahl, subject.name, input.thema) },
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

  const cards = parseGeneratedCards(text);
  return {
    cards,
    quelleText,
    ...(cards.length === 0 ? { hinweis: "Der Bot konnte keine verwertbaren Karten erzeugen." } : {}),
  };
}
