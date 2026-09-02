import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolBlocks } from "@/lib/db/schema";
import { lessonToSchoolBlock, type UntisLesson } from "./adapter";
import { upsertSchoolBlocks } from "./sync";

// Integrationstest gegen die echte Neon-DB. Eigene Test-Stunden mit Sentinel-
// Datum + erkennbarer untisLessonId, danach wieder aufgeraeumt.
const TEST_DATE = 20990105; // 2099-01-05, kollidiert nicht mit echten Daten
const TEST_DATE_ISO = "2099-01-05";

function makeLessons(): UntisLesson[] {
  return [
    { id: 900001, date: TEST_DATE, startTime: 800, endTime: 845, su: [{ name: "TST-Mathe" }], ro: [{ name: "T1" }], te: [{ name: "Tx" }] },
    { id: 900002, date: TEST_DATE, startTime: 850, endTime: 935, su: [{ name: "TST-Bio" }], ro: [{ name: "T2" }], te: [{ name: "Ty" }], code: "cancelled" },
  ];
}

async function cleanup() {
  await db.delete(schoolBlocks).where(eq(schoolBlocks.date, TEST_DATE_ISO));
}

describe("upsertSchoolBlocks (Integration, Neon)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("schreibt SchoolBlocks (inkl. Entfall) und liefert sie korrekt zurueck", async () => {
    const rows = makeLessons().map((l) => lessonToSchoolBlock(l));
    const n = await upsertSchoolBlocks(rows);
    expect(n).toBe(2);

    const stored = await db
      .select()
      .from(schoolBlocks)
      .where(eq(schoolBlocks.date, TEST_DATE_ISO));

    expect(stored).toHaveLength(2);

    const bio = stored.find((b) => b.untisLessonId === "900002");
    expect(bio?.status).toBe("cancelled"); // Entfall korrekt persistiert
    expect(bio?.subject).toBe("TST-Bio");

    const mathe = stored.find((b) => b.untisLessonId === "900001");
    expect(mathe?.status).toBe("regular");
    // Postgres time-Spalte liefert HH:MM:SS zurueck (Insert war "08:00").
    expect(mathe?.startTime).toBe("08:00:00");
  });

  it("ist idempotent: Re-Sync erzeugt kein Duplikat, aktualisiert geaenderte Felder", async () => {
    // gleiche Stunde 900001, jetzt mit Raumwechsel + Vertretung
    const changed = lessonToSchoolBlock({
      id: 900001,
      date: TEST_DATE,
      startTime: 800,
      endTime: 845,
      su: [{ name: "TST-Mathe" }],
      ro: [{ name: "T9" }],
      te: [{ name: "Tz" }],
      code: "irregular",
    });
    await upsertSchoolBlocks([changed]);

    const stored = await db
      .select()
      .from(schoolBlocks)
      .where(and(eq(schoolBlocks.untisLessonId, "900001"), eq(schoolBlocks.date, TEST_DATE_ISO)));

    expect(stored).toHaveLength(1); // kein Duplikat
    expect(stored[0].room).toBe("T9"); // Update durchgeschlagen
    expect(stored[0].status).toBe("substituted");
  });

  it("ignoriert leere Eingaben", async () => {
    expect(await upsertSchoolBlocks([])).toBe(0);
  });
});
