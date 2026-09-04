import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tutor/store", () => ({
  getTutorConversation: vi.fn(),
  markKartenAngelegt: vi.fn(),
}));
vi.mock("@/lib/study-store", () => ({
  createCards: vi.fn(),
}));

import { POST } from "@/app/api/lernen/tutor/[id]/karten/route";
import { createCards } from "@/lib/study-store";
import { getTutorConversation, markKartenAngelegt } from "@/lib/tutor/store";

const CONVERSATION_ID = "33333333-3333-3333-3333-333333333333";
const TOPIC_ID = "11111111-1111-1111-1111-111111111111";
const SUBJECT_ID = "22222222-2222-2222-2222-222222222222";

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION_ID,
    topicId: TOPIC_ID,
    subjectId: SUBJECT_ID,
    modus: "lernen" as const,
    cardId: null,
    checkliste: null,
    ergebnis: null,
    kartenAngelegt: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
    ...overrides,
  };
}

function ctx() {
  return { params: Promise.resolve({ id: CONVERSATION_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/lernen/tutor/[id]/karten", () => {
  it("ohne Fazit -> 400", async () => {
    vi.mocked(getTutorConversation).mockResolvedValue(makeConversation({ ergebnis: null }));
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx());
    expect(res.status).toBe(400);
  });

  it("schon angelegt -> 409", async () => {
    vi.mocked(getTutorConversation).mockResolvedValue(
      makeConversation({
        ergebnis: { gutWar: [], schwach: [], neueKarten: [{ question: "F", answer: "A" }] },
        kartenAngelegt: true,
      }),
    );
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx());
    expect(res.status).toBe(409);
  });

  it("happy path -> 201, createCards mit sourceRef tutor:<id>", async () => {
    vi.mocked(getTutorConversation).mockResolvedValue(
      makeConversation({
        ergebnis: { gutWar: ["Gut"], schwach: ["Schwach"], neueKarten: [{ question: "F", answer: "A" }] },
      }),
    );
    vi.mocked(createCards).mockResolvedValue([
      { id: "c1", subjectId: SUBJECT_ID, topicId: TOPIC_ID, kind: "wissen", question: "F", answer: "A", source: "manuell", sourceRef: `tutor:${CONVERSATION_ID}`, box: 0, due: "2026-01-01", reviews: 0, lapses: 0, lastReviewedAt: null, archivedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);

    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx());
    expect(res.status).toBe(201);
    expect(createCards).toHaveBeenCalledWith(
      SUBJECT_ID,
      [{ question: "F", answer: "A", kind: "wissen" }],
      "manuell",
      `tutor:${CONVERSATION_ID}`,
      TOPIC_ID,
    );
    expect(markKartenAngelegt).toHaveBeenCalledWith(CONVERSATION_ID);
  });
});
