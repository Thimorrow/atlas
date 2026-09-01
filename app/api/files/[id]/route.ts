import { NextResponse } from "next/server";
import { deleteFile, isUuid } from "@/lib/subject-file-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const NOT_FOUND = () => NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NOT_FOUND();
  if (!(await deleteFile(id))) return NOT_FOUND();
  return NextResponse.json({ ok: true });
}
