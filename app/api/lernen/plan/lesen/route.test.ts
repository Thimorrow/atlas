import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bot/model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bot/model")>("@/lib/bot/model");
  return { ...actual, botEnabled: vi.fn(() => true) };
});
vi.mock("@/lib/assignment-store", () => ({ getAssignment: vi.fn() }));
vi.mock("@/lib/subject-file-store", () => ({ listFiles: vi.fn() }));
vi.mock("@/lib/lernplan-generieren", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lernplan-generieren")>("@/lib/lernplan-generieren");
  return { ...actual, lesen: vi.fn() };
});

import { POST } from "@/app/api/lernen/plan/lesen/route";
import { botEnabled } from "@/lib/bot/model";
import { getAssignment } from "@/lib/assignment-store";
import { listFiles } from "@/lib/subject-file-store";
import { lesen, LernplanGenFehler } from "@/lib/lernplan-generieren";

const ASSIGNMENT_ID = "11111111-1111-1111-1111-111111111111";
const SUBJECT_ID = "22222222-2222-2222-2222-222222222222";
const FILE_ID = "33333333-3333-3333-3333-333333333333";
const FREMDE_FILE_ID = "44444444-4444-4444-4444-444444444444";

function req(body: unknown) {
  return new Request("http://localhost/api/lernen/plan/lesen", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const ASSIGNMENT = {
  id: ASSIGNMENT_ID,
  subjectId: SUBJECT_ID,
  subjectName: "Mathe",
  subjectColor: null,
  type: "exam" as const,
  title: "Klausur",
  notes: null,
  dueDate: "2099-01-01",
  completedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(botEnabled).mockReturnValue(true);
  vi.mocked(getAssignment).mockResolvedValue(ASSIGNMENT);
  vi.mocked(listFiles).mockResolvedValue([{ id: FILE_ID, name: "blatt.pdf", contentType: "application/pdf", pathname: "x", size: 1, createdAt: "2026-01-01" }]);
});

describe("POST /api/lernen/plan/lesen", () => {
  it("Bot aus -> 503", async () => {
    vi.mocked(botEnabled).mockReturnValue(false);
    const res = await POST(req({}));
    expect(res.status).toBe(503);
  });

  it("ungültige assignmentId -> 400", async () => {
    const res = await POST(req({ assignmentId: "keine-uuid", checklist: { text: "x" }, fileIds: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("assignmentId");
  });

  it("checklist ohne fileId und text -> 400", async () => {
    const res = await POST(req({ assignmentId: ASSIGNMENT_ID, checklist: {}, fileIds: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("checklist");
  });

  it("checklist mit fileId UND text -> 400", async () => {
    const res = await POST(req({ assignmentId: ASSIGNMENT_ID, checklist: { fileId: FILE_ID, text: "x" }, fileIds: [] }));
    expect(res.status).toBe(400);
  });

  it("Text über 8000 Zeichen -> 400", async () => {
    const res = await POST(
      req({ assignmentId: ASSIGNMENT_ID, checklist: { text: "x".repeat(8001) }, fileIds: [] }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("checklist");
  });

  it("mehr als 20 fileIds -> 400", async () => {
    const viele = Array.from({ length: 21 }, () => FILE_ID);
    const res = await POST(req({ assignmentId: ASSIGNMENT_ID, checklist: { text: "x" }, fileIds: viele }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("fileIds");
  });

  it("Prüfung nicht gefunden -> 404", async () => {
    vi.mocked(getAssignment).mockResolvedValue(undefined);
    const res = await POST(req({ assignmentId: ASSIGNMENT_ID, checklist: { text: "x" }, fileIds: [] }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("pruefung");
  });

  it("Prüfung ohne Fach -> 400 kein_fach", async () => {
    vi.mocked(getAssignment).mockResolvedValue({ ...ASSIGNMENT, subjectId: null });
    const res = await POST(req({ assignmentId: ASSIGNMENT_ID, checklist: { text: "x" }, fileIds: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("kein_fach");
  });

  it("fremde Datei -> 400 dateien_fremd", async () => {
    const res = await POST(
      req({ assignmentId: ASSIGNMENT_ID, checklist: { text: "x" }, fileIds: [FREMDE_FILE_ID] }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("dateien_fremd");
  });

  it("glücklicher Pfad ruft lesen() auf und gibt 200", async () => {
    vi.mocked(lesen).mockResolvedValue({ entwurf: { checklisteText: "x", punkte: [] } });
    const res = await POST(req({ assignmentId: ASSIGNMENT_ID, checklist: { text: "x" }, fileIds: [FILE_ID] }));
    expect(res.status).toBe(200);
    expect(lesen).toHaveBeenCalledWith(
      { subjectId: SUBJECT_ID, checklist: { text: "x" }, fileIds: [FILE_ID] },
      expect.anything(),
    );
  });

  it("LernplanGenFehler wird in Status+Code übersetzt", async () => {
    vi.mocked(lesen).mockRejectedValue(new LernplanGenFehler(422, "keine_punkte", "Keine Punkte erkannt, Text prüfen."));
    const res = await POST(req({ assignmentId: ASSIGNMENT_ID, checklist: { text: "x" }, fileIds: [] }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("keine_punkte");
    expect(json.hinweis).toContain("prüfen");
  });
});
