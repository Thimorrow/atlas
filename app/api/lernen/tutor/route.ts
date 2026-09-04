import { NextResponse } from "next/server";
import { isObj, isUuid } from "@/lib/subject-store";
import { botEnabled } from "@/lib/bot/model";
import { getCard, getTopic } from "@/lib/study-store";
import {
  appendTutorMessage,
  createTutorConversation,
  listTutorConversations,
} from "@/lib/tutor/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODI = ["lernen", "probe"] as const;

// POST /api/lernen/tutor -- { topicId, modus?, cardId? } -> legt eine neue
// Tutor-Session an. Reihenfolge der Pruefungen siehe TUTOR-SPEC.md "API".
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  if (!isObj(body) || typeof body.topicId !== "string" || !isUuid(body.topicId)) {
    return NextResponse.json({ error: "topicId fehlt oder ist ungueltig." }, { status: 400 });
  }
  if (body.modus !== undefined && !(MODI as readonly string[]).includes(body.modus as string)) {
    return NextResponse.json({ error: "modus muss lernen oder probe sein." }, { status: 400 });
  }
  if (body.cardId !== undefined && body.cardId !== null) {
    if (typeof body.cardId !== "string" || !isUuid(body.cardId)) {
      return NextResponse.json({ error: "cardId ist ungueltig." }, { status: 400 });
    }
  }

  if (!botEnabled()) {
    return NextResponse.json({ error: "Der Bot ist nicht eingerichtet (ZAI_API_KEY fehlt)." }, { status: 503 });
  }

  const topic = await getTopic(body.topicId);
  if (!topic) return NextResponse.json({ error: "Thema nicht gefunden." }, { status: 404 });

  const cardId = typeof body.cardId === "string" ? body.cardId : undefined;
  let card;
  if (cardId) {
    card = await getCard(cardId);
    if (!card) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });
  }

  const modus = (body.modus as "lernen" | "probe" | undefined) ?? "lernen";
  const conversation = await createTutorConversation({
    topicId: topic.id,
    subjectId: topic.subjectId,
    modus,
    cardId: cardId ?? null,
  });

  if (card) {
    await appendTutorMessage(conversation.id, {
      role: "user",
      content: `Ich hänge bei dieser Frage: ${card.question}`,
    });
  }

  return NextResponse.json({ conversation }, { status: 201 });
}

// GET /api/lernen/tutor?topicId= -- Sessions eines Themas, neueste zuerst.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const topicId = searchParams.get("topicId");
  if (!topicId || !isUuid(topicId)) {
    return NextResponse.json({ error: "topicId fehlt oder ist ungueltig." }, { status: 400 });
  }

  const conversations = await listTutorConversations(topicId);
  const result = conversations.map((c) => {
    const aufgaben = c.checkliste?.aufgaben ?? [];
    const erledigt = aufgaben.filter((a) => a.status !== "offen").length;
    return {
      id: c.id,
      modus: c.modus,
      createdAt: c.createdAt,
      endedAt: c.endedAt,
      ergebnis: c.ergebnis,
      checklisteFortschritt: { erledigt, gesamt: aufgaben.length },
    };
  });

  return NextResponse.json({ conversations: result });
}
