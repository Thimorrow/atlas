// Widgets des Tutors als Tools des Modells (ChatTool[]), plus manuelle
// Argument-Validierung wie in lib/bot/tools.ts (zod ist nicht installiert).
// Siehe TUTOR-SPEC.md "Widgets = Tools des Modells" fuer die Tabelle.

import { CARD_KINDS, type CardKind } from "@/lib/lernen-types";
import type { ChatTool } from "@/lib/bot/model";
import type { AufgabeStatus } from "@/lib/tutor/types";

const MIN_OPTIONEN = 2;
const MAX_OPTIONEN = 6;
const MIN_AUFGABEN = 5;
const MAX_AUFGABEN = 8;
const MAX_NEUE_KARTEN = 8;

export const tutorTools: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "frage_auswahl",
      description:
        "Stellt Timo eine Auswahlfrage als Widget -- IMMER benutzen statt einer Frage im Fliesstext, wenn er zwischen Optionen waehlen soll (Wissensstand, gecheckt?, welche Erklaerung). 2 bis 6 Optionen.",
      parameters: {
        type: "object",
        properties: {
          frage: { type: "string", description: "Die Frage an Timo." },
          optionen: {
            type: "array",
            items: { type: "string" },
            description: "2 bis 6 Antwortoptionen.",
          },
          mehrfach: { type: "boolean", description: "true, wenn Timo mehrere Optionen waehlen darf." },
        },
        required: ["frage", "optionen", "mehrfach"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "checkliste_erstellen",
      description:
        "Legt die Checkliste mit 5 bis 8 Aufgaben an, leicht bis schwer. Danach im Text mit Aufgabe 1 weitermachen.",
      parameters: {
        type: "object",
        properties: {
          titel: { type: "string", description: "Titel der Checkliste." },
          aufgaben: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nr: { type: "number", description: "Aufgabennummer, bei 1 beginnend." },
                text: { type: "string", description: "Aufgabentext." },
                schwierigkeit: { type: "number", description: "1 (leicht) bis 3 (schwer)." },
              },
              required: ["nr", "text", "schwierigkeit"],
            },
            description: "5 bis 8 Aufgaben.",
          },
        },
        required: ["titel", "aufgaben"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aufgabe_ergebnis",
      description:
        "Setzt das Ergebnis einer Aufgabe aus der Checkliste. IMMER zuerst aufrufen, bevor im Text Feedback und die naechste Aufgabe kommen.",
      parameters: {
        type: "object",
        properties: {
          nr: { type: "number", description: "Nummer der Aufgabe aus der Checkliste." },
          status: {
            type: "string",
            enum: ["richtig", "falsch", "uebersprungen"],
            description: "richtig, falsch oder uebersprungen (bei skip).",
          },
          punkte: { type: "number", description: "Optional: erreichte Punkte." },
        },
        required: ["nr", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fazit",
      description:
        "Beendet die Session mit einem Fazit: was war gut, was war schwach, welche Karten sollten Timos Luecken schliessen. IMMER am Ende einer Session aufrufen.",
      parameters: {
        type: "object",
        properties: {
          gutWar: { type: "array", items: { type: "string" }, description: "Stichpunkte, was gut war." },
          schwach: { type: "array", items: { type: "string" }, description: "Stichpunkte, was noch schwach ist." },
          neueKarten: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                answer: { type: "string" },
                kind: { type: "string", enum: CARD_KINDS, description: "Kartenart, Standard wissen." },
              },
              required: ["question", "answer"],
            },
            description: "0 bis 8 Vorschlaege fuer neue Karten zu den Luecken.",
          },
          punkte: { type: "number", description: "Nur Modus probe: erreichte Punkte." },
          gesamt: { type: "number", description: "Nur Modus probe: maximale Punkte." },
          punktePlan: {
            type: "array",
            items: {
              type: "object",
              properties: {
                pointId: { type: "string", description: "id des Lernplan-Punkts." },
                prozent: { type: "number", description: "0 bis 100." },
              },
              required: ["pointId", "prozent"],
            },
            description: "Nur Simulation: je gelisteten Lernplan-Punkt ein Prozentwert.",
          },
        },
        required: ["gutWar", "schwach", "neueKarten"],
      },
    },
  },
];

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// --- frage_auswahl -----------------------------------------------------------

export type FrageAuswahl = { frage: string; optionen: string[]; mehrfach: boolean };

export function parseFrageAuswahl(args: unknown): ParseResult<FrageAuswahl> {
  if (!isObj(args)) return { ok: false, error: "Ungueltige Argumente." };

  const frage = args.frage;
  if (typeof frage !== "string" || !frage.trim()) {
    return { ok: false, error: "frage darf nicht leer sein." };
  }

  const optionenRaw = args.optionen;
  if (!Array.isArray(optionenRaw) || !optionenRaw.every((o) => typeof o === "string")) {
    return { ok: false, error: "optionen muss eine Liste von Texten sein." };
  }
  if (optionenRaw.length < MIN_OPTIONEN) {
    return { ok: false, error: `${MIN_OPTIONEN} bis ${MAX_OPTIONEN} Optionen.` };
  }
  // Mehr als 6 Optionen: auf 6 kappen statt abzulehnen.
  const optionen = optionenRaw.slice(0, MAX_OPTIONEN);

  const mehrfach = args.mehrfach === true;

  return { ok: true, value: { frage: frage.trim(), optionen, mehrfach } };
}

// --- checkliste_erstellen -----------------------------------------------------

export type ChecklisteAufgabe = { nr: number; text: string; schwierigkeit: number };
export type ChecklisteInput = { titel: string; aufgaben: ChecklisteAufgabe[] };

export function parseCheckliste(args: unknown): ParseResult<ChecklisteInput> {
  if (!isObj(args)) return { ok: false, error: "Ungueltige Argumente." };

  const titel = args.titel;
  if (typeof titel !== "string" || !titel.trim()) {
    return { ok: false, error: "titel darf nicht leer sein." };
  }

  const aufgabenRaw = args.aufgaben;
  if (!Array.isArray(aufgabenRaw)) {
    return { ok: false, error: "aufgaben muss eine Liste sein." };
  }
  if (aufgabenRaw.length < MIN_AUFGABEN || aufgabenRaw.length > MAX_AUFGABEN) {
    return { ok: false, error: `${MIN_AUFGABEN} bis ${MAX_AUFGABEN} Aufgaben.` };
  }

  const aufgaben: ChecklisteAufgabe[] = [];
  for (const a of aufgabenRaw) {
    if (!isObj(a) || typeof a.nr !== "number" || typeof a.text !== "string" || !a.text.trim()) {
      return { ok: false, error: "jede Aufgabe braucht nr und text." };
    }
    const schwierigkeitRaw = typeof a.schwierigkeit === "number" ? a.schwierigkeit : 1;
    const schwierigkeit = Math.min(Math.max(Math.round(schwierigkeitRaw), 1), 3);
    aufgaben.push({ nr: a.nr, text: a.text.trim(), schwierigkeit });
  }

  return { ok: true, value: { titel: titel.trim(), aufgaben } };
}

// --- aufgabe_ergebnis ---------------------------------------------------------

const AUFGABE_STATUS: AufgabeStatus[] = ["offen", "richtig", "falsch", "uebersprungen"];
const AUFGABE_ERGEBNIS_STATUS = ["richtig", "falsch", "uebersprungen"] as const;

export type AufgabeErgebnisInput = { nr: number; status: "richtig" | "falsch" | "uebersprungen"; punkte?: number };

export function parseAufgabeErgebnis(args: unknown): ParseResult<AufgabeErgebnisInput> {
  if (!isObj(args)) return { ok: false, error: "Ungueltige Argumente." };

  const nr = args.nr;
  if (typeof nr !== "number") return { ok: false, error: "nr muss eine Zahl sein." };

  const status = args.status;
  if (typeof status !== "string" || !(AUFGABE_ERGEBNIS_STATUS as readonly string[]).includes(status)) {
    return { ok: false, error: `status muss eine von ${AUFGABE_ERGEBNIS_STATUS.join(", ")} sein.` };
  }

  const punkte = typeof args.punkte === "number" ? args.punkte : undefined;

  return { ok: true, value: { nr, status: status as AufgabeErgebnisInput["status"], ...(punkte !== undefined ? { punkte } : {}) } };
}

// Wird von session.ts genutzt, um bekannte Aufgaben-Status auch anderswo zu
// pruefen (z. B. Checkliste-Ergebnisse aus der DB).
export function isAufgabeStatus(v: unknown): v is AufgabeStatus {
  return typeof v === "string" && (AUFGABE_STATUS as readonly string[]).includes(v);
}

// --- fazit --------------------------------------------------------------------

export type FazitKarte = { question: string; answer: string; kind: CardKind };
export type FazitPunktPlan = { pointId: string; prozent: number };
export type FazitInput = {
  gutWar: string[];
  schwach: string[];
  neueKarten: FazitKarte[];
  punkte?: number;
  gesamt?: number;
  punktePlan?: FazitPunktPlan[];
};

function stringListe(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
}

export function parseFazit(args: unknown): ParseResult<FazitInput> {
  if (!isObj(args)) return { ok: false, error: "Ungueltige Argumente." };

  const gutWar = stringListe(args.gutWar);
  const schwach = stringListe(args.schwach);

  const neueKartenRaw = Array.isArray(args.neueKarten) ? args.neueKarten : [];
  const neueKarten: FazitKarte[] = [];
  for (const k of neueKartenRaw.slice(0, MAX_NEUE_KARTEN)) {
    if (!isObj(k) || typeof k.question !== "string" || typeof k.answer !== "string") continue;
    if (!k.question.trim() || !k.answer.trim()) continue;
    const kindRaw = k.kind;
    const kind: CardKind =
      typeof kindRaw === "string" && (CARD_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as CardKind) : "wissen";
    neueKarten.push({ question: k.question.trim(), answer: k.answer.trim(), kind });
  }

  const punkte = typeof args.punkte === "number" ? args.punkte : undefined;
  const gesamt = typeof args.gesamt === "number" ? args.gesamt : undefined;

  const punktePlanRaw = Array.isArray(args.punktePlan) ? args.punktePlan : [];
  const punktePlan: FazitPunktPlan[] = [];
  for (const p of punktePlanRaw) {
    if (!isObj(p) || typeof p.pointId !== "string" || !p.pointId.trim() || typeof p.prozent !== "number") continue;
    punktePlan.push({ pointId: p.pointId, prozent: p.prozent });
  }

  return {
    ok: true,
    value: {
      gutWar,
      schwach,
      neueKarten,
      ...(punkte !== undefined ? { punkte } : {}),
      ...(gesamt !== undefined ? { gesamt } : {}),
      ...(punktePlan.length > 0 ? { punktePlan } : {}),
    },
  };
}
