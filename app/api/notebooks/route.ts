import { NextResponse } from "next/server";
import { createNotebookPage, listNotebookPages, parseNotebookPatch, readNotebookBody } from "@/lib/notebook-store";
import { getSubject, isObj, isUuid } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const subjectId = new URL(req.url).searchParams.get("subjectId");
  if (!subjectId || !isUuid(subjectId) || !(await getSubject(subjectId))) return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });
  return NextResponse.json({ pages: await listNotebookPages(subjectId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const body = await readNotebookBody(req);
  if (!isObj(body) || typeof body.subjectId !== "string" || !isUuid(body.subjectId) || (body.id !== undefined && (typeof body.id !== "string" || !isUuid(body.id)))) return NextResponse.json({ error: "Ungültige Heftseite." }, { status: 400 });
  if (!(await getSubject(body.subjectId))) return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });
  const parsed = parseNotebookPatch({ title: body.title ?? "Neue Seite", paper: body.paper ?? "lined" });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const page = await createNotebookPage({ subjectId: body.subjectId, ...(body.id ? { id: body.id as string } : {}), title: parsed.value.title, paper: parsed.value.paper });
    return NextResponse.json({ page }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Diese Seiten-ID ist bereits vergeben.") return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
