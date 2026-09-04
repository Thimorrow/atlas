import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bot/model", () => ({ botEnabled: vi.fn(() => true) }));
vi.mock("@/lib/study-store", () => ({ getCard: vi.fn() }));
vi.mock("@/lib/lernen-generieren", () => ({ bewerteAntwort: vi.fn() }));

import { POST } from "@/app/api/lernen/karten/[id]/bewerten/route";
import { botEnabled } from "@/lib/bot/model";
import { bewerteAntwort } from "@/lib/lernen-generieren";
import { getCard } from "@/lib/study-store";

const CARD_ID = "44444444-4444-4444-4444-444444444444";
const SUBJECT_ID = "22222222-2222-2222-2222-222222222222";

function req(body: unknown) {
  return new Request(`http://localhost/api/lernen/karten/${CARD_ID}/bewerten`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function ctx() {
  return { params: Promise.resolve({ id: CARD_ID }) };
}

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    id: CARD_ID,
    subjectId: SUBJECT_ID,
    topicId: null,
    kind: "wissen" as const,
    question: "F",
    answer: "A",
    source: "manuell" as const,
    sourceRef: null,
    box: 0,
    due: "2026-01-01",
    reviews: 0,
    lapses: 0,
    lastReviewedAt: null,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(botEnabled).mockReturnValue(true);
});

describe("POST /api/lernen/karten/[id]/bewerten", () => {
  it("leer -> 400", async () => {
    const res = await POST(req({ antwort: "  " }), ctx());
    expect(res.status).toBe(400);
  });

  it("vokabel -> 400", async () => {
    vi.mocked(getCard).mockResolvedValue(makeCard({ kind: "vokabel" }));
    const res = await POST(req({ antwort: "Antwort" }), ctx());
    expect(res.status).toBe(400);
  });

  it("Bot aus -> 503", async () => {
    vi.mocked(getCard).mockResolvedValue(makeCard());
    vi.mocked(botEnabled).mockReturnValue(false);
    const res = await POST(req({ antwort: "Antwort" }), ctx());
    expect(res.status).toBe(503);
  });

  it("bewerteAntwort liefert null -> 502", async () => {
    vi.mocked(getCard).mockResolvedValue(makeCard());
    vi.mocked(bewerteAntwort).mockResolvedValue(null);
    const res = await POST(req({ antwort: "Antwort" }), ctx());
    expect(res.status).toBe(502);
  });

  it("happy path -> { urteil, feedback }", async () => {
    vi.mocked(getCard).mockResolvedValue(makeCard());
    vi.mocked(bewerteAntwort).mockResolvedValue({ urteil: "richtig", feedback: "Passt." });
    const res = await POST(req({ antwort: "Antwort" }), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ urteil: "richtig", feedback: "Passt." });
  });
});
