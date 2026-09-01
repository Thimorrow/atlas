import { NextResponse } from "next/server";
import { expandDay, expandWeek, isRealDate } from "@/lib/calendar-expand";

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

  // Das Muster allein genuegt nicht. "2026-13-99" passt darauf und liess die
  // Route danach mit einem ungefangenen RangeError und leerem Rumpf abstuerzen,
  // "2026-02-30" rutschte still auf den 2. Maerz durch. Beides endet jetzt hier.
  if (!DATE_RE.test(date) || !isRealDate(date)) {
    return NextResponse.json(
      { error: "date muss ein gueltiges Datum im Format JJJJ-MM-TT sein." },
      { status: 400 },
    );
  }
  if (view !== "week" && view !== "day") {
    return NextResponse.json({ error: "view muss 'week' oder 'day' sein." }, { status: 400 });
  }

  const range = view === "day" ? await expandDay(date) : await expandWeek(date);
  return NextResponse.json({ view, ...range });
}
