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

import { GET, POST } from "@/app/api/lernen/tutor/route";
import { botEnabled } from "@/lib/bot/model";
import { getCard, getTopic } from "@/lib/study-store";
import { appendTutorMessage, createTutorConversation, listTutorConversations } from "@/lib/tutor/store";

const TOPIC_ID = "11111111-1111-1111-1111-111111111111";
const SUBJECT_ID = "22222222-2222-2222-2222-222222222222";
const CONVERSATION_ID = "33333333-3333-3333-3333-333333333333";

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

  it("mit gueltiger UUID aber unbekanntem Thema -> 404", async () => {
    vi.mocked(getTopic).mockResolvedValue(undefined);
    const res = await POST(req({ topicId: TOPIC_ID }));
    expect(res.status).toBe(404);
  });

  it("Bot aus -> 503", async () => {
    vi.mocked(botEnabled).mockReturnValue(false);
    const res = await POST(req({ topicId: TOPIC_ID }));
    expect(res.status).toBe(503);
  });

  it("gluecklicher Pfad -> 201, createTutorConversation aufgerufen", async () => {
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
        checkliste: {
          titel: "Uebung",
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
