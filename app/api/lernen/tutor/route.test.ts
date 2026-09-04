import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bot/model", () => ({ botEnabled: vi.fn(() => true) }));
vi.mock("@/lib/tutor/store", () => ({
  createTutorConversation: vi.fn(),
  appendTutorMessage: vi.fn(),
  listTutorConversations: vi.fn(),
}));
vi.mock("@/lib/study-store", () => ({
  getTopic: vi.fn(),
  getCard: vi.fn(),
}));
vi.mock("@/lib/assignment-store", () => ({
  getAssignment: vi.fn(),
}));

import { GET, POST } from "@/app/api/lernen/tutor/route";
import { botEnabled } from "@/lib/bot/model";
import { getCard, getTopic } from "@/lib/study-store";
import { getAssignment } from "@/lib/assignment-store";
import { appendTutorMessage, createTutorConversation, listTutorConversations } from "@/lib/tutor/store";

const TOPIC_ID = "11111111-1111-1111-1111-111111111111";
const SUBJECT_ID = "22222222-2222-2222-2222-222222222222";
const CONVERSATION_ID = "33333333-3333-3333-3333-333333333333";
const ASSIGNMENT_ID = "55555555-5555-5555-5555-555555555555";

function req(body: unknown) {
  return new Request("http://localhost/api/lernen/tutor", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(botEnabled).mockReturnValue(true);
});

describe("POST /api/lernen/tutor", () => {
  it("ohne topicId -> 400", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("mit gültiger UUID aber unbekanntem Thema -> 404", async () => {
    vi.mocked(getTopic).mockResolvedValue(undefined);
    const res = await POST(req({ topicId: TOPIC_ID }));
    expect(res.status).toBe(404);
  });

  it("Bot aus -> 503", async () => {
    vi.mocked(botEnabled).mockReturnValue(false);
    const res = await POST(req({ topicId: TOPIC_ID }));
    expect(res.status).toBe(503);
  });

  it("glücklicher Pfad -> 201, createTutorConversation aufgerufen", async () => {
    vi.mocked(getTopic).mockResolvedValue({
      id: TOPIC_ID,
      subjectId: SUBJECT_ID,
      title: "Thema",
      summary: "",
      assignmentId: null,
      position: 0,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    vi.mocked(createTutorConversation).mockResolvedValue({
      id: CONVERSATION_ID,
      topicId: TOPIC_ID,
      subjectId: SUBJECT_ID,
      modus: "lernen",
      cardId: null,
      itemId: null,
      assignmentId: null,
      checkliste: null,
      ergebnis: null,
      kartenAngelegt: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      endedAt: null,
    });

    const res = await POST(req({ topicId: TOPIC_ID }));
    expect(res.status).toBe(201);
    expect(createTutorConversation).toHaveBeenCalledWith({
      topicId: TOPIC_ID,
      subjectId: SUBJECT_ID,
      modus: "lernen",
      cardId: null,
      itemId: null,
      assignmentId: null,
    });
    expect(appendTutorMessage).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.conversation.id).toBe(CONVERSATION_ID);
  });

  it("mit cardId aber unbekannter Karte -> 404", async () => {
    vi.mocked(getTopic).mockResolvedValue({
      id: TOPIC_ID,
      subjectId: SUBJECT_ID,
      title: "Thema",
      summary: "",
      assignmentId: null,
      position: 0,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    vi.mocked(getCard).mockResolvedValue(undefined);
    const cardId = "44444444-4444-4444-4444-444444444444";
    const res = await POST(req({ topicId: TOPIC_ID, cardId }));
    expect(res.status).toBe(404);
  });

  it("prüfung ohne topicId und ohne modus=probe -> 400", async () => {
    const res = await POST(req({ pruefung: ASSIGNMENT_ID }));
    expect(res.status).toBe(400);
  });

  it("prüfung ohne topicId und modus=lernen -> 400", async () => {
    const res = await POST(req({ pruefung: ASSIGNMENT_ID, modus: "lernen" }));
    expect(res.status).toBe(400);
  });

  it("prüfung ohne topicId mit modus=probe -> 201, Store bekommt topicId null und assignmentId", async () => {
    vi.mocked(getAssignment).mockResolvedValue({
      id: ASSIGNMENT_ID,
      subjectId: SUBJECT_ID,
      subjectName: "Mathe",
      subjectColor: null,
      type: "exam",
      title: "Klausur",
      notes: null,
      dueDate: "2026-02-01",
      completedAt: null,
    });
    vi.mocked(createTutorConversation).mockResolvedValue({
      id: CONVERSATION_ID,
      topicId: null,
      subjectId: SUBJECT_ID,
      modus: "probe",
      cardId: null,
      itemId: null,
      assignmentId: ASSIGNMENT_ID,
      checkliste: null,
      ergebnis: null,
      kartenAngelegt: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      endedAt: null,
    });

    const res = await POST(req({ pruefung: ASSIGNMENT_ID, modus: "probe" }));
    expect(res.status).toBe(201);
    expect(createTutorConversation).toHaveBeenCalledWith({
      topicId: null,
      subjectId: SUBJECT_ID,
      modus: "probe",
      cardId: null,
      itemId: null,
      assignmentId: ASSIGNMENT_ID,
    });
  });

  it("prüfung ohne Fach -> 400", async () => {
    vi.mocked(getAssignment).mockResolvedValue({
      id: ASSIGNMENT_ID,
      subjectId: null,
      subjectName: null,
      subjectColor: null,
      type: "exam",
      title: "Klausur",
      notes: null,
      dueDate: "2026-02-01",
      completedAt: null,
    });
    const res = await POST(req({ pruefung: ASSIGNMENT_ID, modus: "probe" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/lernen/tutor", () => {
  it("ohne topicId -> 400", async () => {
    const res = await GET(new Request("http://localhost/api/lernen/tutor"));
    expect(res.status).toBe(400);
  });

  it("mit Checkliste (2 von 3 erledigt) -> checklisteFortschritt", async () => {
    vi.mocked(listTutorConversations).mockResolvedValue([
      {
        id: CONVERSATION_ID,
        topicId: TOPIC_ID,
        subjectId: SUBJECT_ID,
        modus: "lernen",
        cardId: null,
      itemId: null,
      assignmentId: null,
        checkliste: {
          titel: "Übung",
          aufgaben: [
            { nr: 1, text: "A1", schwierigkeit: 1, status: "richtig" },
            { nr: 2, text: "A2", schwierigkeit: 1, status: "falsch" },
            { nr: 3, text: "A3", schwierigkeit: 1, status: "offen" },
          ],
        },
        ergebnis: null,
        kartenAngelegt: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        endedAt: null,
      },
    ]);

    const res = await GET(new Request(`http://localhost/api/lernen/tutor?topicId=${TOPIC_ID}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversations[0].checklisteFortschritt).toEqual({ erledigt: 2, gesamt: 3 });
  });
});
