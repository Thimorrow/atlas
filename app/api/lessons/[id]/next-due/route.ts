import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { schoolBlockExists } from "@/lib/lesson-notes";
import { findNextLessonDate } from "@/lib/next-lesson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/lessons/[id]/next-due -- { dueDate: string | null }
// Fuer den "Aufgabe aus der Stunde"-Einstieg: die naechste Stunde desselben
// Fachs nach dieser hier, als Vorschlag fuer die Faelligkeit. null heisst
// ehrlich "nicht bekannt", nicht geraten.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Stunde nicht gefunden." }, { status: 404 });
  if (!(await schoolBlockExists(id))) return NextResponse.json({ error: "Stunde nicht gefunden." }, { status: 404 });

  const dueDate = await findNextLessonDate(id);
  return NextResponse.json({ dueDate });
}
