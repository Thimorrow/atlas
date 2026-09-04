import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { deleteCard, updateCard } from "@/lib/study-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MAX_LEN = 2000;

function notFound() {
  return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });
}

// PATCH /api/lernen/karten/[id] -- { question?, answer?, archivedAt? }
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const body = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const { question, answer, archivedAt } = body as Record<string, unknown>;
  const patch: { question?: string; answer?: string; archivedAt?: string | null } = {};

  if (question !== undefined) {
    if (typeof question !== "string" || !question.trim() || question.length > MAX_LEN) {
      return NextResponse.json(
        { error: `question muss ein Text von 1 bis ${MAX_LEN} Zeichen sein.` },
        { status: 400 },
      );
    }
    patch.question = question.trim();
  }
  if (answer !== undefined) {
    if (typeof answer !== "string" || answer.length > MAX_LEN) {
      return NextResponse.json({ error: `answer darf höchstens ${MAX_LEN} Zeichen lang sein.` }, { status: 400 });
    }
    patch.answer = answer;
  }
  if (archivedAt !== undefined) {
    if (archivedAt !== null && typeof archivedAt !== "string") {
      return NextResponse.json({ error: "archivedAt muss ein ISO-Datum oder null sein." }, { status: 400 });
    }
    patch.archivedAt = archivedAt;
  }

  const card = await updateCard(id, patch);
  if (!card) return notFound();
  return NextResponse.json({ card });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  if (!(await deleteCard(id))) return notFound();
  return NextResponse.json({ ok: true });
}
