import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolBlocks, type NewSchoolBlock } from "@/lib/db/schema";
import { createManualEvent, createRoutine, deleteManualEvent, deleteRoutine } from "@/lib/calendar-store";
import { expandWeek } from "@/lib/calendar-expand";

// --- Integrationstest gegen Neon --------------------------------------------

const D = "2099-01-07"; // Sentinel-Tag, kollidiert nicht mit echten Daten
const WD = (new Date(`${D}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=Mo

let routineId = "";
let flexId = "";
let manualId = "";
let coloredId = "";
let allDayId = "";

async function cleanup() {
  await db.delete(schoolBlocks).where(eq(schoolBlocks.date, D));
  if (routineId) await deleteRoutine(routineId).catch(() => {});
  if (flexId) await deleteRoutine(flexId).catch(() => {});
  if (manualId) await deleteManualEvent(manualId).catch(() => {});
  if (coloredId) await deleteManualEvent(coloredId).catch(() => {});
  if (allDayId) await deleteManualEvent(allDayId).catch(() => {});
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

    const r = await createRoutine({ title: "TST-Klavier", type: "fixed", weekday: WD, startTime: "17:00", endTime: "18:00" });
    routineId = r.id;
    const f = await createRoutine({ title: "TST-Joggen", type: "flexible_goal", targetPerWeek: 3 });
    flexId = f.id;
    const m = await createManualEvent({ title: "TST-Zahnarzt", date: D, startTime: "12:00", endTime: "12:30" });
    manualId = m.id;
    const c = await createManualEvent({ title: "TST-Kirche", date: D, startTime: "14:00", endTime: "15:00", color: "#7c3aed", location: "St.-Marien" });
    coloredId = c.id;
    const a = await createManualEvent({ title: "TST-Geburtstag", date: D, startTime: "00:00", endTime: "23:59", allDay: true });
    allDayId = a.id;
  });

  afterAll(cleanup);

  it("fuehrt Routine, manuelles Event und Untis-Stunden am Tag zusammen", async () => {
    const range = await expandWeek(D);
    const day = range.days.find((d) => d.date === D);
    expect(day).toBeDefined();
    expect(day!.weekday).toBe(WD);

    expect(day!.events.some((e) => e.source === "routine" && e.refId === routineId)).toBe(true);
    expect(day!.events.some((e) => e.source === "manual" && e.refId === manualId)).toBe(true);
    const school = day!.events.filter((e) => e.source === "school");
    expect(school.length).toBe(2);
    expect(school.some((e) => e.status === "cancelled")).toBe(true);

    // flexible_goal liegt separat, nicht auf der Timeline
    expect(range.flexibleGoals.some((g) => g.routineId === flexId)).toBe(true);
    expect(day!.events.some((e) => e.refId === flexId)).toBe(false);
  });

  it("manuelles Event traegt eigene Farbe + Ort durch die Expansion", async () => {
    const range = await expandWeek(D);
    const day = range.days.find((d) => d.date === D)!;
    const colored = day.events.find((e) => e.refId === coloredId);
    expect(colored).toBeDefined();
    expect(colored!.color).toBe("#7c3aed");
    expect(colored!.location).toBe("St.-Marien");
  });
});
