import { NextResponse } from "next/server";
import { createRoutine, listRoutines, parseNewRoutine } from "@/lib/calendar-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ routines: await listRoutines() });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = parseNewRoutine(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const routine = await createRoutine(parsed.value);
  return NextResponse.json({ routine }, { status: 201 });
}
