import { NextResponse } from "next/server";
import { parseSetupBody, setupSubjects } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/subjects/setup -- { selected, all }. Ausgewaehlte aktiv, der Rest
// archiviert. Idempotent ueber untis_subject.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = parseSetupBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const subjects = await setupSubjects(parsed.value.selected, parsed.value.all);
  return NextResponse.json({ subjects }, { status: 201 });
}
