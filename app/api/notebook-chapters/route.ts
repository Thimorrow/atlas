import { NextResponse } from "next/server";
import { createNotebookChapter, parseNotebookChapter, readNotebookBody } from "@/lib/notebook-store";
import { getSubject, isObj, isUuid } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readNotebookBody(req);
  if (!isObj(body) || typeof body.subjectId !== "string" || !isUuid(body.subjectId)) return NextResponse.json({ error: "Ungültiges Fach." }, { status: 400 });
  const parsed = parseNotebookChapter(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!(await getSubject(body.subjectId))) return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });
  return NextResponse.json({ chapter: await createNotebookChapter(body.subjectId, parsed.title) }, { status: 201 });
}
