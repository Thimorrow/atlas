export type ProposalDecision = { state: "entered" | "discarded"; gradeId?: string };

// Bleibt client-sicher: der gespeicherte Zustand gehört zur Werkzeugnachricht.
export function proposalDecision(result: unknown): ProposalDecision | null {
  if (!result || typeof result !== "object" || !("entscheidung" in result)) return null;
  const decision = result.entscheidung;
  if (!decision || typeof decision !== "object" || !("state" in decision)) return null;
  if (decision.state === "discarded") return { state: "discarded" };
  if (decision.state === "entered" && "gradeId" in decision && typeof decision.gradeId === "string") {
    return { state: "entered", gradeId: decision.gradeId };
  }
  return null;
}
