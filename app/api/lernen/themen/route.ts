import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { createTopic } from "@/lib/study-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/lernen/themen -- { subjectId, title, assignmentId? } legt ein
// Thema an.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Ungueltiger Request-Body." }, { status: 400 });
  }

  const { subjectId, title, assignmentId } = body as Record<string, unknown>;
  if (typeof subjectId !== "string" || !isUuid(subjectId)) {
    return NextResponse.json({ error: "subjectId ist keine gueltige Fach-ID." }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title darf nicht leer sein." }, { status: 400 });
  }
  if (assignmentId !== undefined && assignmentId !== null) {
    if (typeof assignmentId !== "string" || !isUuid(assignmentId)) {
      return NextResponse.json({ error: "assignmentId muss eine gueltige ID oder null sein." }, { status: 400 });
    }
  }

  const thema = await createTopic({
    subjectId,
    title: title.trim(),
    assignmentId: (assignmentId as string | null | undefined) ?? null,
  });
  return NextResponse.json({ thema }, { status: 201 });
}
