import { describe, expect, it, vi } from "vitest";
import { runTutorTurn, type TutorSessionDeps } from "@/lib/tutor/session";
import { noteFuerProzent } from "@/lib/tutor/note";
import type { ChatMessage, StreamEvent } from "@/lib/bot/model";
import type { Checkliste, TutorConversationDTO, TutorErgebnis, TutorMessageDTO } from "@/lib/tutor/types";
import type { SubjectDetail, TopicDTO } from "@/lib/lernen-types";
import type { PlanDTO, PunktDTO } from "@/lib/lernplan-types";

const TOPIC_ID = "11111111-1111-1111-1111-111111111111";
const SUBJECT_ID = "22222222-2222-2222-2222-222222222222";
const CONVERSATION_ID = "33333333-3333-3333-3333-333333333333";
const ITEM_ID = "44444444-4444-4444-4444-444444444444";
const ASSIGNMENT_ID = "55555555-5555-5555-5555-555555555555";
const POINT_ID = "66666666-6666-6666-6666-666666666666";
const FILE_ID = "77777777-7777-7777-7777-777777777777";

function makePunkt(overrides: Partial<PunktDTO> = {}): PunktDTO {
  return {
    id: POINT_ID,
    planId: "plan-1",
    topicId: null,
    position: 0,
    titel: "Bruchrechnen",
    detail: "",
    seiten: "12-14",
    fileIds: [FILE_ID],
    blaetter: [{ id: FILE_ID, name: "Zettel.pdf" }],
    minutenSchaetzung: 20,
    sicherheit: 40,
    sicherheitQuelle: "ohne_test",
    sicherheitAm: "2026-01-01T00:00:00.000Z",
    cardsState: "offen",
    kartenAnzahl: 0,
    checks: [],
    ...overrides,
  };
}

function makePlan(punkte: PunktDTO[]): PlanDTO {
  return {
    id: "plan-1",
    assignmentId: ASSIGNMENT_ID,
    subjectId: SUBJECT_ID,
    checklistFileId: null,
    checklistText: "",
    minutesWeekday: 30,
    minutesWeekend: 60,
    examDate: "2026-02-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    punkte,
    items: [],
  };
}

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
function makeDeps(opts: {
  modus?: "lernen" | "probe";
  checkliste?: Checkliste | null;
  rounds: StreamEvent[][];
  topicId?: string | null;
  itemId?: string | null;
  assignmentId?: string | null;
  ladePunktMitBlaettern?: TutorSessionDeps["ladePunktMitBlaettern"];
  ladePlan?: TutorSessionDeps["ladePlan"];
  sicherheitAusFazit?: TutorSessionDeps["sicherheitAusFazit"];
  readSubjectFile?: TutorSessionDeps["readSubjectFile"];
}): {
  deps: TutorSessionDeps;
  messages: TutorMessageDTO[];
  getErgebnis: () => TutorErgebnis | null;
} {
  let idCounter = 0;
  const messages: TutorMessageDTO[] = [];
  let conversation: TutorConversationDTO = {
    id: CONVERSATION_ID,
    topicId: opts.topicId !== undefined ? opts.topicId : TOPIC_ID,
    subjectId: SUBJECT_ID,
    modus: opts.modus ?? "lernen",
    cardId: null,
    itemId: opts.itemId ?? null,
    assignmentId: opts.assignmentId ?? null,
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
    ...(opts.ladePunktMitBlaettern ? { ladePunktMitBlaettern: opts.ladePunktMitBlaettern } : {}),
    ...(opts.ladePlan ? { ladePlan: opts.ladePlan } : {}),
    ...(opts.sicherheitAusFazit ? { sicherheitAusFazit: opts.sicherheitAusFazit } : {}),
    ...(opts.readSubjectFile ? { readSubjectFile: opts.readSubjectFile } : {}),
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
            titel: "Übung",
            aufgaben: [1, 2, 3, 4, 5].map((nr) => ({ nr, text: `Aufgabe ${nr}`, schwierigkeit: 1 })),
          }),
        ],
        [toolCallEvent("aufgabe_ergebnis", { nr: 1, status: "richtig" })],
        [{ type: "text", delta: "Aufgabe 2: Löse x^2 = 4." }],
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

  it("(d) offenes Widget ohne tool-Zeile gefolgt von einer user-Zeile: wird zur synthetischen tool-Nachricht, keine eigene user-Nachricht", async () => {
    const { deps, messages } = makeDeps({ rounds: [[{ type: "text", delta: "Ok, hier das Fazit." }]] });

    // Verlauf wie nach "Bitte das Fazit" bei noch offenem Widget: der Client
    // hat trotz offenem frage_auswahl-Widget getippt, statt submitWidgetAntwort
    // aufzurufen.
    messages.push(
      {
        id: "m1",
        conversationId: CONVERSATION_ID,
        role: "assistant",
        content: "",
        toolName: "frage_auswahl",
        toolArgs: { frage: "Wie sicher fühlst du dich?", optionen: ["Sicher", "Unsicher"], mehrfach: false },
        toolResult: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "m2",
        conversationId: CONVERSATION_ID,
        role: "user",
        content: "Bitte das Fazit",
        toolName: null,
        toolArgs: null,
        toolResult: null,
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    );

    let captured: ChatMessage[] | undefined;
    const originalStreamChat = deps.streamChat;
    deps.streamChat = ((msgs: ChatMessage[], ...rest: unknown[]) => {
      captured = msgs;
      return (originalStreamChat as (...a: unknown[]) => AsyncGenerator<StreamEvent>)(msgs, ...rest);
    }) as unknown as TutorSessionDeps["streamChat"];

    const events = [];
    for await (const e of runTutorTurn(CONVERSATION_ID, undefined, deps)) events.push(e);

    expect(events.map((e) => e.type)).toEqual(["text", "done"]);
    expect(captured).toBeDefined();

    const toolCallIndex = captured!.findIndex((m) => m.role === "assistant" && m.tool_calls?.[0]?.function.name === "frage_auswahl");
    expect(toolCallIndex).toBeGreaterThan(-1);
    const toolResultMessage = captured![toolCallIndex + 1];
    expect(toolResultMessage.role).toBe("tool");
    expect(JSON.parse((toolResultMessage as { content: string }).content)).toEqual({ auswahl: [], text: "Bitte das Fazit" });
    expect(captured!.some((m) => m.role === "user")).toBe(false);
  });

  it("(e) erster Turn ohne Verlauf schickt einen Startimpuls als user-Nachricht (API verlangt mindestens eine)", async () => {
    const { deps } = makeDeps({
      rounds: [[toolCallEvent("frage_auswahl", { frage: "Was weißt du?", optionen: ["Viel", "Wenig"], mehrfach: false })]],
    });

    let captured: ChatMessage[] | undefined;
    const originalStreamChat = deps.streamChat;
    deps.streamChat = ((msgs: ChatMessage[], ...rest: unknown[]) => {
      captured = [...msgs]; // Kopie: das Array wird nach der Runde weiter befuellt
      return (originalStreamChat as (...a: unknown[]) => AsyncGenerator<StreamEvent>)(msgs, ...rest);
    }) as unknown as TutorSessionDeps["streamChat"];

    const events = [];
    for await (const e of runTutorTurn(CONVERSATION_ID, undefined, deps)) events.push(e);

    expect(events.map((e) => e.type)).toEqual(["widget", "done"]);
    expect(captured!.length).toBe(2);
    expect(captured![0].role).toBe("system");
    expect(captured![1].role).toBe("user");
  });

  it("(f, A15) fazit mit itemId und modus probe ruft den Fazit-Hook mit (itemId, prozent, undefined) auf", async () => {
    const sicherheitAusFazit = vi.fn(async () => {});
    const { deps } = makeDeps({
      modus: "probe",
      itemId: ITEM_ID,
      sicherheitAusFazit,
      ladePunktMitBlaettern: vi.fn(async () => null),
      rounds: [[toolCallEvent("fazit", { gutWar: [], schwach: [], neueKarten: [], punkte: 7, gesamt: 10 })]],
    });

    const events = [];
    for await (const e of runTutorTurn(CONVERSATION_ID, undefined, deps)) events.push(e);

    expect(events.map((e) => e.type)).toEqual(["fazit", "done"]);
    expect(sicherheitAusFazit).toHaveBeenCalledWith(ITEM_ID, 70, undefined);
  });

  it("(f, A15) ein Fehler im Fazit-Hook bricht den Turn nicht ab", async () => {
    const sicherheitAusFazit = vi.fn(async () => {
      throw new Error("db weg");
    });
    const { deps } = makeDeps({
      modus: "probe",
      itemId: ITEM_ID,
      sicherheitAusFazit,
      ladePunktMitBlaettern: vi.fn(async () => null),
      rounds: [[toolCallEvent("fazit", { gutWar: [], schwach: [], neueKarten: [], punkte: 7, gesamt: 10 })]],
    });

    const events = [];
    for await (const e of runTutorTurn(CONVERSATION_ID, undefined, deps)) events.push(e);

    expect(events.map((e) => e.type)).toEqual(["fazit", "done"]);
    expect(sicherheitAusFazit).toHaveBeenCalled();
  });

  it("(g, A16) mit itemId enthält der System-Prompt die Arbeitsblätter des Punkts", async () => {
    const ladePunktMitBlaettern = vi.fn(async () => ({
      punkt: makePunkt(),
      blaetter: [{ id: FILE_ID, name: "Zettel.pdf" }],
      plan: makePlan([makePunkt()]),
    }));
    const readSubjectFile = vi.fn(async () => ({
      file: { id: FILE_ID, name: "Zettel.pdf", contentType: "application/pdf" },
      content: { kind: "text" as const, text: "Inhalt des gestubbten PDFs." },
    }));

    const { deps } = makeDeps({
      itemId: ITEM_ID,
      ladePunktMitBlaettern,
      readSubjectFile,
      rounds: [[toolCallEvent("frage_auswahl", { frage: "Was weißt du?", optionen: ["Viel", "Wenig"], mehrfach: false })]],
    });

    let captured: ChatMessage[] | undefined;
    const originalStreamChat = deps.streamChat;
    deps.streamChat = ((msgs: ChatMessage[], ...rest: unknown[]) => {
      captured = msgs;
      return (originalStreamChat as (...a: unknown[]) => AsyncGenerator<StreamEvent>)(msgs, ...rest);
    }) as unknown as TutorSessionDeps["streamChat"];

    const events = [];
    for await (const e of runTutorTurn(CONVERSATION_ID, undefined, deps)) events.push(e);
    expect(events.map((e) => e.type)).toEqual(["widget", "done"]);

    const system = captured!.find((m) => m.role === "system");
    expect(system?.content).toContain("Arbeitsblätter zu diesem Punkt");
    expect(system?.content).toContain("Inhalt des gestubbten PDFs.");
  });

  it("(h) Simulation: der Prompt listet alle Punkt-Titel und die Anweisung je Punkt eine Frage zu stellen; fazit mit punktePlan geht an den Hook", async () => {
    const sicherheitAusFazit = vi.fn(async () => {});
    const ladePlan = vi.fn(async () =>
      makePlan([makePunkt({ id: "p1", titel: "Bruchrechnen" }), makePunkt({ id: "p2", titel: "Gleichungen", blaetter: [] })]),
    );

    const { deps } = makeDeps({
      modus: "probe",
      topicId: null,
      itemId: ITEM_ID,
      assignmentId: ASSIGNMENT_ID,
      ladePlan,
      sicherheitAusFazit,
      ladePunktMitBlaettern: vi.fn(async () => null),
      rounds: [
        [
          toolCallEvent("fazit", {
            gutWar: [],
            schwach: [],
            neueKarten: [],
            punktePlan: [
              { pointId: "p1", prozent: 60 },
              { pointId: "p2", prozent: 80 },
            ],
          }),
        ],
      ],
    });

    let captured: ChatMessage[] | undefined;
    const originalStreamChat = deps.streamChat;
    deps.streamChat = ((msgs: ChatMessage[], ...rest: unknown[]) => {
      captured = msgs;
      return (originalStreamChat as (...a: unknown[]) => AsyncGenerator<StreamEvent>)(msgs, ...rest);
    }) as unknown as TutorSessionDeps["streamChat"];

    const events = [];
    for await (const e of runTutorTurn(CONVERSATION_ID, undefined, deps)) events.push(e);
    expect(events.map((e) => e.type)).toEqual(["fazit", "done"]);

    const system = captured!.find((m) => m.role === "system");
    expect(system?.content).toContain("Bruchrechnen");
    expect(system?.content).toContain("Gleichungen");
    expect(system?.content).toContain("zu jedem Punkt der Liste mindestens eine Aufgabe");

    expect(sicherheitAusFazit).toHaveBeenCalledWith(ITEM_ID, 70, [
      { pointId: "p1", prozent: 60 },
      { pointId: "p2", prozent: 80 },
    ]);
  });

  it("(h2) Simulation-Fazit setzt punkte/gesamt nicht und rechnet die Note aus dem Durchschnitt der punktePlan-Einträge", async () => {
    const ladePlan = vi.fn(async () =>
      makePlan([makePunkt({ id: "p1", titel: "Bruchrechnen" }), makePunkt({ id: "p2", titel: "Gleichungen", blaetter: [] })]),
    );

    const { deps, getErgebnis } = makeDeps({
      modus: "probe",
      topicId: null,
      itemId: ITEM_ID,
      assignmentId: ASSIGNMENT_ID,
      ladePlan,
      ladePunktMitBlaettern: vi.fn(async () => null),
      rounds: [
        [
          toolCallEvent("fazit", {
            gutWar: [],
            schwach: [],
            neueKarten: [],
            punktePlan: [
              { pointId: "p1", prozent: 60 },
              { pointId: "p2", prozent: 80 },
            ],
          }),
        ],
      ],
    });

    const events = [];
    for await (const e of runTutorTurn(CONVERSATION_ID, undefined, deps)) events.push(e);
    expect(events.map((e) => e.type)).toEqual(["fazit", "done"]);

    const ergebnis = getErgebnis();
    expect(ergebnis?.prozent).toBe(70);
    expect(ergebnis?.note).toBe(noteFuerProzent(70));
    expect(ergebnis?.punkte).toBeUndefined();
    expect(ergebnis?.gesamt).toBeUndefined();
  });
});
