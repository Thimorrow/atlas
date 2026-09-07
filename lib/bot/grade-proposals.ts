import { and, eq } from "drizzle-orm";
import { withTransaction } from "@/lib/db";
import { botMessages, grades, subjects } from "@/lib/db/schema";
import { parseNewGrade } from "@/lib/grade-store";
import { isObj, isUuid } from "@/lib/subject-store";
import { proposalDecision, type ProposalDecision } from "./proposal-state";

export class GradeProposalError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function decideGradeProposal(
  messageId: string,
  decision: "accept" | "discard",
): Promise<ProposalDecision> {
  return withTransaction(async (tx) => {
    // Dieselbe Nachricht sperren: auch zwei Tabs dürfen nur einmal bestätigen.
    const [message] = await tx.select().from(botMessages)
      .where(eq(botMessages.id, messageId)).for("update");
    if (!message || message.role !== "tool" || message.toolName !== "note_vorschlagen" ||
      !isObj(message.toolResult) || !isObj(message.toolResult.vorschlag)) {
      throw new GradeProposalError(404, "Notenvorschlag nicht gefunden.");
    }

    const previous = proposalDecision(message.toolResult);
    if (previous) return previous;

    let result: ProposalDecision = { state: "discarded" };
    if (decision === "accept") {
      const p = message.toolResult.vorschlag;
      if (typeof p.subjectId !== "string" || !isUuid(p.subjectId)) {
        throw new GradeProposalError(400, "Der Vorschlag ist keinem gültigen Fach zugeordnet.");
      }
      const parsed = parseNewGrade({
        points: p.punkte, label: p.bezeichnung, kind: p.art, date: p.datum, weight: p.gewicht,
      }, p.subjectId);
      if (!parsed.ok) throw new GradeProposalError(400, parsed.error);
      const [subject] = await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, p.subjectId));
      if (!subject) throw new GradeProposalError(404, "Fach nicht gefunden.");

      // Alte Clients haben die Bestätigung nicht gespeichert. Eine passende
      // Note ist kein Beweis dafür, daher nicht zuordnen oder erneut anlegen.
      if (message.toolResult.proposalVersion !== 1) {
        const g = parsed.value;
        const [existing] = await tx.select({ id: grades.id }).from(grades).where(and(
          eq(grades.subjectId, g.subjectId), eq(grades.points, g.points),
          eq(grades.kind, g.kind ?? "written"), eq(grades.label, g.label),
          eq(grades.date, g.date), eq(grades.weight, g.weight ?? 1),
        )).limit(1);
        if (existing) {
          throw new GradeProposalError(409, "Zu diesem älteren Vorschlag gibt es bereits eine passende Note. Prüfe sie im Fach, bevor du eine weitere einträgst.");
        }
      }

      const [grade] = await tx.insert(grades).values(parsed.value).returning({ id: grades.id });
      result = { state: "entered", gradeId: grade.id };
    }

    await tx.update(botMessages).set({ toolResult: { ...message.toolResult, entscheidung: result } })
      .where(eq(botMessages.id, messageId));
    return result;
  });
}
