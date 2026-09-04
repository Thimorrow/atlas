import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { deleteTopic, updateTopic } from "@/lib/study-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MAX_TITLE_LEN = 200;
const MAX_SUMMARY_LEN = 20000;

function notFound() {
  return NextResponse.json({ error: "Thema nicht gefunden." }, { status: 404 });
}

// PATCH /api/lernen/themen/[id] -- { title?, summary?, assignmentId?, archivedAt? }
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const body = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Ungueltiger Request-Body." }, { status: 400 });
  }

  const { title, summary, assignmentId, archivedAt } = body as Record<string, unknown>;
  const patch: { title?: string; summary?: string; assignmentId?: string | null; archivedAt?: string | null } = {};

  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim() || title.length > MAX_TITLE_LEN) {
      return NextResponse.json(
        { error: `title muss ein Text von 1 bis ${MAX_TITLE_LEN} Zeichen sein.` },
        { status: 400 },
      );
    }
    patch.title = title.trim();
  }
  if (summary !== undefined) {
    if (typeof summary !== "string" || summary.length > MAX_SUMMARY_LEN) {
      return NextResponse.json({ error: `summary darf hoechstens ${MAX_SUMMARY_LEN} Zeichen lang sein.` }, { status: 400 });
    }
    patch.summary = summary;
  }
  if (assignmentId !== undefined) {
    if (assignmentId !== null && (typeof assignmentId !== "string" || !isUuid(assignmentId))) {
      return NextResponse.json({ error: "assignmentId muss eine gueltige ID oder null sein." }, { status: 400 });
    }
    patch.assignmentId = assignmentId;
  }
  if (archivedAt !== undefined) {
    if (archivedAt !== null && typeof archivedAt !== "string") {
      return NextResponse.json({ error: "archivedAt muss ein ISO-Datum oder null sein." }, { status: 400 });
    }
    patch.archivedAt = archivedAt;
  }

  const thema = await updateTopic(id, patch);
  if (!thema) return notFound();
  return NextResponse.json({ thema });
}

// DELETE /api/lernen/themen/[id] -- Karten behalten, topicId wird null.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await deleteTopic(id))) return notFound();
  return NextResponse.json({ ok: true });
}
