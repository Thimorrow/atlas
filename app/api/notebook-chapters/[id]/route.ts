import { NextResponse } from "next/server";
import { parseNotebookChapter, readNotebookBody, renameNotebookChapter } from "@/lib/notebook-store";
import { isUuid } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Kapitel nicht gefunden." }, { status: 404 });
  const parsed = parseNotebookChapter(await readNotebookBody(req));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const chapter = await renameNotebookChapter(id, parsed.title);
  return chapter ? NextResponse.json({ chapter }) : NextResponse.json({ error: "Kapitel nicht gefunden." }, { status: 404 });
}
