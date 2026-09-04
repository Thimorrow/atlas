import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { createCards } from "@/lib/study-store";
import { getTutorConversation, markKartenAngelegt } from "@/lib/tutor/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/lernen/tutor/[id]/karten -- legt die im Fazit vorgeschlagenen
// Karten im Thema an (source manuell, sourceRef "tutor:<id>").
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Session nicht gefunden." }, { status: 404 });

  const conversation = await getTutorConversation(id);
  if (!conversation) return NextResponse.json({ error: "Session nicht gefunden." }, { status: 404 });

  if (!conversation.ergebnis) {
    return NextResponse.json({ error: "Noch kein Fazit." }, { status: 400 });
  }
  if (conversation.kartenAngelegt) {
    return NextResponse.json({ error: "Karten wurden schon angelegt." }, { status: 409 });
  }
  if (conversation.ergebnis.neueKarten.length === 0) {
    return NextResponse.json({ error: "Keine Karten vorgeschlagen." }, { status: 400 });
  }

  const cards = await createCards(
    conversation.subjectId,
    conversation.ergebnis.neueKarten.map((k) => ({ question: k.question, answer: k.answer, kind: k.kind ?? "wissen" })),
    "manuell",
    `tutor:${conversation.id}`,
    conversation.topicId,
  );
  await markKartenAngelegt(id);

  return NextResponse.json({ cards }, { status: 201 });
}
