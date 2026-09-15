import { NextResponse } from "next/server";
import { deleteNotebookPage, getNotebookPage, notebookChapterBelongsToSubject, notebookFilesBelongToSubject, parseNotebookPatch, readNotebookBody, updateNotebookPage } from "@/lib/notebook-store";
import { isObj, isUuid } from "@/lib/subject-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const missing = () => NextResponse.json({ error: "Heftseite nicht gefunden." }, { status: 404 });

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return missing();
  const page = await getNotebookPage(id);
  return page ? NextResponse.json({ page }, { headers: { "Cache-Control": "no-store" } }) : missing();
}
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return missing();
  const existing = await getNotebookPage(id);
  if (!existing) return missing();
  const body = await readNotebookBody(req);
  const expectedUpdatedAt = isObj(body) ? body.expectedUpdatedAt : undefined;
  if (expectedUpdatedAt !== undefined && (typeof expectedUpdatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(expectedUpdatedAt) || !Number.isFinite(Date.parse(expectedUpdatedAt)))) return NextResponse.json({ error: "Ungültiger Speicherstand." }, { status: 400 });
  const parsed = parseNotebookPatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.value.chapterId && !(await notebookChapterBelongsToSubject(existing.subjectId, parsed.value.chapterId))) return NextResponse.json({ error: "Dieses Kapitel gehört nicht zu diesem Fach." }, { status: 400 });
  if (parsed.value.content && !(await notebookFilesBelongToSubject(existing.subjectId, parsed.value.content))) return NextResponse.json({ error: "Eine Datei gehört nicht zu diesem Fach oder hat das falsche Format." }, { status: 400 });
  const page = await updateNotebookPage(id, parsed.value, (expectedUpdatedAt as string | undefined) ?? existing.updatedAt);
  if (page) return NextResponse.json({ page });
  const current = await getNotebookPage(id);
  return current ? NextResponse.json({ error: "Diese Seite wurde auf einem anderen Gerät geändert. Dein Entwurf bleibt erhalten.", page: current }, { status: 409 }) : missing();
}
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id) || !(await deleteNotebookPage(id))) return missing();
  return NextResponse.json({ ok: true });
}
