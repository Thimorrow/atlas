import { NextResponse } from "next/server";
import {
  deleteNote,
  getNote,
  isUuid,
  parseNotePatch,
  updateNote,
} from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Jede Antwort frisch bauen: ein NextResponse traegt einen Body-Stream,
// der sich nur einmal lesen laesst.
function notFound() {
  return NextResponse.json({ error: "Notiz nicht gefunden." }, { status: 404 });
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const note = await getNote(id);
  if (!note) return notFound();
  return NextResponse.json({ note });
}

// PATCH /api/notes/[id] -- { title?, body? }
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const body = await req.json().catch(() => null);
  const parsed = parseNotePatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const note = await updateNote(id, parsed.value);
  if (!note) return notFound();
  return NextResponse.json({ note });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await deleteNote(id))) return notFound();
  return NextResponse.json({ ok: true });
}
