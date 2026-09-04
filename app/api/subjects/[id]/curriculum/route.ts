import { NextResponse } from "next/server";
import {
  HAND_QUELLE,
  deleteCurriculum,
  getSubject,
  isUuid,
  parseCurriculumBody,
  saveCurriculum,
  vorlageFuerFach,
} from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Jede Antwort frisch bauen: ein NextResponse traegt einen Body-Stream,
// der sich nur einmal lesen laesst.
function notFound() {
  return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });
}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/subjects/[id]/curriculum
// vorlage sagt der Oberflaeche, ob es zu diesem Fach ueberhaupt einen
// Kernlehrplan gibt -- ohne die Auskunft muesste sie einen Knopf anbieten,
// der bei manchen Faechern nichts findet.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const subject = await getSubject(id);
  if (!subject) return notFound();

  const vorlage = vorlageFuerFach(subject);
  return NextResponse.json({
    curriculum: subject.curriculum,
    curriculumSource: subject.curriculumSource,
    curriculumUpdatedAt: subject.curriculumUpdatedAt,
    vorlage: vorlage ? { fach: vorlage.fach } : null,
  });
}

// PUT /api/subjects/[id]/curriculum -- { body: string }. Ein nach trim()
// leerer Body loescht den Lehrplan.
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const json = await req.json().catch(() => null);
  if (typeof json !== "object" || json === null) {
    return NextResponse.json({ error: "Der Body muss ein Objekt sein." }, { status: 400 });
  }
  const parsed = parseCurriculumBody((json as Record<string, unknown>).body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const saved = await saveCurriculum(id, parsed.value, HAND_QUELLE);
  if (!saved) return notFound();
  return NextResponse.json(saved);
}

// DELETE /api/subjects/[id]/curriculum
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await getSubject(id))) return notFound();

  await deleteCurriculum(id);
  return NextResponse.json({ ok: true });
}
