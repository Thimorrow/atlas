import { NextResponse } from "next/server";
import { completeAssignment, uncompleteAssignment } from "@/lib/assignment-store";
import { isUuid } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Jede Antwort frisch bauen: ein NextResponse traegt einen Body-Stream,
// der sich nur einmal lesen laesst.
function notFound() {
  return NextResponse.json({ error: "Aufgabe nicht gefunden." }, { status: 404 });
}

type Ctx = { params: Promise<{ id: string }> };

// POST -- abhaken. Zweiter Aufruf ist idempotent, completedAt bleibt stehen.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const assignment = await completeAssignment(id);
  if (!assignment) return notFound();
  return NextResponse.json({ assignment });
}

// DELETE -- Haken wieder entfernen.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const assignment = await uncompleteAssignment(id);
  if (!assignment) return notFound();
  return NextResponse.json({ assignment });
}
