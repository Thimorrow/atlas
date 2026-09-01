import { NextResponse } from "next/server";
import { createNote, getSubject, isUuid, listNotes, parseNewNote } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Jede Antwort frisch bauen: ein NextResponse traegt einen Body-Stream,
// der sich nur einmal lesen laesst.
function notFound() {
  return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });
}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/subjects/[id]/notes -- neueste zuerst.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await getSubject(id))) return notFound();
  return NextResponse.json({ notes: await listNotes(id) });
}

// POST /api/subjects/[id]/notes -- { title, body? }
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await getSubject(id))) return notFound();

  const body = await req.json().catch(() => null);
  const parsed = parseNewNote(body, id);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  return NextResponse.json({ note: await createNote(parsed.value) }, { status: 201 });
}
