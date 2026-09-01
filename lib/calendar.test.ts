import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolBlocks, type NewSchoolBlock } from "@/lib/db/schema";
import { expandWeek } from "@/lib/calendar-expand";

// --- Integrationstest gegen Neon --------------------------------------------

const D = "2099-01-07"; // Sentinel-Tag, kollidiert nicht mit echten Daten
const WD = (new Date(`${D}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=Mo

async function cleanup() {
  await db.delete(schoolBlocks).where(eq(schoolBlocks.date, D));
}

describe("Wochen-Expansion (Integration, Neon)", () => {
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
});
