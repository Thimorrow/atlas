import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolBlocks } from "@/lib/db/schema";
import { upcomingLessons } from "@/lib/subject-store";

describe.skipIf(!process.env.DATABASE_URL)("nächste Fachstunden", () => {
  const name = "TST-Upcoming-Review";
  const cleanup = () => db.delete(schoolBlocks).where(eq(schoolBlocks.subject, name));
  beforeAll(async () => {
    await cleanup();
    await db.insert(schoolBlocks).values([
      { untisLessonId: "TST-Upcoming", subject: name, date: "2026-09-07", startTime: "07:50", endTime: "09:20" },
      { untisLessonId: "TST-Upcoming-2", subject: name, date: "2026-09-07", startTime: "11:30", endTime: "13:00" },
      { untisLessonId: "TST-Upcoming", subject: name, date: "2026-09-08", startTime: "07:50", endTime: "09:20" },
    ]);
  });
  afterAll(cleanup);
  afterEach(() => vi.useRealTimers());

  it("zeigt abends ausschließlich zukünftige Termine", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-07T18:00:00Z"));
    expect((await upcomingLessons({ name, untisSubject: null })).map((l) => l.date)).toEqual(["2026-09-08"]);
  });

  it("vergleicht Uhrzeit und Tageswechsel in Europe/Berlin", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-07T08:00:00Z"));
    expect((await upcomingLessons({ name, untisSubject: null }))[0].startTime).toBe("11:30");
    vi.setSystemTime(new Date("2026-09-07T22:30:00Z"));
    expect((await upcomingLessons({ name, untisSubject: null }))[0].date).toBe("2026-09-08");
  });
});
