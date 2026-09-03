import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { parseCount } from "@/lib/participation";
import {
  deleteParticipation,
  getParticipation,
  saveParticipation,
} from "@/lib/participation-store";
import { schoolBlockExists } from "@/lib/lesson-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Jede Antwort frisch bauen: ein NextResponse traegt einen Body-Stream,
// der sich nur einmal lesen laesst.
function notFound() {
  return NextResponse.json({ error: "Stunde nicht gefunden." }, { status: 404 });
}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/lessons/[id]/participation -- { participation: { id, count, updatedAt } | null }
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await schoolBlockExists(id))) return notFound();

  const participation = await getParticipation(id);
  return NextResponse.json({
    participation: participation ? { id: participation.id, count: participation.count, updatedAt: participation.updatedAt } : null,
  });
}

// PUT /api/lessons/[id]/participation -- { count: number }. Anders als bei der
// Notiz loescht count 0 NICHT -- eine erfasste 0 ist ein echter Datenpunkt.
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await schoolBlockExists(id))) return notFound();

  const json = await req.json().catch(() => null);
  if (typeof json !== "object" || json === null) {
    return NextResponse.json({ error: "Der Body muss ein Objekt sein." }, { status: 400 });
  }
  const parsed = parseCount((json as Record<string, unknown>).count);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const participation = await saveParticipation(id, parsed.value);
  return NextResponse.json({
    participation: participation ? { id: participation.id, count: participation.count, updatedAt: participation.updatedAt } : null,
  });
}

// DELETE /api/lessons/[id]/participation -- "nicht erfasst", die Zeile geht komplett weg.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await schoolBlockExists(id))) return notFound();

  await deleteParticipation(id);
  return NextResponse.json({ ok: true });
}
