import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolBlocks, type NewSchoolBlock } from "@/lib/db/schema";
import { findNextLessonDate, nextLessonDate } from "@/lib/next-lesson";

// --- Reine Logik, keine DB -- laeuft immer ----------------------------------

describe("nextLessonDate", () => {
  it("findet den Normalfall: die nächste stattfindende Stunde nach dem Termin", () => {
    const result = nextLessonDate(
      [
        { date: "2026-09-01", status: "regular" }, // vor dem Termin, zaehlt nicht
        { date: "2026-09-04", status: "regular" },
        { date: "2026-09-09", status: "regular" },
      ],
      "2026-09-02",
    );
    expect(result).toBe("2026-09-04");
  });

  it("liefert null, wenn keine weitere Stunde im bekannten Zeitraum liegt", () => {
    const result = nextLessonDate(
      [{ date: "2026-09-01", status: "regular" }],
      "2026-09-02",
    );
    expect(result).toBeNull();
  });

  it("liefert auch bei komplett leerer Liste null", () => {
    expect(nextLessonDate([], "2026-09-02")).toBeNull();
  });

  it("überspringt eine komplett ausgefallene nächste Stunde und nimmt die nächste stattfindende", () => {
    const result = nextLessonDate(
      [
        { date: "2026-09-04", status: "cancelled" },
        { date: "2026-09-09", status: "regular" },
      ],
      "2026-09-02",
    );
    expect(result).toBe("2026-09-09");
  });

  it("zählt mehrere Blöcke desselben Tages als einen Termin", () => {
    const result = nextLessonDate(
      [
        { date: "2026-09-04", status: "regular" },
        { date: "2026-09-04", status: "regular" },
        { date: "2026-09-04", status: "regular" },
      ],
      "2026-09-02",
    );
    expect(result).toBe("2026-09-04");
  });

  it("zählt einen Tag trotzdem, wenn nur EINE von mehreren Stunden dort ausfällt", () => {
    const result = nextLessonDate(
      [
        { date: "2026-09-04", status: "cancelled" },
        { date: "2026-09-04", status: "regular" },
      ],
      "2026-09-02",
    );
    expect(result).toBe("2026-09-04");
  });

  it("Tagesgrenze: der Termin-Tag selbst zählt nicht als 'danach'", () => {
    const result = nextLessonDate(
      [{ date: "2026-09-02", status: "regular" }],
      "2026-09-02",
    );
    expect(result).toBeNull();
  });

  it("Monats-/Jahresgrenze: Datumsvergleich bleibt korrekt über den Wechsel hinweg", () => {
    const result = nextLessonDate(
      [
        { date: "2026-01-05", status: "regular" },
        { date: "2025-12-30", status: "regular" }, // vor dem Termin, zaehlt nicht
      ],
      "2025-12-31",
    );
    expect(result).toBe("2026-01-05");
  });
});

// --- DB-Anbindung (Integration, Neon) ---------------------------------------

const mitDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!mitDb)("findNextLessonDate (Integration, Neon)", () => {
  const D0 = "2099-02-02"; // Ursprungsstunde
  const D1 = "2099-02-04"; // naechste (ausfallend)
  const D2 = "2099-02-09"; // naechste stattfindende

  async function cleanup() {
    await db.delete(schoolBlocks).where(eq(schoolBlocks.subject, "TST-Nächste"));
  }

  beforeAll(async () => {
    await cleanup();
    const rows: NewSchoolBlock[] = [
      { untisLessonId: "s2t4-nl-0", date: D0, startTime: "08:00", endTime: "08:45", subject: "TST-Nächste", status: "regular" },
      { untisLessonId: "s2t4-nl-1", date: D1, startTime: "08:00", endTime: "08:45", subject: "TST-Nächste", status: "cancelled" },
      { untisLessonId: "s2t4-nl-2", date: D2, startTime: "08:00", endTime: "08:45", subject: "TST-Nächste", status: "regular" },
    ];
    const { upsertSchoolBlocks } = await import("@/lib/untis/sync");
    await upsertSchoolBlocks(rows);
  });

  afterAll(cleanup);

  it("findet die nächste stattfindende Stunde über die DB, fällt an D1 aus -> D2", async () => {
    const [origin] = await db.select().from(schoolBlocks).where(eq(schoolBlocks.untisLessonId, "s2t4-nl-0"));
    const result = await findNextLessonDate(origin.id);
    expect(result).toBe(D2);
  });

  it("liefert null für eine unbekannte Stunde", async () => {
    const result = await findNextLessonDate("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});
