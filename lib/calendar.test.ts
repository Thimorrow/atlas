import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolBlocks, type NewSchoolBlock } from "@/lib/db/schema";
import { createManualEvent, createRoutine, deleteManualEvent, deleteRoutine } from "@/lib/calendar-store";
import { expandWeek } from "@/lib/calendar-expand";
import { attachFreeSlots, freeSlotsForDay } from "@/lib/calendar-freeslots";
import type { CalendarEvent } from "@/lib/calendar-expand";

// --- Pure Unit-Tests: freeSlotsForDay ---------------------------------------

function ev(partial: Partial<CalendarEvent> & { startTime: string }): CalendarEvent {
  return {
    source: "manual",
    refId: "x",
    date: "2026-01-01",
    endTime: null,
    title: "t",
    color: null,
    ...partial,
  };
}

describe("freeSlotsForDay", () => {
  it("cancelled-Schulstunde zaehlt als frei", () => {
    const events: CalendarEvent[] = [
      ev({ source: "school", startTime: "08:00", endTime: "09:00", status: "regular" }),
      ev({ source: "school", startTime: "10:00", endTime: "11:00", status: "cancelled" }),
    ];
    const slots = freeSlotsForDay(events, "2026-01-01");
    // busy nur 08:00-09:00 -> frei 06:00-08:00 und 09:00-23:00 (cancelled mittendrin)
    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({ startTime: "06:00", endTime: "08:00", minutes: 120 });
    expect(slots[1]).toMatchObject({ startTime: "09:00", endTime: "23:00" });
    const coversCancelled = slots.some((s) => s.startTime <= "10:00" && s.endTime >= "11:00");
    expect(coversCancelled).toBe(true);
  });

  it("min-Filter wirft zu kurze Luecken weg", () => {
    const events: CalendarEvent[] = [
      ev({ source: "school", startTime: "06:00", endTime: "07:55", status: "regular" }),
      ev({ source: "school", startTime: "08:00", endTime: "23:00", status: "regular" }),
    ];
    // Luecke 07:55-08:00 = 5 min < 15 -> kein Slot
    expect(freeSlotsForDay(events, "2026-01-01")).toHaveLength(0);
  });

  it("offene Routine (endTime null) blockiert bis Tagesende", () => {
    const events: CalendarEvent[] = [
      ev({ source: "routine", startTime: "14:00", endTime: null, openEnded: true }),
    ];
    const slots = freeSlotsForDay(events, "2026-01-01");
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ startTime: "06:00", endTime: "14:00" });
  });

  it("eigenes Fenster + min ueberschreibbar", () => {
    const slots = freeSlotsForDay([], "2026-01-01", { dayStart: "09:00", dayEnd: "12:00", minMinutes: 60 });
    expect(slots).toEqual([{ date: "2026-01-01", startTime: "09:00", endTime: "12:00", minutes: 180 }]);
  });
});

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

describe("Wochen-Expansion + FreeSlots (Integration, Neon)", () => {
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
    const range = attachFreeSlots(await expandWeek(D));
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
    const range = attachFreeSlots(await expandWeek(D));
    const day = range.days.find((d) => d.date === D)!;
    const colored = day.events.find((e) => e.refId === coloredId);
    expect(colored).toBeDefined();
    expect(colored!.color).toBe("#7c3aed");
    expect(colored!.location).toBe("St.-Marien");
  });

  it("Ganztag-Event: allDay=true und blockiert keine freie Luecke", async () => {
    const range = attachFreeSlots(await expandWeek(D));
    const day = range.days.find((d) => d.date === D)!;
    const allDay = day.events.find((e) => e.refId === allDayId);
    expect(allDay).toBeDefined();
    expect(allDay!.allDay).toBe(true);
    // 00:00-23:59 wuerde sonst den ganzen Tag belegen -> es muss trotzdem freie
    // Luecken geben (z.B. am spaeten Nachmittag, nichts liegt nach 18:00).
    expect(day.freeSlots.some((f) => f.startTime >= "18:00")).toBe(true);
  });

  it("Entfall erzeugt eine freie Luecke, die regulaere Stunde nicht", async () => {
    const range = attachFreeSlots(await expandWeek(D));
    const day = range.days.find((d) => d.date === D)!;
    const covers = (s: string, e: string) =>
      day.freeSlots.some((f) => f.startTime <= s && f.endTime >= e);
    expect(covers("10:00", "10:45")).toBe(true); // cancelled -> frei
    expect(covers("08:00", "08:45")).toBe(false); // regular -> belegt
    expect(covers("12:00", "12:30")).toBe(false); // manuelles Event -> belegt
  });
});
