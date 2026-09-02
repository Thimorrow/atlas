import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import {
  deleteLessonNote,
  getLessonNote,
  parseLessonNoteBody,
  saveLessonNote,
  schoolBlockExists,
} from "@/lib/lesson-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Jede Antwort frisch bauen: ein NextResponse traegt einen Body-Stream,
// der sich nur einmal lesen laesst.
function notFound() {
  return NextResponse.json({ error: "Stunde nicht gefunden." }, { status: 404 });
}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/lessons/[id]/note -- { note: { id, body, updatedAt } | null }
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await schoolBlockExists(id))) return notFound();

  const note = await getLessonNote(id);
  return NextResponse.json({
    note: note ? { id: note.id, body: note.body, updatedAt: note.updatedAt } : null,
  });
}

// PUT /api/lessons/[id]/note -- { body: string }. Ein nach trim() leerer Body
// loescht die Notiz statt eine leere Zeile zu speichern.
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await schoolBlockExists(id))) return notFound();

  const json = await req.json().catch(() => null);
  if (typeof json !== "object" || json === null) {
    return NextResponse.json({ error: "Der Body muss ein Objekt sein." }, { status: 400 });
  }
  const parsed = parseLessonNoteBody((json as Record<string, unknown>).body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const note = await saveLessonNote(id, parsed.value);
  return NextResponse.json({
    note: note ? { id: note.id, body: note.body, updatedAt: note.updatedAt } : null,
  });
}

// DELETE /api/lessons/[id]/note
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await schoolBlockExists(id))) return notFound();

  await deleteLessonNote(id);
  return NextResponse.json({ ok: true });
}
