import { NextResponse } from "next/server";
import {
  deleteGrade,
  getGrade,
  listGrades,
  parseGradePatch,
  summarize,
  updateGrade,
} from "@/lib/grade-store";
import { getSubject, isUuid } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json({ error: "Note nicht gefunden." }, { status: 404 });
}

type Ctx = { params: Promise<{ id: string }> };

// Der Schnitt des betroffenen Fachs haengt an jeder Aenderung. Er wird hier
// einmal nachgeladen, damit der Client ihn nicht selbst nachrechnen muss --
// die native App bekaeme sonst eine zweite, eigene Rechnung.
async function summaryFor(subjectId: string) {
  const [subject, rows] = await Promise.all([getSubject(subjectId), listGrades(subjectId)]);
  return summarize(rows, subject?.oralWeight ?? 50);
}

// PATCH /api/grades/[id] -- { points?, label?, kind?, date?, weight? }
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const body = await req.json().catch(() => null);
  const parsed = parseGradePatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const grade = await updateGrade(id, parsed.value);
  if (!grade) return notFound();
  return NextResponse.json({ grade, summary: await summaryFor(grade.subjectId) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  // Vor dem Loeschen lesen: danach ist nicht mehr zu erfahren, zu welchem Fach
  // die Note gehoerte, und ohne das gaebe es keinen neuen Schnitt.
  const existing = await getGrade(id);
  if (!existing) return notFound();
  if (!(await deleteGrade(id))) return notFound();

  return NextResponse.json({ ok: true, summary: await summaryFor(existing.subjectId) });
}
