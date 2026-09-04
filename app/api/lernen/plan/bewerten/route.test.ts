import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bot/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bot/model")>("@/lib/bot/model");
  return { ...actual, botEnabled: vi.fn(() => true) };
});
vi.mock("@/lib/lernplan-generieren", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lernplan-generieren")>("@/lib/lernplan-generieren");
  return { ...actual, bewerten: vi.fn() };
});

import { POST } from "@/app/api/lernen/plan/bewerten/route";
import { botEnabled } from "@/lib/bot/model";
import { bewerten, LernplanGenFehler } from "@/lib/lernplan-generieren";

const SUBJECT_ID = "22222222-2222-2222-2222-222222222222";

function req(body: unknown) {
  return new Request("http://localhost/api/lernen/plan/bewerten", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(botEnabled).mockReturnValue(true);
});

describe("POST /api/lernen/plan/bewerten", () => {
  it("Bot aus -> 503", async () => {
    vi.mocked(botEnabled).mockReturnValue(false);
    const res = await POST(req({}));
    expect(res.status).toBe(503);
  });

  it("ungültige subjectId -> 400", async () => {
    const res = await POST(req({ subjectId: "x", antworten: [{ frage: "f", musterantwort: "m", antwort: "a" }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("subjectId");
  });

  it("leeres antworten -> 400", async () => {
    const res = await POST(req({ subjectId: SUBJECT_ID, antworten: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("antworten");
  });

  it("mehr als 20 antworten -> 400", async () => {
    const viele = Array.from({ length: 21 }, () => ({ frage: "f", musterantwort: "m", antwort: "a" }));
    const res = await POST(req({ subjectId: SUBJECT_ID, antworten: viele }));
    expect(res.status).toBe(400);
  });

  it("antwort über 500 Zeichen -> 400", async () => {
    const res = await POST(
      req({ subjectId: SUBJECT_ID, antworten: [{ frage: "f", musterantwort: "m", antwort: "a".repeat(501) }] }),
    );
    expect(res.status).toBe(400);
  });

  it("richtig, Unsinn, null -> drei Urteile, null wird als Übersprungen gesendet", async () => {
    vi.mocked(bewerten).mockResolvedValue([
      { urteil: "richtig", feedback: "Passt." },
      { urteil: "falsch", feedback: "Nein." },
      { urteil: "falsch", feedback: "Übersprungen" },
    ]);
    const res = await POST(
      req({
        subjectId: SUBJECT_ID,
        antworten: [
          { frage: "f1", musterantwort: "m1", antwort: "richtig" },
          { frage: "f2", musterantwort: "m2", antwort: "Banane" },
          { frage: "f3", musterantwort: "m3", antwort: null },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(3);
    expect(json.map((u: { urteil: string }) => u.urteil)).toEqual(["richtig", "falsch", "falsch"]);
    expect(bewerten).toHaveBeenCalledWith(
      { subjectId: SUBJECT_ID, antworten: expect.arrayContaining([expect.objectContaining({ antwort: null })]) },
      expect.anything(),
    );
  });

  it("LernplanGenFehler wird in Status+Code übersetzt", async () => {
    vi.mocked(bewerten).mockRejectedValue(new LernplanGenFehler(502, "modell"));
    const res = await POST(
      req({ subjectId: SUBJECT_ID, antworten: [{ frage: "f", musterantwort: "m", antwort: "a" }] }),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("modell");
  });
});
