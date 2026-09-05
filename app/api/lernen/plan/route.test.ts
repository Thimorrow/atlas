import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/lernplan-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lernplan-store")>("@/lib/lernplan-store");
  return { ...actual, planAnlegen: vi.fn() };
});

import { POST } from "@/app/api/lernen/plan/route";
import { LernplanStoreFehler, planAnlegen } from "@/lib/lernplan-store";

const ASSIGNMENT_ID = "11111111-1111-1111-1111-111111111111";
const FILE_ID = "33333333-3333-3333-3333-333333333333";

function gueltigerPunkt(overrides: Record<string, unknown> = {}) {
  return { titel: "Bruchrechnung", detail: "", seiten: null, fileIds: [], minuten: 30, frage: null, musterantwort: null, ...overrides };
}

function gueltigerBody(overrides: Record<string, unknown> = {}) {
  return {
    assignmentId: ASSIGNMENT_ID,
    checklist: { text: "Checkliste" },
    fileIds: [],
    minutesWeekday: 30,
    minutesWeekend: 60,
    punkte: [gueltigerPunkt()],
    checks: null,
    ersetzen: false,
    ...overrides,
  };
}

function req(body: unknown) {
  return new Request("http://localhost/api/lernen/plan", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/lernen/plan -- Validierung", () => {
  it("ungültige assignmentId -> 400", async () => {
    const res = await POST(req(gueltigerBody({ assignmentId: "keine-uuid" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("assignmentId");
  });

  it("checklist ohne fileId/text -> 400", async () => {
    const res = await POST(req(gueltigerBody({ checklist: {} })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("checklist");
  });

  it("checklist mit fileId UND text -> 400", async () => {
    const res = await POST(req(gueltigerBody({ checklist: { fileId: FILE_ID, text: "x" } })));
    expect(res.status).toBe(400);
  });

  it("fileIds mit ungültiger UUID -> 400", async () => {
    const res = await POST(req(gueltigerBody({ fileIds: ["keine-uuid"] })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("fileIds");
  });

  it("mehr als 20 fileIds -> 400", async () => {
    const res = await POST(req(gueltigerBody({ fileIds: Array.from({ length: 21 }, () => FILE_ID) })));
    expect(res.status).toBe(400);
  });

  it("minutesWeekday außerhalb 10..240 -> 400", async () => {
    const res = await POST(req(gueltigerBody({ minutesWeekday: 5 })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("minutesWeekday");
  });

  it("minutesWeekday keine Ganzzahl -> 400", async () => {
    const res = await POST(req(gueltigerBody({ minutesWeekday: 30.5 })));
    expect(res.status).toBe(400);
  });

  it("minutesWeekend außerhalb 10..240 -> 400", async () => {
    const res = await POST(req(gueltigerBody({ minutesWeekend: 300 })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("minutesWeekend");
  });

  it("punkte leer -> 400 mit eigenem Code", async () => {
    const res = await POST(req(gueltigerBody({ punkte: [] })));
    expect(res.status).toBe(400);
    // Nicht "punkte" (das ist der kaputte Punkt) und nicht "keine_punkte"
    // (das ist der Lese-Schritt in lernplan-generieren.ts) -- drei Faelle,
    // drei Codes, drei Texte in FEHLER_TEXT.
    expect((await res.json()).error).toBe("plan_ohne_punkte");
  });

  it("mehr als 20 punkte -> 400", async () => {
    const res = await POST(req(gueltigerBody({ punkte: Array.from({ length: 21 }, () => gueltigerPunkt()) })));
    expect(res.status).toBe(400);
  });

  it("punkt-titel zu lang -> 400", async () => {
    const res = await POST(req(gueltigerBody({ punkte: [gueltigerPunkt({ titel: "x".repeat(201) })] })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("punkte");
  });

  it("punkt-minuten außerhalb 10..90 -> 400", async () => {
    const res = await POST(req(gueltigerBody({ punkte: [gueltigerPunkt({ minuten: 5 })] })));
    expect(res.status).toBe(400);
  });

  it("punkt-fileIds mit ungültiger UUID -> 400", async () => {
    const res = await POST(req(gueltigerBody({ punkte: [gueltigerPunkt({ fileIds: ["keine-uuid"] })] })));
    expect(res.status).toBe(400);
  });

  it("checks kein Array (und nicht null) -> 400", async () => {
    const res = await POST(req(gueltigerBody({ checks: "nein" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("checks");
  });

  it("checks mit ungültigem urteil -> 400", async () => {
    const res = await POST(
      req(gueltigerBody({ checks: [{ frage: "f", musterantwort: "m", antwort: "a", urteil: "vielleicht", feedback: "" }] })),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("checks");
  });

  it("checks: null ist gültig (ohne Test planen)", async () => {
    vi.mocked(planAnlegen).mockResolvedValue({
      plan: { id: "p", assignmentId: ASSIGNMENT_ID } as never,
      createdTopicIds: [],
    });
    const res = await POST(req(gueltigerBody({ checks: null })));
    expect(res.status).toBe(200);
    expect(planAnlegen).toHaveBeenCalledWith(expect.objectContaining({ checks: null }), expect.anything());
  });

  it("glücklicher Pfad ruft planAnlegen auf und gibt 200", async () => {
    vi.mocked(planAnlegen).mockResolvedValue({
      plan: { id: "p", assignmentId: ASSIGNMENT_ID } as never,
      createdTopicIds: ["t1"],
    });
    const res = await POST(req(gueltigerBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.createdTopicIds).toEqual(["t1"]);
  });

  it("LernplanStoreFehler wird in Status+Code übersetzt (409 bei Doppel-Submit)", async () => {
    vi.mocked(planAnlegen).mockRejectedValue(new LernplanStoreFehler(409, "plan_gerade_erstellt", "Plan wurde gerade erstellt."));
    const res = await POST(req(gueltigerBody()));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("plan_gerade_erstellt");
  });
});
