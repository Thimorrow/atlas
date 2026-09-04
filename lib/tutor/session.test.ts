import { describe, expect, it } from "vitest";
import { runTutorTurn, type TutorSessionDeps } from "@/lib/tutor/session";
import type { StreamEvent } from "@/lib/bot/model";
import type { Checkliste, TutorConversationDTO, TutorErgebnis, TutorMessageDTO } from "@/lib/tutor/types";
import type { SubjectDetail, TopicDTO } from "@/lib/lernen-types";

const TOPIC_ID = "11111111-1111-1111-1111-111111111111";
const SUBJECT_ID = "22222222-2222-2222-2222-222222222222";
const CONVERSATION_ID = "33333333-3333-3333-3333-333333333333";

function makeTopic(): TopicDTO {
  return {
    id: TOPIC_ID,
    subjectId: SUBJECT_ID,
    title: "Quadratische Gleichungen",
    summary: "Ein Lernzettel.",
    assignmentId: null,
    position: 0,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeDetail(): SubjectDetail {
  return {
    subject: { id: SUBJECT_ID, name: "Mathe", color: null, curriculum: null, lernart: "aufgaben", lernartAuto: true },
    cards: [],
    themen: [],
    ohneThema: { total: 0, neu: 0, lernend: 0, sicher: 0, faellig: 0, bereit: 0 },
    progress: { total: 0, neu: 0, lernend: 0, sicher: 0, faellig: 0, bereit: 0 },
    naechstePruefung: null,
    pruefungen: [],
    plan: null,
    dateien: [],
    notizen: [],
  };
}

// Baut ein In-Memory-Deps-Objekt: eigene Nachrichtenliste + Konversation,
// keine DB noetig. `rounds` liefert je Modellaufruf eine Liste von
// StreamEvents (eine "Runde" streamChatWithFallback).
function makeDeps(opts: { modus?: "lernen" | "probe"; checkliste?: Checkliste | null; rounds: StreamEvent[][] }): {
  deps: TutorSessionDeps;
  messages: TutorMessageDTO[];
  getErgebnis: () => TutorErgebnis | null;
} {
  let idCounter = 0;
  const messages: TutorMessageDTO[] = [];
  let conversation: TutorConversationDTO = {
    id: CONVERSATION_ID,
    topicId: TOPIC_ID,
    subjectId: SUBJECT_ID,
    modus: opts.modus ?? "lernen",
    cardId: null,
    checkliste: opts.checkliste ?? null,
    ergebnis: null,
    kartenAngelegt: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
  };

  let roundIndex = 0;

  const deps: TutorSessionDeps = {
    streamChat: (async function* streamChat() {
      const events = opts.rounds[roundIndex] ?? [];
      roundIndex++;
      for (const e of events) yield e;
    }) as unknown as TutorSessionDeps["streamChat"],
    getTutorConversation: async () => conversation,
    listTutorMessages: async () => messages,
    appendTutorMessage: async (_id, data) => {
      const row: TutorMessageDTO = {
        id: `m${++idCounter}`,
        conversationId: CONVERSATION_ID,
        role: data.role,
        content: data.content,
        toolName: data.toolName ?? null,
        toolArgs: data.toolArgs ?? null,
        toolResult: data.toolResult ?? null,
        createdAt: new Date().toISOString(),
      };
      messages.push(row);
      return row;
    },
    setCheckliste: async (_id, checkliste) => {
      conversation = { ...conversation, checkliste };
      return conversation;
    },
    setAufgabeStatus: async (_id, nr, status, punkte) => {
      if (!conversation.checkliste) return null;
      const idx = conversation.checkliste.aufgaben.findIndex((a) => a.nr === nr);
      if (idx === -1) return null;
      const aufgaben = conversation.checkliste.aufgaben.map((a, i) =>
        i === idx ? { ...a, status, ...(punkte !== undefined ? { punkte } : {}) } : a,
      );
      const checkliste: Checkliste = { ...conversation.checkliste, aufgaben };
      conversation = { ...conversation, checkliste };
      return checkliste;
    },
    setErgebnis: async (_id, ergebnis) => {
      conversation = { ...conversation, ergebnis, endedAt: new Date().toISOString() };
      return conversation;
    },
    getTopic: async () => makeTopic(),
    subjectDetail: async () => makeDetail(),
    getCard: async () => undefined,
  };

  return { deps, messages, getErgebnis: () => conversation.ergebnis };
}

function toolCallEvent(name: string, args: unknown): StreamEvent {
  return {
    type: "tool_calls",
    toolCalls: [{ id: `call_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
  };
}

describe("runTutorTurn", () => {
  it("(a) endet nach frage_auswahl mit widget dann done", async () => {
    const { deps } = makeDeps({
      rounds: [[toolCallEvent("frage_auswahl", { frage: "Was weißt du?", optionen: ["Viel", "Wenig"], mehrfach: false })]],
    });

    const events = [];
    for await (const e of runTutorTurn(CONVERSATION_ID, undefined, deps)) events.push(e);

    expect(events.map((e) => e.type)).toEqual(["widget", "done"]);
    const widget = events[0];
    if (widget.type === "widget") {
      expect(widget.frage).toBe("Was weißt du?");
      expect(widget.optionen).toEqual(["Viel", "Wenig"]);
    }
  });

  it("(b) checkliste_erstellen -> aufgabe_ergebnis -> Text setzt Status richtig bei Nr. 1", async () => {
    const { deps } = makeDeps({
      rounds: [
        [
          toolCallEvent("checkliste_erstellen", {
            titel: "Uebung",
            aufgaben: [1, 2, 3, 4, 5].map((nr) => ({ nr, text: `Aufgabe ${nr}`, schwierigkeit: 1 })),
          }),
        ],
        [toolCallEvent("aufgabe_ergebnis", { nr: 1, status: "richtig" })],
        [{ type: "text", delta: "Aufgabe 2: Loese x^2 = 4." }],
      ],
    });

    const events = [];
    for await (const e of runTutorTurn(CONVERSATION_ID, undefined, deps)) events.push(e);

    expect(events.map((e) => e.type)).toEqual(["checkliste", "checkliste", "text", "done"]);
    const last = events[1];
    if (last.type === "checkliste") {
      const aufgabe1 = last.checkliste.aufgaben.find((a) => a.nr === 1);
      expect(aufgabe1?.status).toBe("richtig");
    }
  });

  it("(c) fazit im Modus probe rechnet Punkte aus der Checkliste und setzt die Note", async () => {
    const checkliste: Checkliste = {
      titel: "Probe",
      aufgaben: [
        { nr: 1, text: "A1", schwierigkeit: 1, status: "richtig" },
        { nr: 2, text: "A2", schwierigkeit: 2, status: "falsch" },
        { nr: 3, text: "A3", schwierigkeit: 3, status: "richtig" },
      ],
    };
    const { deps, getErgebnis } = makeDeps({
      modus: "probe",
      checkliste,
      rounds: [[toolCallEvent("fazit", { gutWar: ["Gut"], schwach: ["Schwach"], neueKarten: [] })]],
    });

    const events = [];
    for await (const e of runTutorTurn(CONVERSATION_ID, undefined, deps)) events.push(e);

    expect(events.map((e) => e.type)).toEqual(["fazit", "done"]);
    // punkte = 1 + 3 = 4, gesamt = 1+2+3 = 6, prozent = round(4/6*100) = 67
    const ergebnis = getErgebnis();
    expect(ergebnis?.punkte).toBe(4);
    expect(ergebnis?.gesamt).toBe(6);
    expect(ergebnis?.prozent).toBe(67);
    expect(ergebnis?.note).toBe(3); // noteFuerProzent(67) -> 3 (>= 55)
  });
});
