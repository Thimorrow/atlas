// Reine Logik des Lernbereichs (Leitner-System, Lernplan, Karten-Parsing).
// Bewusst ohne DB-Import: laeuft im Client, im Server-Component und im Test.

import { CARD_KINDS, type CardKind, type HeuteItem, type Lernart, type PruefungRef } from "@/lib/lernen-types";

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
  return queueFor("lernen", cards, todayISO, limit);
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

// 0..100, gewichtete Sicherheit aller aktiven Karten: Summe min(box,
// MASTERED_BOX) geteilt durch das theoretische Maximum, gerundet. Leer -> 0.
export function readiness(cards: CardLike[]): number {
  const active = cards.filter((c) => !c.archivedAt);
  if (active.length === 0) return 0;
  const sum = active.reduce((acc, c) => acc + Math.min(c.box, MASTERED_BOX), 0);
  return Math.round((sum / (MASTERED_BOX * active.length)) * 100);
}

export function progressOf<T extends CardLike>(cards: T[], todayISO: string) {
  const p = progress(cards);
  const active = cards.filter((c) => !c.archivedAt);
  const faellig = active.filter((c) => isDue(c, todayISO)).length;
  return { ...p, faellig, bereit: readiness(cards) };
}

// --- Deterministisches Mischen (Probe) ---------------------------------------

// Kleiner, schneller PRNG fuer deterministisches Mischen -- gleicher seed
// ergibt immer dieselbe Reihenfolge (wichtig fuer Tests und damit eine
// Probe nicht bei jedem Reload neu mischt).
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type QueueModus = "lernen" | "schwach" | "probe";

export type QueueCardLike = CardLike & { lapses?: number };

// Warteschlange fuer eine Sitzung, je nach Modus:
// - lernen: faellige zuerst, dann neue (wie sessionQueue); ist das leer und es
//   gibt trotzdem Karten, die schwaechsten (box asc) bis limit.
// - schwach: aktive Karten sortiert nach lapses desc, box asc, due asc.
// - probe: alle aktiven Karten, deterministisch gemischt (seed), auf limit
//   begrenzt (Default 25).
export function queueFor<T extends QueueCardLike>(
  modus: QueueModus,
  cards: T[],
  todayISO: string,
  limit = 20,
  seed = 1,
): T[] {
  const active = cards.filter((c) => !c.archivedAt);

  if (modus === "schwach") {
    return [...active]
      .sort((a, b) => (b.lapses ?? 0) - (a.lapses ?? 0) || a.box - b.box || a.due.localeCompare(b.due))
      .slice(0, limit);
  }

  if (modus === "probe") {
    return shuffled(active, seed).slice(0, limit || 25);
  }

  const due = active
    .filter((c) => isDue(c, todayISO))
    .sort((a, b) => a.box - b.box || a.due.localeCompare(b.due));
  const dueIds = new Set(due);
  const neu = active.filter((c) => !dueIds.has(c) && c.reviews === 0);
  const queue = [...due, ...neu];
  if (queue.length > 0 || active.length === 0) return queue.slice(0, limit);

  // Keine faelligen/neuen Karten, aber es gibt welche: die schwaechsten ueben.
  return [...active].sort((a, b) => a.box - b.box).slice(0, limit);
}

// --- Lernart je Fach ----------------------------------------------------------

// Teilstring-Match, Gross/Kleinschreibung egal. Kuerzel ("M", "E") matchen
// absichtlich nichts und bleiben "wissen".
const AUFGABEN_FAECHER = ["mathe", "physik", "chemie", "informatik"];
const VOKABELN_FAECHER = ["englisch", "franz", "latein", "spanisch"];
const TEXTE_FAECHER = ["deutsch"];

function matches(name: string, keywords: string[]): boolean {
  const needle = name.toLowerCase();
  return keywords.some((k) => needle.includes(k));
}

export function lernartFor(name: string): Lernart {
  if (matches(name, AUFGABEN_FAECHER)) return "aufgaben";
  if (matches(name, VOKABELN_FAECHER)) return "vokabeln";
  if (matches(name, TEXTE_FAECHER)) return "texte";
  return "wissen";
}

// Standard-Kartenart je Lernart -- der Generator nimmt sie, wenn kind nicht
// mitgegeben wird.
export function defaultKindFor(lernart: Lernart): CardKind {
  if (lernart === "aufgaben") return "aufgabe";
  if (lernart === "vokabeln") return "vokabel";
  return "wissen";
}

// --- Tagesplan -----------------------------------------------------------------

export type HeuteThema = {
  subjectId: string;
  subjectName: string;
  color: string | null;
  topicId: string | null;
  titel: string;
  pruefung: PruefungRef | null;
  cards: CardLike[];
};

const MINUTEN_PRO_KARTE = 0.5;

// Tagesplan ueber alle Themen: Themen mit Pruefung bekommen so viele Karten
// zugeteilt, dass die offenen Karten rechtzeitig durch sind (mindestens die
// faelligen), Themen ohne Pruefung nur ihre faelligen. Sortiert: Pruefung
// zuerst (nach tageBis), dann Faellige nach Anzahl absteigend.
export function heutePlan(today: string, themen: HeuteThema[]): { items: HeuteItem[]; karten: number; minuten: number } {
  const items: HeuteItem[] = [];

  for (const t of themen) {
    const active = t.cards.filter((c) => !c.archivedAt);
    const faellig = active.filter((c) => isDue(c, today)).length;

    let anzahl: number;
    let grund: HeuteItem["grund"];
    if (t.pruefung && t.pruefung.tageBis >= 0) {
      const offen = active.filter((c) => c.box < MASTERED_BOX).length;
      anzahl = Math.min(Math.max(faellig, Math.ceil(offen / Math.max(t.pruefung.tageBis, 1))), active.length);
      grund = "pruefung";
    } else {
      anzahl = faellig;
      grund = "faellig";
    }

    if (anzahl <= 0) continue;

    items.push({
      subjectId: t.subjectId,
      subjectName: t.subjectName,
      color: t.color,
      topicId: t.topicId,
      titel: t.titel,
      grund,
      pruefung: grund === "pruefung" ? t.pruefung : null,
      anzahl,
      minuten: Math.ceil(anzahl * MINUTEN_PRO_KARTE),
    });
  }

  items.sort((a, b) => {
    if (a.grund === "pruefung" && b.grund === "pruefung") {
      return (a.pruefung?.tageBis ?? 0) - (b.pruefung?.tageBis ?? 0);
    }
    if (a.grund === "pruefung") return -1;
    if (b.grund === "pruefung") return 1;
    return b.anzahl - a.anzahl;
  });

  const karten = items.reduce((acc, i) => acc + i.anzahl, 0);
  const minuten = items.reduce((acc, i) => acc + i.minuten, 0);
  return { items, karten, minuten };
}

// --- Vokabeln --------------------------------------------------------------

const ARTIKEL = ["the", "a", "an", "le", "la", "les", "der", "die", "das", "ein", "eine"];

// trim, lowercase, Artikel vorne weg, Akzente weg -- fuer den Eintipp-
// Vergleich bei Vokabelkarten.
export function normalizeVokabel(text: string): string {
  let s = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Akzente entfernen

  for (const art of ARTIKEL) {
    const prefix = `${art} `;
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }
  return s.trim();
}

// Vergleicht die eingetippte Antwort mit der Loesung. Bei mehreren
// Bedeutungen ("Wort1, Wort2") reicht eine Uebereinstimmung.
export function vokabelStimmt(eingabe: string, loesung: string): boolean {
  const ein = normalizeVokabel(eingabe);
  if (!ein) return false;
  const varianten = loesung.split(",").map((v) => normalizeVokabel(v));
  return varianten.includes(ein);
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
// Frage) verwerfen. Kaputtes JSON -> leere Liste statt Fehler. Ein optionales
// Feld "art" (wissen/vokabel/aufgabe) wird als kind uebernommen -- so kann
// z. B. Mathe neben Aufgaben auch Merkregeln als kind "wissen" liefern.
export function parseGeneratedCards(
  text: string,
): { question: string; answer: string; kind?: CardKind }[] {
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
  const out: { question: string; answer: string; kind?: CardKind }[] = [];

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

    const artRaw = entry.art;
    const kind =
      typeof artRaw === "string" && (CARD_KINDS as readonly string[]).includes(artRaw)
        ? (artRaw as CardKind)
        : undefined;

    out.push(kind ? { question, answer, kind } : { question, answer });
    if (out.length >= MAX_PARSED_CARDS) break;
  }

  return out;
}

// Findet das erste vollstaendige JSON-Objekt im Text (analog zu
// findFirstJsonArray, aber { statt [).
function findFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
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
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// Wie parseGeneratedCards, aber fuer ein einzelnes JSON-Objekt (Antwort von
// generateVariant). null statt einer leeren Liste, wenn nichts Brauchbares
// dabei war.
export function parseGeneratedVariant(text: string): { question: string; answer: string } | null {
  const cleaned = stripCodeFences(text);
  const jsonText = findFirstJsonObject(cleaned);
  if (!jsonText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!isObj(parsed)) return null;

  const q = parsed.frage ?? parsed.question;
  const a = parsed.antwort ?? parsed.answer;
  if (typeof q !== "string" || typeof a !== "string") return null;

  const question = q.trim();
  const answer = a.trim();
  if (question.length < MIN_FIELD_LEN || answer.length < MIN_FIELD_LEN) return null;

  return { question, answer };
}
