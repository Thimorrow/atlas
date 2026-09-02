import { NextResponse } from "next/server";
import {
  createGrade,
  listGrades,
  parseNewGrade,
  subjectExists,
  summarize,
} from "@/lib/grade-store";
import { getSubject, isUuid } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });
}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/subjects/[id]/grades -- { grades, summary }
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const subject = await getSubject(id);
  if (!subject) return notFound();

  const rows = await listGrades(id);
  return NextResponse.json({ grades: rows, summary: summarize(rows, subject.oralWeight) });
}

// POST /api/subjects/[id]/grades -- { points, label, kind?, date, weight? }
//
// Gibt den neuen Schnitt gleich mit zurueck: die Oberflaeche soll nach dem
// Eintragen nicht noch einmal fragen muessen, was sich dadurch geaendert hat.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await subjectExists(id))) return notFound();

  const body = await req.json().catch(() => null);
  const parsed = parseNewGrade(body, id);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const grade = await createGrade(parsed.value);
  const subject = await getSubject(id);
  const rows = await listGrades(id);
  return NextResponse.json(
    { grade, summary: summarize(rows, subject?.oralWeight ?? 50) },
    { status: 201 },
  );
}
