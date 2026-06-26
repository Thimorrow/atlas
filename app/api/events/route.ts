import { NextResponse } from "next/server";
import { createManualEvent, listManualEvents, parseNewManualEvent } from "@/lib/calendar-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ events: await listManualEvents() });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = parseNewManualEvent(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const event = await createManualEvent(parsed.value);
  return NextResponse.json({ event }, { status: 201 });
}
