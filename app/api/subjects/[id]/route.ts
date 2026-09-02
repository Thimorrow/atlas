import { NextResponse } from "next/server";
import { listAssignments } from "@/lib/assignment-store";
import { listGrades, summarize } from "@/lib/grade-store";
import {
  deleteSubject,
  getSubject,
  isUuid,
  listNotes,
  parseSubjectPatch,
  updateSubject,
  upcomingLessons,
} from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Jede Antwort frisch bauen: ein NextResponse traegt einen Body-Stream,
// der sich nur einmal lesen laesst.
function notFound() {
  return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });
}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/subjects/[id] -- Fach mit Notizen, Aufgaben, Noten und naechsten Stunden.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const subject = await getSubject(id);
  if (!subject) return notFound();

  const [notes, assignments, upcoming, grades] = await Promise.all([
    listNotes(id),
    listAssignments({ subjectId: id, includeCompleted: true }),
    upcomingLessons(subject),
    listGrades(id),
  ]);

  return NextResponse.json({
    subject,
    notes,
    assignments,
    upcoming,
    grades,
    gradeSummary: summarize(grades, subject.oralWeight),
  });
}

// PATCH /api/subjects/[id] -- archivedAt: "now" archiviert, null reaktiviert.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const body = await req.json().catch(() => null);
  const parsed = parseSubjectPatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const row = await updateSubject(id, parsed.value);
  if (!row) return notFound();
  return NextResponse.json({ subject: await getSubject(id) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await deleteSubject(id))) return notFound();
  return NextResponse.json({ ok: true });
}
