import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/lernplan-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lernplan-store")>("@/lib/lernplan-store");
  return { ...actual, punktPatch: vi.fn() };
});

import { PATCH } from "@/app/api/lernen/plan/points/[id]/route";
import { LernplanStoreFehler, punktPatch } from "@/lib/lernplan-store";

const POINT_ID = "11111111-1111-1111-1111-111111111111";
const TOPIC_ID = "22222222-2222-2222-2222-222222222222";

function req(body: unknown) {
  return new Request(`http://localhost/api/lernen/plan/points/${POINT_ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function ctx() {
  return { params: Promise.resolve({ id: POINT_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/lernen/plan/points/[id]", () => {
  it("topicId wird durchgereicht und der gepatchte Punkt zurueckgegeben", async () => {
    vi.mocked(punktPatch).mockResolvedValue({ id: POINT_ID, topicId: TOPIC_ID } as never);

    const res = await PATCH(req({ topicId: TOPIC_ID }), ctx());

    expect(res.status).toBe(200);
    expect(punktPatch).toHaveBeenCalledWith(POINT_ID, { topicId: TOPIC_ID });
    expect((await res.json()).punkt).toEqual({ id: POINT_ID, topicId: TOPIC_ID });
  });

  it("ungueltige topicId -> 400", async () => {
    const res = await PATCH(req({ topicId: "keine-uuid" }), ctx());
    expect(res.status).toBe(400);
    expect(punktPatch).not.toHaveBeenCalled();
  });

  it("thema_fremd aus dem Store wird als 400 mit Code durchgereicht", async () => {
    vi.mocked(punktPatch).mockRejectedValue(new LernplanStoreFehler(400, "thema_fremd", "Thema gehört nicht zu diesem Fach."));

    const res = await PATCH(req({ topicId: TOPIC_ID }), ctx());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("thema_fremd");
  });

  it("weder cardsState noch topicId -> 400", async () => {
    const res = await PATCH(req({}), ctx());
    expect(res.status).toBe(400);
    expect(punktPatch).not.toHaveBeenCalled();
  });
});
