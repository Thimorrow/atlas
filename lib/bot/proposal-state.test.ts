import { describe, expect, it } from "vitest";
import { proposalDecision } from "./proposal-state";

describe("gespeicherte Notenentscheidung", () => {
  it("liest Eintragen und Verwerfen aus der Werkzeugnachricht", () => {
    expect(proposalDecision({ entscheidung: { state: "entered", gradeId: "grade-1" } })).toEqual({ state: "entered", gradeId: "grade-1" });
    expect(proposalDecision({ entscheidung: { state: "discarded" } })).toEqual({ state: "discarded" });
  });
  it("erfindet keinen Status für alte oder unvollständige Ergebnisse", () => {
    expect(proposalDecision({ vorschlag: {} })).toBeNull();
    expect(proposalDecision({ entscheidung: { state: "entered" } })).toBeNull();
    expect(proposalDecision(null)).toBeNull();
  });
});
