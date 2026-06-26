import { NextResponse } from "next/server";
import { expandDay, expandWeek } from "@/lib/calendar-expand";
import { attachFreeSlots, DEFAULT_FREE_SLOT_OPTIONS } from "@/lib/calendar-freeslots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/calendar?date=YYYY-MM-DD&view=week|day&dayStart=&dayEnd=&min=
// view default = week, date default = heute. FreeSlots werden pro Tag angehaengt.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? todayISO();
  const view = url.searchParams.get("view") ?? "week";

  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (view !== "week" && view !== "day") {
    return NextResponse.json({ error: "view must be 'week' or 'day'" }, { status: 400 });
  }

  const dayStart = url.searchParams.get("dayStart");
  const dayEnd = url.searchParams.get("dayEnd");
  const min = url.searchParams.get("min");
  if (dayStart && !TIME_RE.test(dayStart)) {
    return NextResponse.json({ error: "dayStart must be HH:MM" }, { status: 400 });
  }
  if (dayEnd && !TIME_RE.test(dayEnd)) {
    return NextResponse.json({ error: "dayEnd must be HH:MM" }, { status: 400 });
  }
  const opt = {
    dayStart: dayStart ?? DEFAULT_FREE_SLOT_OPTIONS.dayStart,
    dayEnd: dayEnd ?? DEFAULT_FREE_SLOT_OPTIONS.dayEnd,
    minMinutes: min ? Number(min) : DEFAULT_FREE_SLOT_OPTIONS.minMinutes,
  };

  const range = view === "day" ? await expandDay(date) : await expandWeek(date);
  return NextResponse.json({ view, ...attachFreeSlots(range, opt) });
}
