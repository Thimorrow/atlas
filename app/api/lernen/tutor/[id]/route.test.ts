import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bot/model", () => ({ botEnabled: vi.fn(() => true) }));
vi.mock("@/lib/tutor/store", () => ({
  getTutorConversation: vi.fn(),
  listTutorMessages: vi.fn(),
  appendTutorMessage: vi.fn(),
  deleteTutorConversation: vi.fn(),
}));
vi.mock("@/lib/tutor/session", () => ({
  runTutorTurn: vi.fn(),
  submitWidgetAntwort: vi.fn(),
}));

import { GET, POST } from "@/app/api/lernen/tutor/[id]/route";
import { botEnabled } from "@/lib/bot/model";
import { getTutorConversation, listTutorMessages } from "@/lib/tutor/store";
import { runTutorTurn } from "@/lib/tutor/session";

const CONVERSATION_ID = "33333333-3333-3333-3333-333333333333";
const TOPIC_ID = "11111111-1111-1111-1111-111111111111";
const SUBJECT_ID = "22222222-2222-2222-2222-222222222222";

function baseConversation(overrides: Partial<ReturnType<typeof makeConversation>> = {}) {
  return { ...makeConversation(), ...overrides };
}

function makeConversation() {
  return {
    id: CONVERSATION_ID,
    topicId: TOPIC_ID,
    subjectId: SUBJECT_ID,
    modus: "lernen" as const,
    cardId: null,
      itemId: null,
      assignmentId: null,
    checkliste: null,
    ergebnis: null,
    kartenAngelegt: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null as string | null,
  };
}

function postReq(body: unknown) {
  return new Request(`http://localhost/api/lernen/tutor/${CONVERSATION_ID}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function ctx() {
  return { params: Promise.resolve({ id: CONVERSATION_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(botEnabled).mockReturnValue(true);
  vi.mocked(listTutorMessages).mockResolvedValue([]);
});

describe("POST /api/lernen/tutor/[id]", () => {
  it("message UND widgetAntwort -> 400", async () => {
    vi.mocked(getTutorConversation).mockResolvedValue(baseConversation());
    const res = await POST(postReq({ message: "hi", widgetAntwort: { messageId: CONVERSATION_ID, auswahl: [] } }), ctx());
    expect(res.status).toBe(400);
  });

  it("beendete Session -> 400", async () => {
    vi.mocked(getTutorConversation).mockResolvedValue(baseConversation({ endedAt: "2026-01-02T00:00:00.000Z" }));
    const res = await POST(postReq({ message: "hi" }), ctx());
    expect(res.status).toBe(400);
  });

  it("Bot aus -> 503", async () => {
    vi.mocked(getTutorConversation).mockResolvedValue(baseConversation());
    vi.mocked(botEnabled).mockReturnValue(false);
    const res = await POST(postReq({ message: "hi" }), ctx());
    expect(res.status).toBe(503);
  });

  it("leerer Body bei vorhandenem Verlauf (2 Nachrichten) -> 400", async () => {
    vi.mocked(getTutorConversation).mockResolvedValue(baseConversation());
    vi.mocked(listTutorMessages).mockResolvedValue([
      { id: "m1", conversationId: CONVERSATION_ID, role: "assistant", content: "hi", toolName: null, toolArgs: null, toolResult: null, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "m2", conversationId: CONVERSATION_ID, role: "user", content: "hi", toolName: null, toolArgs: null, toolResult: null, createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const res = await POST(postReq({}), ctx());
    expect(res.status).toBe(400);
  });

  it("leerer Body ohne Verlauf -> 200 mit application/x-ndjson und done im Stream", async () => {
    vi.mocked(getTutorConversation).mockResolvedValue(baseConversation());
    vi.mocked(listTutorMessages).mockResolvedValue([]);
    vi.mocked(runTutorTurn).mockImplementation((async function* () {
      yield { type: "done", conversationId: CONVERSATION_ID };
    }) as unknown as typeof runTutorTurn);

    const res = await POST(postReq({}), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
    const text = await res.text();
    expect(text).toContain('"type":"done"');
  });
});

describe("GET /api/lernen/tutor/[id]", () => {
  it("unbekannte Session -> 404", async () => {
    vi.mocked(getTutorConversation).mockResolvedValue(undefined);
    const res = await GET(new Request(`http://localhost/api/lernen/tutor/${CONVERSATION_ID}`), ctx());
    expect(res.status).toBe(404);
  });
});
