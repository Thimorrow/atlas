import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ decide: vi.fn() }));
vi.mock("@/lib/bot/grade-proposals", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/bot/grade-proposals")>();
  return { ...original, decideGradeProposal: mocks.decide };
});
import { POST } from "./route";
import { GradeProposalError } from "@/lib/bot/grade-proposals";

const id = "11111111-1111-4111-8111-111111111111";
const request = (body: unknown) => new Request("http://localhost/api/bot/proposals/" + id, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
describe("Notenvorschlag bestätigen", () => {
  beforeEach(() => { mocks.decide.mockReset(); });
  it("verwendet den gespeicherten Vorschlag statt vom Client übermittelter Notenwerte", async () => {
    mocks.decide.mockResolvedValue({ state: "entered", gradeId: "grade-1" });
    const response = await POST(request({ decision: "accept", points: 15 }), { params: Promise.resolve({ id }) });
    expect(await response.json()).toEqual({ state: "entered", gradeId: "grade-1" });
    expect(mocks.decide).toHaveBeenCalledExactlyOnceWith(id, "accept");
  });
  it("weist ungültige Entscheidungen vor dem Datenbankzugriff ab", async () => {
    const response = await POST(request({ decision: "save" }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(400);
    expect(mocks.decide).not.toHaveBeenCalled();
  });
  it("liefert Konflikte für Altvorschläge als verständliche 409", async () => {
    mocks.decide.mockRejectedValue(new GradeProposalError(409, "Passende Note vorhanden."));
    const response = await POST(request({ decision: "accept" }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Passende Note vorhanden." });
  });
});
