import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lessonNotes, schoolBlocks, subjects, type NewSchoolBlock } from "@/lib/db/schema";
import {
  getLessonNote,
  listSubjectLessonNotes,
  MAX_BODY_LEN,
  parseLessonNoteBody,
  saveLessonNote,
} from "@/lib/lesson-notes";

// --- Integrationstest gegen Neon --------------------------------------------

const D = "2099-01-09"; // Sentinel-Tag, kollidiert nicht mit echten Daten

async function cleanup() {
  await db.delete(schoolBlocks).where(eq(schoolBlocks.date, D)); // cascade raeumt lesson_notes mit
}

// Ohne DATABASE_URL gibt es nichts zu integrieren -- dann wird der ganze
// Block uebersprungen, statt dass beforeAll/afterAll gegen eine fehlende
// Verbindung laufen und den Testlauf rot faerben.
const mitDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!mitDb)("Stundennotizen: saveLessonNote (Integration, Neon)", () => {
  let blockId: string;

  beforeAll(async () => {
    await cleanup();
    const row: NewSchoolBlock = {
      untisLessonId: "s2t4-note",
      date: D,
      startTime: "08:00",
      endTime: "08:45",
      subject: "TST-Notiz",
      status: "regular",
    };
    const { upsertSchoolBlocks } = await import("@/lib/untis/sync");
    await upsertSchoolBlocks([row]);
    const [block] = await db.select().from(schoolBlocks).where(eq(schoolBlocks.date, D));
    blockId = block.id;
  });

  afterAll(cleanup);

  it("legt eine Notiz an und liefert sie ueber getLessonNote zurueck", async () => {
    const saved = await saveLessonNote(blockId, "Erste Fassung");
    expect(saved?.body).toBe("Erste Fassung");

    const loaded = await getLessonNote(blockId);
    expect(loaded?.body).toBe("Erste Fassung");
  });

  it("ist ein Upsert: zweimal PUT erzeugt keine zweite Zeile", async () => {
    await saveLessonNote(blockId, "Zweite Fassung");
    const rows = await db.select().from(lessonNotes).where(eq(lessonNotes.schoolBlockId, blockId));
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("Zweite Fassung");
  });

  it("loescht die Notiz, wenn der Body (nach trim) leer ist", async () => {
    const result = await saveLessonNote(blockId, "   ");
    expect(result).toBeNull();

    const rows = await db.select().from(lessonNotes).where(eq(lessonNotes.schoolBlockId, blockId));
    expect(rows).toHaveLength(0);
  });

  it("liefert null fuer eine unbekannte Stunde", async () => {
    const result = await saveLessonNote("00000000-0000-0000-0000-000000000000", "Text");
    expect(result).toBeNull();
  });
});

// Fach-Zuordnung: manuell angelegte Faecher (untisSubject = null, z.B. eine
// AG) matchen nur ueber den Namen -- genau wie subjectFor im Stundenplan
// (app/page.tsx). Ohne den Namens-Fallback in subjectIdFor blieb subjectId
// hier dauerhaft null.
const D2 = "2099-01-10"; // eigener Sentinel-Tag, unabhaengig vom Block oben

describe.skipIf(!mitDb)("Stundennotizen: Fach-Zuordnung (Integration, Neon)", () => {
  let blockId: string;
  let subjectId: string;

  async function cleanup2() {
    await db.delete(schoolBlocks).where(eq(schoolBlocks.date, D2));
    await db.delete(subjects).where(eq(subjects.name, "TST-Namensfach"));
  }

  beforeAll(async () => {
    await cleanup2();
    const row: NewSchoolBlock = {
      untisLessonId: "s2t4-name",
      date: D2,
      startTime: "09:00",
      endTime: "09:45",
      subject: "TST-Namensfach",
      status: "regular",
    };
    const { upsertSchoolBlocks } = await import("@/lib/untis/sync");
    await upsertSchoolBlocks([row]);
    const [block] = await db.select().from(schoolBlocks).where(eq(schoolBlocks.date, D2));
    blockId = block.id;

    // Manuell angelegtes Fach: untisSubject bleibt null, nur der Name matcht.
    const [subject] = await db
      .insert(subjects)
      .values({ name: "TST-Namensfach", untisSubject: null })
      .returning();
    subjectId = subject.id;
  });

  afterAll(cleanup2);

  it("loest subjectId ueber den Namen auf, wenn untisSubject nicht matcht", async () => {
    const saved = await saveLessonNote(blockId, "Notiz zum Namensfach");
    expect(saved).not.toBeNull();

    const [row] = await db.select().from(lessonNotes).where(eq(lessonNotes.schoolBlockId, blockId));
    expect(row.subjectId).toBe(subjectId);
  });

  it("listSubjectLessonNotes findet auch verwaiste Notizen (subjectId null) ueber den Namen", async () => {
    // subjectId hart auf null setzen -- simuliert eine Notiz, die entstand,
    // bevor es das Fach gab.
    await db.update(lessonNotes).set({ subjectId: null }).where(eq(lessonNotes.schoolBlockId, blockId));

    const notes = await listSubjectLessonNotes({ id: subjectId, untisSubject: null, name: "TST-Namensfach" });
    expect(notes.some((n) => n.schoolBlockId === blockId)).toBe(true);
  });
});

// Reine Validierung, ohne DB -- laeuft immer.
describe("parseLessonNoteBody", () => {
  it("akzeptiert normalen Text", () => {
    const parsed = parseLessonNoteBody("Alles klar.");
    expect(parsed.ok).toBe(true);
  });

  it("lehnt einen zu langen Body ab", () => {
    const parsed = parseLessonNoteBody("x".repeat(MAX_BODY_LEN + 1));
    expect(parsed.ok).toBe(false);
  });

  it("lehnt Nicht-Strings ab", () => {
    expect(parseLessonNoteBody(123).ok).toBe(false);
    expect(parseLessonNoteBody(null).ok).toBe(false);
    expect(parseLessonNoteBody(undefined).ok).toBe(false);
  });
});
