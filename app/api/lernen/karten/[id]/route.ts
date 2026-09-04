import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { deleteCard, updateCard } from "@/lib/study-store";
import { CARD_KINDS, type CardKind } from "@/lib/lernen-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MAX_LEN = 2000;

function notFound() {
  return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });
}

// PATCH /api/lernen/karten/[id] -- { question?, answer?, topicId?, kind?, archivedAt? }
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const body = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Ungueltiger Request-Body." }, { status: 400 });
  }

  const { question, answer, topicId, kind, archivedAt } = body as Record<string, unknown>;
  const patch: {
    question?: string;
    answer?: string;
    topicId?: string | null;
    kind?: CardKind;
    archivedAt?: string | null;
  } = {};

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
      return NextResponse.json({ error: `answer darf hoechstens ${MAX_LEN} Zeichen lang sein.` }, { status: 400 });
    }
    patch.answer = answer;
  }
  if (topicId !== undefined) {
    if (topicId !== null && (typeof topicId !== "string" || !isUuid(topicId))) {
      return NextResponse.json({ error: "topicId muss eine gueltige Themen-ID oder null sein." }, { status: 400 });
    }
    patch.topicId = topicId;
  }
  if (kind !== undefined) {
    if (!(CARD_KINDS as readonly string[]).includes(kind as string)) {
      return NextResponse.json({ error: `kind muss eine von ${CARD_KINDS.join(", ")} sein.` }, { status: 400 });
    }
    patch.kind = kind as CardKind;
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
