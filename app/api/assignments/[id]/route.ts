import { NextResponse } from "next/server";
import {
  deleteAssignment,
  getAssignment,
  parseAssignmentPatch,
  updateAssignment,
} from "@/lib/assignment-store";
import { isUuid } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Jede Antwort frisch bauen: ein NextResponse traegt einen Body-Stream,
// der sich nur einmal lesen laesst.
function notFound() {
  return NextResponse.json({ error: "Aufgabe nicht gefunden." }, { status: 404 });
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const assignment = await getAssignment(id);
  if (!assignment) return notFound();
  return NextResponse.json({ assignment });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const body = await req.json().catch(() => null);
  const parsed = await parseAssignmentPatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const assignment = await updateAssignment(id, parsed.value);
  if (!assignment) return notFound();
  return NextResponse.json({ assignment });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await deleteAssignment(id))) return notFound();
  return NextResponse.json({ ok: true });
}
