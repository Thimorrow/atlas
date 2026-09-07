import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/tutor/store", () => ({ saveProposedTutorCards: vi.fn() }));
vi.mock("@/lib/lernplan-store", () => ({ aktualisiereAusKarten: vi.fn() }));
import { POST } from "./route";
import { saveProposedTutorCards } from "@/lib/tutor/store";
import { aktualisiereAusKarten } from "@/lib/lernplan-store";
const id = "33333333-3333-3333-3333-333333333333";
beforeEach(() => vi.clearAllMocks());
describe("Tutor-Kartenroute", () => {
  it.each([400, 404, 409])("übernimmt den atomaren Fehlerstatus %s", async (status) => {
    vi.mocked(saveProposedTutorCards).mockResolvedValue({ status, error: "Fehler" });
    const result = await POST(new Request("http://localhost"), { params: Promise.resolve({ id }) });
    expect(result.status).toBe(status);
    expect(aktualisiereAusKarten).not.toHaveBeenCalled();
  });
  it("speichert über genau einen atomaren Vorgang", async () => {
    vi.mocked(saveProposedTutorCards).mockResolvedValue({ status: 201, cards: [], topicId: "topic" });
    const result = await POST(new Request("http://localhost"), { params: Promise.resolve({ id }) });
    expect(result.status).toBe(201);
    expect(saveProposedTutorCards).toHaveBeenCalledExactlyOnceWith(id);
    expect(aktualisiereAusKarten).toHaveBeenCalledWith("topic", true);
  });
});
