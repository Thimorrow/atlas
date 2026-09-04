import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, subjects, type NewAssignment } from "@/lib/db/schema";
import { localISO } from "@/lib/assignments-view";
import {
  createCards,
  deleteCard,
  listCards,
  overview,
  reviewCard,
  subjectDetail,
  updateCard,
} from "@/lib/study-store";

const mitDb = Boolean(process.env.DATABASE_URL);

const SUBJECT_NAME = "TST-Lernen";

async function cleanup() {
  await db.delete(subjects).where(eq(subjects.name, SUBJECT_NAME)); // cascade raeumt study_cards/study_reviews mit
}

describe.skipIf(!mitDb)("study-store (Integration, Neon)", () => {
  let subjectId: string;

  beforeAll(async () => {
    await cleanup();
    const [subject] = await db
      .insert(subjects)
      .values({ name: SUBJECT_NAME, untisSubject: null, curriculum: "## Thema 1" })
      .returning();
    subjectId = subject.id;
  });

  afterAll(cleanup);

  it("createCards legt Karten mit due = heute an", async () => {
    const cards = await createCards(
      subjectId,
      [
        { question: "Frage 1", answer: "Antwort 1" },
        { question: "Frage 2", answer: "Antwort 2" },
      ],
      "manuell",
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].due).toBe(localISO());
    expect(cards[0].box).toBe(0);
    expect(cards[0].source).toBe("manuell");
  });

  it("listCards liefert die angelegten Karten, ohne archivierte per Default", async () => {
    const cards = await listCards(subjectId);
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it("updateCard aendert Frage/Antwort und kann archivieren", async () => {
    const [card] = await listCards(subjectId);
    const updated = await updateCard(card.id, { question: "Neue Frage" });
    expect(updated?.question).toBe("Neue Frage");

    const archived = await updateCard(card.id, { archivedAt: new Date().toISOString() });
    expect(archived?.archivedAt).not.toBeNull();

    const listWithoutArchived = await listCards(subjectId);
    expect(listWithoutArchived.some((c) => c.id === card.id)).toBe(false);

    const listWithArchived = await listCards(subjectId, { includeArchived: true });
    expect(listWithArchived.some((c) => c.id === card.id)).toBe(true);
  });

  it("reviewCard wendet Leitner an und schreibt eine Review-Zeile", async () => {
    const [card] = await listCards(subjectId);
    const before = card.box;

    const correct = await reviewCard(card.id, true);
    expect(correct?.box).toBe(before + 1);
    expect(correct?.reviews).toBe(1);

    const wrong = await reviewCard(card.id, false);
    expect(wrong?.box).toBe(0);
    expect(wrong?.lapses).toBe(1);
    expect(wrong?.reviews).toBe(2);
  });

  it("deleteCard entfernt die Karte", async () => {
    const [created] = await createCards(subjectId, [{ question: "Loeschbar", answer: "Ja" }], "manuell");
    expect(await deleteCard(created.id)).toBe(true);
    const cards = await listCards(subjectId, { includeArchived: true });
    expect(cards.some((c) => c.id === created.id)).toBe(false);
  });

  it("overview listet das Sentinel-Fach auch ohne Pruefung", async () => {
    const result = await overview();
    const entry = result.faecher.find((f) => f.subjectId === subjectId);
    expect(entry).toBeDefined();
    expect(entry?.total).toBeGreaterThan(0);
  });

  it("subjectDetail liefert Fach, Karten, Fortschritt und Lehrplan", async () => {
    const detail = await subjectDetail(subjectId);
    expect(detail).not.toBeNull();
    expect(detail?.subject.name).toBe(SUBJECT_NAME);
    expect(detail?.subject.curriculum).toBe("## Thema 1");
    expect(detail?.cards.length).toBeGreaterThan(0);
  });

  it("subjectDetail liefert null fuer ein unbekanntes Fach", async () => {
    expect(await subjectDetail("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  describe("mit anstehender Pruefung", () => {
    let examId: string;
    const dueDate = localISO(new Date(Date.now() + 5 * 86_400_000));

    beforeAll(async () => {
      const data: NewAssignment = {
        subjectId,
        type: "exam",
        title: "TST-Klausur",
        dueDate,
      };
      const [row] = await db.insert(assignments).values(data).returning();
      examId = row.id;
    });

    afterAll(async () => {
      await db.delete(assignments).where(eq(assignments.id, examId));
    });

    it("subjectDetail liefert naechstePruefung und einen Lernplan", async () => {
      const detail = await subjectDetail(subjectId);
      expect(detail?.naechstePruefung?.dueDate).toBe(dueDate);
      expect(detail?.plan).not.toBeNull();
      expect(detail?.plan?.tageBis).toBe(5);
    });

    it("overview liefert dieselbe naechste Pruefung fuers Fach", async () => {
      const result = await overview();
      const entry = result.faecher.find((f) => f.subjectId === subjectId);
      expect(entry?.naechstePruefung?.dueDate).toBe(dueDate);
      expect(entry?.plan).not.toBeNull();
    });
  });
});
