import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, lessonNotes, schoolBlocks, subjects, type NewSchoolBlock } from "@/lib/db/schema";
import { expandWeek } from "@/lib/calendar-expand";

// --- Integrationstest gegen Neon --------------------------------------------

const D = "2099-01-07"; // Sentinel-Tag, kollidiert nicht mit echten Daten
const WD = (new Date(`${D}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=Mo

async function cleanup() {
  await db.delete(schoolBlocks).where(eq(schoolBlocks.date, D));
}

// Ohne DATABASE_URL gibt es nichts zu integrieren -- dann wird der ganze
// Block uebersprungen, statt dass beforeAll/afterAll gegen eine fehlende
// Verbindung laufen und den Testlauf rot faerben.
const mitDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!mitDb)("Wochen-Expansion (Integration, Neon)", () => {
  beforeAll(async () => {
    await cleanup();
    const rows: NewSchoolBlock[] = [
      { untisLessonId: "s2t4-reg", date: D, startTime: "08:00", endTime: "08:45", subject: "TST-Reg", status: "regular" },
      { untisLessonId: "s2t4-can", date: D, startTime: "10:00", endTime: "10:45", subject: "TST-Entfall", status: "cancelled" },
    ];
    const { upsertSchoolBlocks } = await import("@/lib/untis/sync");
    await upsertSchoolBlocks(rows);
  });

  afterAll(cleanup);

  it("expandiert Untis-Stunden am Tag", async () => {
    const range = await expandWeek(D);
    const day = range.days.find((d) => d.date === D);
    expect(day).toBeDefined();
    expect(day!.weekday).toBe(WD);

    const school = day!.events.filter((e) => e.source === "school");
    expect(school.length).toBe(2);
    expect(school.some((e) => e.status === "cancelled")).toBe(true);
  });

  it("setzt hasNote nur fuer Bloecke mit Stundennotiz", async () => {
    const [regBlock] = await db
      .select()
      .from(schoolBlocks)
      .where(eq(schoolBlocks.untisLessonId, "s2t4-reg"));
    await db.insert(lessonNotes).values({ schoolBlockId: regBlock.id, date: D, body: "Test-Notiz" });

    try {
      const range = await expandWeek(D);
      const day = range.days.find((d) => d.date === D)!;
      const noted = day.events.find((e) => e.refId === regBlock.id);
      const other = day.events.find((e) => e.refId !== regBlock.id);
      expect(noted?.hasNote).toBe(true);
      expect(other?.hasNote).toBe(false);
    } finally {
      await db.delete(lessonNotes).where(eq(lessonNotes.schoolBlockId, regBlock.id));
    }
  });
});

// hasAssignment: es gibt keine schoolBlockId an assignments -- der Treffer
// entsteht ueber Datum + Fach (siehe assignmentDueBlockIds in
// lib/assignment-store.ts). Eigener Sentinel-Tag, unabhaengig von D oben.
const D3 = "2099-01-08";

describe.skipIf(!mitDb)("Wochen-Expansion: hasAssignment (Integration, Neon)", () => {
  async function cleanup3() {
    await db.delete(schoolBlocks).where(eq(schoolBlocks.date, D3));
    await db.delete(assignments).where(eq(assignments.title, "TST-Aufgabe"));
    await db.delete(subjects).where(eq(subjects.name, "TST-Faelligkeitsfach"));
  }

  beforeAll(async () => {
    await cleanup3();
    const rows: NewSchoolBlock[] = [
      { untisLessonId: "s2t4-due", date: D3, startTime: "08:00", endTime: "08:45", subject: "TST-Faelligkeitsfach", status: "regular" },
      { untisLessonId: "s2t4-nodue", date: D3, startTime: "10:00", endTime: "10:45", subject: "TST-Faelligkeitsfach-Anders", status: "regular" },
    ];
    const { upsertSchoolBlocks } = await import("@/lib/untis/sync");
    await upsertSchoolBlocks(rows);

    const [subject] = await db
      .insert(subjects)
      .values({ name: "TST-Faelligkeitsfach", untisSubject: "TST-Faelligkeitsfach" })
      .returning();
    await db.insert(assignments).values({
      title: "TST-Aufgabe",
      type: "homework",
      subjectId: subject.id,
      dueDate: D3,
    });
  });

  afterAll(cleanup3);

  it("setzt hasAssignment nur an der Stunde mit passendem Fach und Faelligkeitsdatum", async () => {
    const range = await expandWeek(D3);
    const day = range.days.find((d) => d.date === D3)!;
    const due = day.events.find((e) => e.title === "TST-Faelligkeitsfach");
    const other = day.events.find((e) => e.title === "TST-Faelligkeitsfach-Anders");
    expect(due?.hasAssignment).toBe(true);
    expect(other?.hasAssignment).toBe(false);
  });
});
