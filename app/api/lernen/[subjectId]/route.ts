import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { subjectDetail } from "@/lib/study-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ subjectId: string }> };

// GET /api/lernen/[subjectId] -- Fach mit Karten, Fortschritt und Lernplan.
export async function GET(_req: Request, { params }: Ctx) {
  const { subjectId } = await params;
  if (!isUuid(subjectId)) return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });

  const detail = await subjectDetail(subjectId);
  if (!detail) return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });
  return NextResponse.json(detail);
}
