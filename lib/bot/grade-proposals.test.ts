import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { botConversations, botMessages, grades, subjects } from "@/lib/db/schema";
import { decideGradeProposal } from "./grade-proposals";

// Transaktionen und parallele Bestätigung nur in expliziter lokaler Test-DB.
const localDb = /^postgres(?:ql)?:\/\/[^/]*@(127\.0\.0\.1|localhost):\d+\//.test(process.env.DATABASE_URL ?? "");
describe.skipIf(process.env.ATLAS_TEST_DB !== "1" || !localDb)("Notenvorschläge (lokale Integration)", () => {
  let subjectId: string;
  let conversationId: string;
  let messageId: string;
  let proposal: Record<string, unknown>;

  beforeEach(async () => {
    const [subject] = await db.insert(subjects).values({ name: "TST-Bot-Notenvorschlag" }).returning();
    subjectId = subject.id;
    const [conversation] = await db.insert(botConversations).values({ title: "TST-Notenvorschlag" }).returning();
    conversationId = conversation.id;
    proposal = { subjectId, fach: subject.name, punkte: 12, art: "written", bezeichnung: "Test", datum: "2026-09-07", gewicht: 1 };
    const [message] = await db.insert(botMessages).values({
      conversationId, role: "tool", toolName: "note_vorschlagen", toolResult: { proposalVersion: 1, vorschlag: proposal },
    }).returning();
    messageId = message.id;
  });

  afterEach(async () => {
    await db.delete(botConversations).where(eq(botConversations.id, conversationId));
    await db.delete(subjects).where(eq(subjects.id, subjectId));
  });

  it("legt bei parallelen und wiederholten Bestätigungen genau eine Note an", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => decideGradeProposal(messageId, "accept")));
    expect(results.every((r) => r.state === "entered")).toBe(true);
    expect(new Set(results.map((r) => r.gradeId)).size).toBe(1);
    const rows = await db.select().from(grades).where(eq(grades.subjectId, subjectId));
    expect(rows).toHaveLength(1);
    const [message] = await db.select().from(botMessages).where(eq(botMessages.id, messageId));
    expect(message.toolResult).toMatchObject({ entscheidung: { state: "entered", gradeId: rows[0].id } });
    expect(await decideGradeProposal(messageId, "discard")).toEqual(results[0]);
  });

  it("bewahrt Verwerfen nach erneutem Laden und späterer Bestätigung", async () => {
    expect(await decideGradeProposal(messageId, "discard")).toEqual({ state: "discarded" });
    expect(await decideGradeProposal(messageId, "accept")).toEqual({ state: "discarded" });
    expect(await db.select().from(grades).where(eq(grades.subjectId, subjectId))).toHaveLength(0);
  });

  it("verhindert bei alten Vorschlägen mit passender Note einen unsicheren Doppeleintrag", async () => {
    await db.update(botMessages).set({ toolResult: { vorschlag: proposal } }).where(eq(botMessages.id, messageId));
    await db.insert(grades).values({ subjectId, points: 12, kind: "written", label: "Test", date: "2026-09-07", weight: 1 });
    await expect(decideGradeProposal(messageId, "accept")).rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(grades).where(eq(grades.subjectId, subjectId))).toHaveLength(1);
  });

  it("lässt eigenständige neue Vorschläge trotz gleicher Notenwerte zu", async () => {
    await db.insert(grades).values({ subjectId, points: 12, kind: "written", label: "Test", date: "2026-09-07", weight: 1 });
    expect((await decideGradeProposal(messageId, "accept")).state).toBe("entered");
    expect(await db.select().from(grades).where(eq(grades.subjectId, subjectId))).toHaveLength(2);
  });

  it("schreibt bei ungültigem Vorschlag weder Note noch Entscheidung", async () => {
    await db.update(botMessages).set({ toolResult: { proposalVersion: 1, vorschlag: { ...proposal, punkte: 100 } } }).where(eq(botMessages.id, messageId));
    await expect(decideGradeProposal(messageId, "accept")).rejects.toMatchObject({ status: 400 });
    expect(await db.select().from(grades).where(eq(grades.subjectId, subjectId))).toHaveLength(0);
    const [message] = await db.select().from(botMessages).where(eq(botMessages.id, messageId));
    expect(message.toolResult).not.toHaveProperty("entscheidung");
  });

  it("nimmt keine andere Werkzeugnachricht als Notenvorschlag an", async () => {
    await db.update(botMessages).set({ toolName: "aufgabe_anlegen" }).where(eq(botMessages.id, messageId));
    await expect(decideGradeProposal(messageId, "accept")).rejects.toMatchObject({ status: 404 });
  });
});
