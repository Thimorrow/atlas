// Reine Logik des Lernbereichs (Leitner-System, Lernplan, Karten-Parsing).
// Bewusst ohne DB-Import: laeuft im Client, im Server-Component und im Test.

// Tage bis zur naechsten Faelligkeit je Box (Index = Box). Box 0..5.
export const BOX_INTERVALS = [0, 1, 3, 7, 14, 30];
export const MAX_BOX = 5;
// Ab dieser Box gilt eine Karte als sicher gelernt.
export const MASTERED_BOX = 3;

export type CardLike = {
  box: number;
  due: string;
  reviews: number;
  archivedAt?: string | Date | null;
};

// --- Datum (lokal, kein UTC-Drift) ------------------------------------------
// Identisch zum Muster in lib/assignments-view.ts.

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00`).getTime();
  const b = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// --- Leitner-Umsetzung -------------------------------------------------------
//
// Richtig: eine Box hoeher (max MAX_BOX), naechste Faelligkeit nach
// BOX_INTERVALS der NEUEN Box. Falsch: zurueck auf Box 0, sofort wieder faellig.
export function schedule(
  card: { box: number },
  correct: boolean,
  todayISO: string,
): { box: number; due: string } {
  if (!correct) return { box: 0, due: todayISO };
  const box = Math.min(card.box + 1, MAX_BOX);
  return { box, due: addDays(todayISO, BOX_INTERVALS[box]) };
}

export function isDue(card: CardLike, todayISO: string): boolean {
  if (card.archivedAt) return false;
  return card.due <= todayISO;
}

// Faellige zuerst (niedrige Box zuerst, dann aeltestes due), danach neue
// Karten (reviews 0), auf limit begrenzt. Archivierte Karten werden von der
// Sitzung ausgeschlossen.
export function sessionQueue<T extends CardLike>(cards: T[], todayISO: string, limit = 20): T[] {
  const active = cards.filter((c) => !c.archivedAt);
  const due = active
    .filter((c) => isDue(c, todayISO))
    .sort((a, b) => a.box - b.box || a.due.localeCompare(b.due));
  const dueIds = new Set(due);
  const neu = active.filter((c) => !dueIds.has(c) && c.reviews === 0);
  return [...due, ...neu].slice(0, limit);
}

export function progress(cards: CardLike[]): {
  total: number;
  neu: number;
  lernend: number;
  sicher: number;
} {
  const active = cards.filter((c) => !c.archivedAt);
  let neu = 0;
  let sicher = 0;
  for (const c of active) {
    if (c.reviews === 0) neu++;
    else if (c.box >= MASTERED_BOX) sicher++;
  }
  const lernend = active.length - neu - sicher;
  return { total: active.length, neu, lernend, sicher };
}

// Lernplan bis zu einer Pruefung: wie viele noch nicht sichere Karten pro Tag
// noch anstehen. tageBis nie negativ (eine Pruefung heute/vergangen zaehlt
// als "0 Tage", nicht als Division durch 0 oder negativ).
export function planForExam(
  cards: CardLike[],
  examISO: string,
  todayISO: string,
): { tageBis: number; proTag: number; offen: number } {
  const tageBis = Math.max(0, daysBetween(todayISO, examISO));
  const offen = cards.filter((c) => !c.archivedAt && c.box < MASTERED_BOX).length;
  const proTag = Math.ceil(offen / Math.max(tageBis, 1));
  return { tageBis, proTag, offen };
}

// --- Karten-Generierung: Antwort des Bots parsen -----------------------------

const MAX_PARSED_CARDS = 40;
const MIN_FIELD_LEN = 3;

function stripCodeFences(text: string): string {
  // ```json ... ``` oder ``` ... ``` -- der Fence-Inhalt bleibt, der Rest der
  // Fence-Zeilen faellt weg.
  return text.replace(/```(?:json)?/gi, "");
}

// Findet das erste vollstaendige JSON-Array im Text (auch wenn davor/danach
// Erklaertext steht), ueber Klammer-Tiefe statt Regex -- ein Regex haette bei
// verschachtelten Klammern in Antworttexten versagt.
function findFirstJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Robustes Parsen der vom Modell gelieferten Lernkarten: Code-Fences weg,
// erstes JSON-Array raussuchen, Eintraege mit frage/antwort ODER
// question/answer akzeptieren, leere/zu kurze Werte und Duplikate (gleiche
// Frage) verwerfen. Kaputtes JSON -> leere Liste statt Fehler.
export function parseGeneratedCards(text: string): { question: string; answer: string }[] {
  const cleaned = stripCodeFences(text);
  const jsonText = findFirstJsonArray(cleaned);
  if (!jsonText) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const out: { question: string; answer: string }[] = [];

  for (const entry of parsed) {
    if (!isObj(entry)) continue;
    const q = entry.frage ?? entry.question;
    const a = entry.antwort ?? entry.answer;
    if (typeof q !== "string" || typeof a !== "string") continue;

    const question = q.trim();
    const answer = a.trim();
    if (question.length < MIN_FIELD_LEN || answer.length < MIN_FIELD_LEN) continue;

    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ question, answer });
    if (out.length >= MAX_PARSED_CARDS) break;
  }

  return out;
}
