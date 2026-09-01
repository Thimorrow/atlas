import { NextResponse } from "next/server";
import {
  createAssignment,
  listAssignments,
  parseNewAssignment,
} from "@/lib/assignment-store";
import { isUuid } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/assignments?completed=1&subjectId=
export async function GET(req: Request) {
  const url = new URL(req.url);
  const subjectId = url.searchParams.get("subjectId");
  if (subjectId && !isUuid(subjectId)) {
    return NextResponse.json({ error: "subjectId ist keine gültige Fach-ID." }, { status: 400 });
  }

  const assignments = await listAssignments({
    includeCompleted: Boolean(url.searchParams.get("completed")),
    subjectId: subjectId ?? undefined,
  });
  return NextResponse.json({ assignments });
}

// POST /api/assignments -- { title, type?, subjectId?, untisSubject?, dueDate?, notes? }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = await parseNewAssignment(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  return NextResponse.json({ assignment: await createAssignment(parsed.value) }, { status: 201 });
}
