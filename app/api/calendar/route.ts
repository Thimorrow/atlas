import { NextResponse } from "next/server";
import { expandDay, expandWeek } from "@/lib/calendar-expand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/calendar?date=YYYY-MM-DD&view=week|day
// view default = week, date default = heute.
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

  const range = view === "day" ? await expandDay(date) : await expandWeek(date);
  return NextResponse.json({ view, ...range });
}
