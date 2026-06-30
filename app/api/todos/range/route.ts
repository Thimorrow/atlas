import { NextResponse } from "next/server";
import { getRangeView } from "@/lib/todo-expand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ?start=&end= (beide YYYY-MM-DD, inklusiv) -> pro Tag die konkret dort liegenden
// Aufgaben. Fuer die subtile Kalender-Integration (Wochen-Raster).
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const start = params.get("start");
  const end = params.get("end");
  if (!start || !end || !DATE_RE.test(start) || !DATE_RE.test(end)) {
    return NextResponse.json({ error: "start/end (YYYY-MM-DD) required" }, { status: 400 });
  }
  if (end < start) {
    return NextResponse.json({ error: "end before start" }, { status: 400 });
  }
  return NextResponse.json({ days: await getRangeView(start, end) });
}
