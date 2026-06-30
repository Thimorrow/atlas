import { NextResponse } from "next/server";
import { getTodayView } from "@/lib/todo-expand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ?date= ist der lokale "heute" des Clients (YYYY-MM-DD). Fallback: Server-UTC.
export async function GET(req: Request) {
  const dateParam = new URL(req.url).searchParams.get("date");
  const today =
    dateParam && DATE_RE.test(dateParam)
      ? dateParam
      : new Date().toISOString().slice(0, 10);
  return NextResponse.json({ view: await getTodayView(today) });
}
